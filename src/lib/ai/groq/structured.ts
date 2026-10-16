import "server-only";

import { randomUUID } from "node:crypto";

import Groq, { APIError } from "groq-sdk";
import { z } from "zod";

import type { TechnicalError } from "@/lib/contracts/technical";

import {
  delimitTextSource,
  SOURCE_ID_PATTERN,
  UNTRUSTED_SOURCES_NOTICE,
} from "../prompts/gemini/untrusted-sources";

import { GROQ_LIMITS, GROQ_REASONING_EFFORT, readGroqConfig, type EnvReader, type GroqConfig } from "./config";

/**
 * Puerto de generación estructurada con Groq, solo servidor (MVP-053).
 * Solo texto (SH-08). Sin herramientas (INV-04), sin fallback y sin
 * reintentos internos (`maxRetries: 0`; el único reintento lo decide el
 * llamador con `retryable`). Salida en modo JSON Schema validada con Zod; si
 * la entrada estimada excede el contexto aprobado, se rechaza sin truncar.
 */

export type GroqTextSource = { id: string; text: string };

export type GroqStructuredInput<T> = {
  instructions: string;
  sources: readonly GroqTextSource[];
  schema: z.ZodType<T>;
  /** Nombre del formato de respuesta (a-z, 0-9, `_`, `-`). */
  schemaName: string;
  abortSignal?: AbortSignal;
  correlationId?: string;
};

export type GroqStructuredResult<T> =
  | { ok: true; output: T; modelId: string; latencyMs: number; correlationId: string }
  | { ok: false; error: TechnicalError };

/** Subconjunto del cliente que usa el puerto; los tests inyectan un doble. */
export type GroqChatClient = {
  chat: { completions: { create: Groq["chat"]["completions"]["create"] } };
};

export type GroqPortDeps = {
  readEnv?: EnvReader;
  createClient?: (config: GroqConfig) => GroqChatClient;
  log?: (event: { correlationId: string; modelId: string | null; outcome: string; latencyMs: number }) => void;
  now?: () => number;
  timeoutMs?: number;
};

export type GroqStructuredPort = {
  generateStructured<T>(input: GroqStructuredInput<T>): Promise<GroqStructuredResult<T>>;
};

const defaultCreateClient = ({ apiKey }: GroqConfig): GroqChatClient => new Groq({ apiKey, maxRetries: 0 });

const estimateTokens = (text: string) => Math.ceil(text.length / 3);

export function createGroqStructuredPort(deps: GroqPortDeps = {}): GroqStructuredPort {
  const createClient = deps.createClient ?? defaultCreateClient;
  const log = deps.log ?? ((e) => console.info(JSON.stringify({ scope: "ai.groq", ...e })));
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? GROQ_LIMITS.stageTimeoutMs;

  return {
    async generateStructured<T>(input: GroqStructuredInput<T>): Promise<GroqStructuredResult<T>> {
      const correlationId = input.correlationId ?? randomUUID();
      const startedAt = now();
      const fail = (code: string, retryable: boolean, modelId: string | null): GroqStructuredResult<T> => {
        log({ correlationId, modelId, outcome: code, latencyMs: now() - startedAt });
        return { ok: false, error: { code, stage: "ia", retryable, correlationId } };
      };

      const validInput =
        !("tools" in input) &&
        input.instructions.trim() !== "" &&
        /^[A-Za-z0-9_-]{1,64}$/.test(input.schemaName) &&
        input.sources.length > 0 &&
        input.sources.every((s) => SOURCE_ID_PATTERN.test(s.id) && typeof s.text === "string");
      if (!validInput) return fail("AI_INVALID_INPUT", false, null);

      const nonce = randomUUID();
      const system = `${input.instructions}\n\n${UNTRUSTED_SOURCES_NOTICE}`;
      const user = input.sources.map((s) => delimitTextSource(s, nonce)).join("\n\n");
      if (estimateTokens(system) + estimateTokens(user) > GROQ_LIMITS.maxContextTokens) {
        return fail("AI_CONTEXT_EXCEEDED", false, null);
      }
      if (input.abortSignal?.aborted) return fail("AI_ABORTED", false, null);

      const config = readGroqConfig(deps.readEnv);
      if (!config) return fail("AI_CONFIG_MISSING", false, null);

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const onAbort = () => controller.abort();
      input.abortSignal?.addEventListener("abort", onAbort, { once: true });

      try {
        const completion = await createClient(config).chat.completions.create(
          {
            model: config.modelId,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: input.schemaName,
                schema: z.toJSONSchema(input.schema) as Record<string, unknown>,
                // Modo de mejor esfuerzo: la forma se garantiza con Zod abajo.
                strict: false,
              },
            },
            max_completion_tokens: GROQ_LIMITS.maxOutputTokens,
            reasoning_effort: GROQ_REASONING_EFFORT,
            stream: false,
          },
          { signal: controller.signal },
        );

        const choice = completion.choices[0];
        if (!choice || choice.finish_reason !== "stop") return fail("AI_INCOMPLETE_OUTPUT", false, config.modelId);
        let json: unknown;
        try {
          json = JSON.parse(choice.message.content ?? "");
        } catch {
          return fail("AI_INVALID_OUTPUT", true, config.modelId);
        }
        const parsed = input.schema.safeParse(json);
        if (!parsed.success) return fail("AI_INVALID_OUTPUT", true, config.modelId);

        const latencyMs = now() - startedAt;
        log({ correlationId, modelId: config.modelId, outcome: "ok", latencyMs });
        return { ok: true, output: parsed.data, modelId: config.modelId, latencyMs, correlationId };
      } catch (error) {
        if (timedOut) return fail("AI_TIMEOUT", true, config.modelId);
        if (input.abortSignal?.aborted) return fail("AI_ABORTED", false, config.modelId);
        if (error instanceof APIError) {
          const status = error.status ?? 0;
          return fail("AI_PROVIDER_ERROR", status === 429 || status >= 500 || status === 0, config.modelId);
        }
        return fail("AI_PROVIDER_ERROR", false, config.modelId);
      } finally {
        clearTimeout(timer);
        input.abortSignal?.removeEventListener("abort", onAbort);
      }
    },
  };
}

let defaultPort: GroqStructuredPort | null = null;

/** Puerto productivo, creado perezosamente al primer uso. */
export function getGroqStructuredPort(): GroqStructuredPort {
  defaultPort ??= createGroqStructuredPort();
  return defaultPort;
}
