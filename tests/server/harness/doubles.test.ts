import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { GEMINI_API_KEY_ENV } from "@/lib/ai/gemini/config";
import { createGeminiStructuredPort } from "@/lib/ai/gemini/structured";

import { scriptedGeminiModel } from "../doubles/gemini";
import { ScriptedBehavior, UncertainOutcomeError } from "../doubles/scripted";
import { createTestClock } from "../support/clock";
import { blockNetwork } from "../support/network-guard";

const serverDir = path.resolve(import.meta.dirname, "..");
const schema = z.strictObject({ cantidad: z.number() });
const input = {
  instructions: "extrae",
  sources: [{ kind: "text" as const, id: "msg-1", text: "40 cajas" }],
  schema,
  correlationId: "corr-1",
};

let restore: (() => void) | null = null;
afterEach(() => restore?.());

describe("reloj de test", () => {
  it("resuelve las esperas en orden solo al avanzar", async () => {
    const clock = createTestClock("2026-01-15T12:00:00.000Z");
    const order: string[] = [];
    const slow = clock.sleep(200).then(() => order.push("lenta"));
    const fast = clock.sleep(100).then(() => order.push("rápida"));
    expect(clock.pending()).toBe(2);
    await clock.advance(99);
    expect(order).toEqual([]);
    await clock.advance(1);
    await fast;
    await clock.advance(100);
    await slow;
    expect(order).toEqual(["rápida", "lenta"]);
    expect(clock.now().toISOString()).toBe("2026-01-15T12:00:00.200Z");
  });

  it("una espera abortada rechaza y deja de estar pendiente", async () => {
    const clock = createTestClock();
    const controller = new AbortController();
    const waiting = clock.sleep(1000, controller.signal);
    controller.abort(new Error("cancelado"));
    await expect(waiting).rejects.toThrow("cancelado");
    expect(clock.pending()).toBe(0);
  });
});

describe("comportamiento guionado", () => {
  it("consume el guion en orden y repite el último paso", async () => {
    const b = new ScriptedBehavior<string, string>([
      { kind: "fail", error: new Error("boom") },
      { kind: "ok", value: "listo" },
    ]);
    await expect(b.run("a")).rejects.toThrow("boom");
    await expect(b.run("b")).resolves.toBe("listo");
    await expect(b.run("c")).resolves.toBe("listo");
    expect(b.calls.map((c) => c.input)).toEqual(["a", "b", "c"]);
  });

  it("incierto aplica el efecto y aun así falla al llamador", async () => {
    let applied = 0;
    const b = new ScriptedBehavior<string, string>([{ kind: "uncertain", effect: () => (applied += 1) }]);
    await expect(b.run("x")).rejects.toBeInstanceOf(UncertainOutcomeError);
    expect(applied).toBe(1);
  });

  it("hang termina solo al cancelar; delay espera tiempo simulado", async () => {
    const clock = createTestClock();
    const b = new ScriptedBehavior<string, string>([{ kind: "hang" }, { kind: "delay", ms: 500, then: { kind: "ok", value: "tarde" } }], clock);
    const controller = new AbortController();
    const hung = b.run("a", controller.signal);
    controller.abort(new Error("corte"));
    await expect(hung).rejects.toThrow("corte");

    const delayed = b.run("b");
    let done = false;
    void delayed.then(() => (done = true));
    await clock.advance(499);
    expect(done).toBe(false);
    await clock.advance(1);
    await expect(delayed).resolves.toBe("tarde");
  });

  it("un guion vacío o un delay sin reloj fallan explícitamente (no pasan en silencio)", async () => {
    expect(() => new ScriptedBehavior([])).toThrow();
    const b = new ScriptedBehavior<string, string>([{ kind: "delay", ms: 1, then: { kind: "ok", value: "x" } }]);
    await expect(b.run("a")).rejects.toThrow("reloj");
  });
});

describe("Gemini guionado contra el puerto real", () => {
  const readEnv = (name: string) => (name === GEMINI_API_KEY_ENV ? "clave-ficticia" : undefined);

  it("éxito, salida inválida y fallo, sin tocar la red", async () => {
    const net = blockNetwork();
    restore = net.restore;
    const { model, behavior } = scriptedGeminiModel([
      { kind: "ok", value: { cantidad: 40 } },
      { kind: "invalid", value: { cantidad: "cuarenta" } },
      { kind: "fail", error: new Error("proveedor caído") },
    ]);
    const port = createGeminiStructuredPort({ readEnv, createModel: () => model, log: () => {} });

    const ok = await port.generateStructured(input);
    expect(ok).toMatchObject({ ok: true, output: { cantidad: 40 } });
    const invalid = await port.generateStructured(input);
    expect(invalid.ok).toBe(false);
    const failed = await port.generateStructured(input);
    expect(failed.ok).toBe(false);
    expect(behavior.calls).toHaveLength(3);
    expect(net.attempts).toEqual([]);
  });

  it("la cancelación del llamador llega al doble", async () => {
    const { model } = scriptedGeminiModel([{ kind: "hang" }]);
    const port = createGeminiStructuredPort({ readEnv, createModel: () => model, log: () => {} });
    const controller = new AbortController();
    const pending = port.generateStructured({ ...input, abortSignal: controller.signal });
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
  });
});

describe("aislamiento de los dobles", () => {
  const files = ["doubles", "support", "builders"].flatMap((dir) =>
    readdirSync(path.join(serverDir, dir)).filter((f) => f.endsWith(".ts")).map((f) => path.join(serverDir, dir, f)),
  );

  it("el bloqueo de red registra e impide fetch", async () => {
    const net = blockNetwork();
    restore = net.restore;
    await expect(fetch("https://ejemplo.invalid/")).rejects.toThrow("Red bloqueada");
    expect(net.attempts).toEqual(["https://ejemplo.invalid/"]);
  });

  it("ningún doble, soporte ni builder importa SDK reales ni llama a fetch", () => {
    expect(files.length).toBeGreaterThan(4);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, path.basename(file)).not.toMatch(/from\s+["'](@ai-sdk\/google|groq-sdk|@hiero-ledger\/[^"']*|@hashgraph\/[^"']*|@supabase\/[^"']*)["']/);
      if (path.basename(file) !== "network-guard.ts") expect(code, path.basename(file)).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
