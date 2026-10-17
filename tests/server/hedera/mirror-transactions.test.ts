import { describe, expect, it, vi } from "vitest";

import { TESTNET_MIRROR_ORIGIN } from "@/lib/hedera/config";
import { createMirrorReader, toMirrorTransactionId } from "@/lib/hedera/mirror";

const SDK_ID = "0.0.1001@1792173600.000000007";
const MIRROR_ID = "0.0.1001-1792173600-000000007";
const TS = "1792173605.123456789";
const tx = (over: Record<string, unknown> = {}) => ({
  transactions: [{ result: "SUCCESS", name: "CONSENSUSSUBMITMESSAGE", entity_id: "0.0.5005", consensus_timestamp: TS, transaction_id: MIRROR_ID, nonce: 0, ...over }],
});

function reader(...responses: (Response | Error)[]) {
  const fetch = vi.fn(async () => {
    const next = responses.shift()!;
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch, mirror: createMirrorReader({ fetch: fetch as never }) };
}

describe("MVP-093 · localizar por ID de transacción", () => {
  it("convierte el formato del SDK al del Mirror y rechaza lo inválido", () => {
    expect(toMirrorTransactionId(SDK_ID)).toBe(MIRROR_ID);
    expect(toMirrorTransactionId("https://atacante.invalid")).toBeNull();
  });

  it("éxito: topic, marca de consenso y secuencia, contra el origen fijo", async () => {
    const { fetch, mirror } = reader(Response.json(tx()), Response.json({ messages: [{ sequence_number: "12" }] }));
    expect(await mirror.locateTransaction(SDK_ID, "0.0.5005")).toEqual({
      result: "exitoso",
      topicId: "0.0.5005",
      consensusTimestamp: TS,
      sequenceNumber: "12",
    });
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe(`${TESTNET_MIRROR_ORIGIN}/api/v1/transactions/${MIRROR_ID}`);
  });

  it("resultado distinto de SUCCESS: fallo terminal", async () => {
    const { mirror } = reader(Response.json(tx({ result: "INVALID_TOPIC_ID" })));
    expect(await mirror.locateTransaction(SDK_ID, "0.0.5005")).toEqual({ result: "fallo_terminal", status: "INVALID_TOPIC_ID" });
  });

  it("DUPLICATE_TRANSACTION antes de SUCCESS: devuelve el localizado exitoso", async () => {
    const dup = tx({ result: "DUPLICATE_TRANSACTION" }).transactions;
    const ok = tx().transactions;
    const { mirror } = reader(Response.json({ transactions: [...dup, ...ok] }), Response.json({ messages: [{ sequence_number: "12" }] }));
    expect(await mirror.locateTransaction(SDK_ID, "0.0.5005")).toMatchObject({ result: "exitoso", sequenceNumber: "12" });
  });

  it("solo DUPLICATE_TRANSACTION o UNKNOWN: no concluyente, nunca fallo terminal", async () => {
    for (const result of ["DUPLICATE_TRANSACTION", "UNKNOWN"]) {
      const lookup = await reader(Response.json(tx({ result }))).mirror.locateTransaction(SDK_ID, "0.0.5005");
      expect(lookup).toEqual({ result: "indisponible", reason: "transaccion_duplicada" });
    }
  });

  it("una entrada programada se ignora", async () => {
    const { mirror } = reader(Response.json(tx({ result: "INVALID_TOPIC_ID", scheduled: true })));
    expect(await mirror.locateTransaction(SDK_ID, "0.0.5005")).toEqual({ result: "aun_no_disponible" });
  });

  it("404, 5xx, timeout y cuerpo inválido no son fallo ni ausencia", async () => {
    expect(await reader(new Response(null, { status: 404 })).mirror.locateTransaction(SDK_ID, "0.0.5005")).toEqual({ result: "aun_no_disponible" });
    expect((await reader(new Response(null, { status: 503 })).mirror.locateTransaction(SDK_ID, "0.0.5005")).result).toBe("indisponible");
    expect((await reader(new Error("timeout")).mirror.locateTransaction(SDK_ID, "0.0.5005")).result).toBe("indisponible");
    expect((await reader(Response.json({ otro: 1 })).mirror.locateTransaction(SDK_ID, "0.0.5005")).result).toBe("indisponible");
  });

  it("topic u operación inesperados, o ID ajeno: no concluyente", async () => {
    expect((await reader(Response.json(tx({ entity_id: "0.0.9" }))).mirror.locateTransaction(SDK_ID, "0.0.5005")).result).toBe("indisponible");
    expect((await reader(Response.json(tx({ name: "CRYPTOTRANSFER" }))).mirror.locateTransaction(SDK_ID, "0.0.5005")).result).toBe("indisponible");
    expect((await reader(Response.json(tx({ transaction_id: "0.0.1-1-1" }))).mirror.locateTransaction(SDK_ID, "0.0.5005")).result).toBe("aun_no_disponible");
  });

  it("transacción en consenso pero mensaje aún no listado: aún no disponible", async () => {
    const { mirror } = reader(Response.json(tx()), Response.json({ messages: [] }));
    expect(await mirror.locateTransaction(SDK_ID, "0.0.5005")).toEqual({ result: "aun_no_disponible" });
  });
});
