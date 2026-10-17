import "server-only";

import { randomUUID } from "node:crypto";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import type { z } from "zod";

import type { TechnicalError } from "@/lib/contracts/technical";

import {
  delimitTextSource,
  fileSourceHeader,
  SOURCE_ID_PATTERN,
  UNTRUSTED_SOURCES_NOTICE,
} from "../prompts/gemini/untrusted-sources";

import {
  GEMINI_LIMITS,
  GEMINI_THINKING_LEVEL,
  readGeminiConfig,
  type EnvReader,
  type GeminiConfig,
} from "./config";
import { GEMINI_ERROR_CODES, geminiTechnicalError, type GeminiErrorCode } from "./errors";

/**
 * Puerto de generación estructurada con Gemini, solo servidor (MVP-050).
 *
 * Límites de autoridad (INV-04, SH-08): este puerto no acepta ni registra
 * herramientas; ningún agente recibe credenciales, SQL ni herramientas de
 * blockchain. Solo devuelve una salida validada por Zod o un error técnico;
 * nunca un resultado simulado ni un fallback a otro modelo. Zod acredita la
 * forma, no la verdad del contenido.
 *
 * Reintentos: el SDK no reintenta (`maxRetries: 0`). El único reintento
 * aprobado (MVP-013) lo decide el llamador a partir de `retryable`.
 */

export type GeminiTextSource = { kind: "text"; id: string; text: string };

export type GeminiFileSource = {
  kind: "file";
  id: string;
  mediaType: "application/pdf" | "image/jpeg" | "image/png";
  data: Uint8Array;
  /** Estimación de tokens que aporta el archivo (p. ej. ~258 por página de PDF). */
  estimatedTokens: number;
};

export type GeminiSource = GeminiTextSource | GeminiFileSource;

export type GeminiStructuredInput<T> = {
  /** Instrucciones del sistema, versionadas por el consumidor. */
  instructions: string;
  /** Fuentes no confiables, delimitadas antes de enviarse. */
  sources: readonly GeminiSource[];
  /** Esquema de la salida esperada. */
  schema: z.ZodType<T>;
  /** Cancelación del llamador. */
  abortSignal?: AbortSignal;
  /** Correlación no sensible; si falta se genera una. */
  correlationId?: string;
};

export type GeminiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
};

export type GeminiStructuredResult<T> =
  | {
      ok: true;
      output: T;
      modelId: string;
      usage: GeminiUsage;
      latencyMs: number;
      correlationId: string;
    }
  | { ok: false; error: TechnicalError };

/** Evento de registro: correlación, uso y latencia; sin prompts ni secretos (SH-08). */
export type GeminiCallLog = {
  correlationId: string;
  modelId: string | null;
  outcome: "ok" | GeminiErrorCode;
  latencyMs: number;
  usage: GeminiUsage | null;
};

export type GeminiModelFactory = (config: GeminiConfig) => LanguageModel;

export type GeminiPortDeps = {
  /** Lectura de entorno; por defecto `process.env`, consultado al invocar. */
  readEnv?: EnvReader;
  /** Construcción del modelo; los tests inyectan dobles aquí. */
  createModel?: GeminiModelFactory;
  log?: (event: GeminiCallLog) => void;
  now?: () => number;
  newCorrelationId?: () => string;
  /** Plazo por etapa; por defecto el aprobado en MVP-013. */
  timeoutMs?: number;
};

export type GeminiStructuredPort = {
  generateStructured<T>(input: GeminiStructuredInput<T>): Promise<GeminiStructuredResult<T>>;
};

const defaultCreateModel: GeminiModelFactory = ({ apiKey, modelId }) =>
  createGoogleGenerativeAI({ apiKey })(modelId);

const defaultLog = (event: GeminiCallLog) => {
  console.info(JSON.stringify({ scope: "ai.gemini", ...event }));
};

/** Estimación conservadora (~3 caracteres por token) para no exceder el contexto aprobado. */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function estimateInputTokens(input: GeminiStructuredInput<unknown>): number {
  let total = estimateTextTokens(input.instructions) + estimateTextTokens(UNTRUSTED_SOURCES_NOTICE);
  for (const source of input.sources) {
    total += source.kind === "text" ? estimateTextTokens(source.text) : source.estimatedTokens;
    total += 32; // marcas de delimitación
  }
  return total;
}

function isValidInput(input: GeminiStructuredInput<unknown>): boolean {
  // INV-04: la entrada del agente no puede traer herramientas, SQL ni credenciales.
  if ("tools" in input || "toolChoice" in input) return false;
  if (typeof input.instructions !== "string" || input.instructions.trim() === "") return false;
  if (!Array.isArray(input.sources) || input.sources.length === 0) return false;
  return input.sources.every((s) =>
    SOURCE_ID_PATTERN.test(s.id) &&
    (s.kind === "text"
      ? typeof s.text === "string"
      : s.data instanceof Uint8Array && Number.isFinite(s.estimatedTokens) && s.estimatedTokens >= 0),
  );
}

function buildMessages(sources: readonly GeminiSource[], nonce: string): ModelMessage[] {
  const content: Extract<ModelMessage, { role: "user" }>["content"] = [];
  for (const source of sources) {
    if (source.kind === "text") {
      content.push({ type: "text", text: delimitTextSource(source, nonce) });
    } else {
      content.push({ type: "text", text: fileSourceHeader(source.id, nonce) });
      content.push({ type: "file", data: source.data, mediaType: source.mediaType });
    }
  }
  return [{ role: "user", content }];
}

function toUsage(usage: {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  outputTokenDetails?: { reasoningTokens: number | undefined };
}): GeminiUsage {
  return {
    inputTokens: usage.inputTokens ?? null,
    outputTokens: usage.outputTokens ?? null,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? null,
  };
}

export function createGeminiStructuredPort(deps: GeminiPortDeps = {}): GeminiStructuredPort {
  const createModel = deps.createModel ?? defaultCreateModel;
  const log = deps.log ?? defaultLog;
  const now = deps.now ?? Date.now;
  const newCorrelationId = deps.newCorrelationId ?? randomUUID;
  const timeoutMs = deps.timeoutMs ?? GEMINI_LIMITS.stageTimeoutMs;

  return {
    async generateStructured<T>(input: GeminiStructuredInput<T>): Promise<GeminiStructuredResult<T>> {
      const correlationId = input.correlationId ?? newCorrelationId();
      const startedAt = now();

      const fail = (
        code: GeminiErrorCode,
        retryable: boolean,
        modelId: string | null,
        usage: GeminiUsage | null = null,
      ): GeminiStructuredResult<T> => {
        log({ correlationId, modelId, outcome: code, latencyMs: now() - startedAt, usage });
        return { ok: false, error: geminiTechnicalError(code, retryable, correlationId) };
      };

      if (!isValidInput(input)) return fail(GEMINI_ERROR_CODES.invalidInput, false, null);
      const inlineBytes = input.sources.reduce(
        (sum, s) => sum + (s.kind === "file" ? s.data.byteLength : 0),
        0,
      );
      if (
        estimateInputTokens(input) > GEMINI_LIMITS.maxContextTokens ||
        inlineBytes > GEMINI_LIMITS.maxInlineFileBytes
      ) {
        return fail(GEMINI_ERROR_CODES.contextExceeded, false, null);
      }
      if (input.abortSignal?.aborted) return fail(GEMINI_ERROR_CODES.aborted, false, null);

      // Configuración leída al invocar; sin clave no se toca la red.
      const config = readGeminiConfig(deps.readEnv);
      if (!config) return fail(GEMINI_ERROR_CODES.configMissing, false, null);

      // Un solo controlador distingue plazo agotado de cancelación del llamador.
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const onCallerAbort = () => controller.abort();
      input.abortSignal?.addEventListener("abort", onCallerAbort, { once: true });

      try {
        const result = await generateText({
          model: createModel(config),
          system: `${input.instructions}\n\n${UNTRUSTED_SOURCES_NOTICE}`,
          messages: buildMessages(input.sources, randomUUID()),
          output: Output.object({ schema: input.schema }),
          maxOutputTokens: GEMINI_LIMITS.maxOutputTokens,
          maxRetries: 0,
          abortSignal: controller.signal,
          providerOptions: { google: { thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL } } },
        });

        const usage = toUsage(result.usage);
        if (result.finishReason !== "stop") {
          return fail(GEMINI_ERROR_CODES.incompleteOutput, false, config.modelId, usage);
        }
        // Defensa adicional: la salida se vuelve a validar contra el esquema.
        const parsed = input.schema.safeParse(result.output);
        if (!parsed.success) return fail(GEMINI_ERROR_CODES.invalidOutput, true, config.modelId, usage);

        const latencyMs = now() - startedAt;
        log({ correlationId, modelId: config.modelId, outcome: "ok", latencyMs, usage });
        return { ok: true, output: parsed.data, modelId: config.modelId, usage, latencyMs, correlationId };
      } catch (error) {
        if (timedOut) return fail(GEMINI_ERROR_CODES.timeout, true, config.modelId);
        if (input.abortSignal?.aborted) return fail(GEMINI_ERROR_CODES.aborted, false, config.modelId);
        if (NoObjectGeneratedError.isInstance(error)) {
          const usage = error.usage ? toUsage(error.usage) : null;
          return error.finishReason && error.finishReason !== "stop"
            ? fail(GEMINI_ERROR_CODES.incompleteOutput, false, config.modelId, usage)
            : fail(GEMINI_ERROR_CODES.invalidOutput, true, config.modelId, usage);
        }
        if (NoOutputGeneratedError.isInstance(error)) {
          return fail(GEMINI_ERROR_CODES.incompleteOutput, false, config.modelId);
        }
        if (APICallError.isInstance(error)) {
          return fail(GEMINI_ERROR_CODES.providerError, error.isRetryable, config.modelId);
        }
        return fail(GEMINI_ERROR_CODES.providerError, false, config.modelId);
      } finally {
        clearTimeout(timer);
        input.abortSignal?.removeEventListener("abort", onCallerAbort);
      }
    },
  };
}

let defaultPort: GeminiStructuredPort | null = null;

/** Puerto productivo, creado perezosamente al primer uso. */
export function getGeminiStructuredPort(): GeminiStructuredPort {
  defaultPort ??= createGeminiStructuredPort();
  return defaultPort;
}
