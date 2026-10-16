import { describe, expect, it, vi } from "vitest";

import { buildEnvelope, pdfHash } from "@/lib/documents/manifest/manifest";
import { createVerificationService, MAX_VERIFY_PDF_BYTES, VerificationInputError, type PublicRecord } from "@/lib/documents/verification/service";
import { buildHcsPayload } from "@/lib/hedera/payload";
import { createMirrorReader } from "@/lib/hedera/mirror";

// Datos ficticios; Mirror doblado, sin red.
const REFERENCE = "000102030405060708090a0b0c0d0e0f";
const PDF = new Uint8Array(Buffer.from("%PDF-1.7\nversion final ficticia\n%%EOF\n", "latin1"));
const PRIVATE_DETAIL_HASH = "d4cc79a41dc83a2c5d2cffa7bc5267be2a8d475763064032fdf100ec567a4a03";
const env = buildEnvelope({ reference: REFERENCE, pdfHash: pdfHash(PDF), privateDetailHash: PRIVATE_DETAIL_HASH });

const record = (over: Partial<PublicRecord> = {}): PublicRecord => ({
  reference: REFERENCE,
  envelope: { pdfHash: pdfHash(PDF), privateDetailHash: PRIVATE_DETAIL_HASH },
  manifestHash: env.manifestHash,
  hcsStatus: "registrado",
  registration: { network: "testnet", topicId: "0.0.5005", sequenceNumber: "42", transactionId: "0.0.1001@1792173600.000000000" },
  ...over,
});

const mirrorMessage = (manifestHash = env.manifestHash, over: Record<string, unknown> = {}) => ({
  topic_id: "0.0.5005",
  sequence_number: 42,
  consensus_timestamp: "1792173605.123456789",
  message: Buffer.from(buildHcsPayload({ reference: REFERENCE, manifestHash }).bytes).toString("base64"),
  chunk_info: { initial_transaction_id: { account_id: "0.0.1001", transaction_valid_start: "1792173600.000000000" } },
  ...over,
});

function setup(rec: PublicRecord | null, mirror: () => Promise<Response> = async () => Response.json(mirrorMessage())) {
  const fetch = vi.fn(mirror);
  const store = { getByReference: vi.fn(async () => rec) };
  const service = createVerificationService({ store, mirror: createMirrorReader({ fetch: fetch as never }) });
  return { service, fetch, store };
}

describe("Verificador público (MVP-100)", () => {
  it("cadena completa: PDF, envelope, manifiesto y HCS coinciden", async () => {
    const { service } = setup(record());
    const r = await service.verify(REFERENCE, PDF);
    expect(r).toMatchObject({
      registrationStatus: "registrado",
      fileCheck: { provided: true, result: "coincide" },
      proof: { manifestHash: env.manifestHash, consensus: { topicId: "0.0.5005", network: "testnet", sequenceNumber: 42, consensusTimestamp: "2026-10-16T18:00:05.123Z" } },
    });
  });

  it("sin PDF: solo el estado del registro, nunca «archivo verificado»", async () => {
    const r = await setup(record()).service.verify(REFERENCE);
    expect(r.fileCheck).toEqual({ provided: false });
    expect(r.registrationStatus).toBe("registrado");
  });

  it("un byte alterado del PDF: no coincide", async () => {
    const altered = PDF.slice();
    altered[10] ^= 1;
    expect((await setup(record()).service.verify(REFERENCE, altered)).fileCheck).toEqual({ provided: true, result: "no_coincide" });
  });

  it.each([
    ["envelope manipulado", record({ envelope: { pdfHash: pdfHash(PDF), privateDetailHash: "f".repeat(64) } })],
    ["mensaje HCS de otro topic", record({ registration: { ...record().registration!, topicId: "0.0.6006" } })],
  ])("%s: no hay prueba y el archivo no es verificable", async (_, rec) => {
    const r = await setup(rec).service.verify(REFERENCE, PDF);
    expect(r.proof).toBeNull();
    expect(r.fileCheck).toEqual({ provided: true, result: "no_verificable" });
    expect(r.registrationStatus).toBe("pendiente");
  });

  it("payload HCS con otro manifiesto: sin prueba", async () => {
    const r = await setup(record(), async () => Response.json(mirrorMessage("e".repeat(64)))).service.verify(REFERENCE, PDF);
    expect(r).toMatchObject({ proof: null, fileCheck: { result: "no_verificable" } });
  });

  it.each([
    ["Mirror caído", async () => new Response("x", { status: 503 })],
    ["Mirror todavía sin el mensaje", async () => new Response("{}", { status: 404 })],
    ["red caída", async () => Promise.reject(new TypeError("fetch failed"))],
  ])("%s: no verificable, nunca éxito", async (_, mirror) => {
    const r = await setup(record(), mirror as () => Promise<Response>).service.verify(REFERENCE, PDF);
    expect(r).toMatchObject({ proof: null, registrationStatus: "pendiente", fileCheck: { result: "no_verificable" } });
  });

  it("sello pendiente: no consulta Mirror ni declara nada del archivo", async () => {
    const { service, fetch } = setup(record({ hcsStatus: "pendiente", registration: null }));
    expect(await service.verify(REFERENCE, PDF)).toMatchObject({ registrationStatus: "pendiente", proof: null, fileCheck: { result: "no_verificable" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("referencia inexistente o inválida: respuesta neutra, sin consultar Mirror", async () => {
    const { service, fetch, store } = setup(null);
    expect(await service.verify(REFERENCE)).toMatchObject({ registrationStatus: "no_iniciado", proof: null });
    expect(await service.verify("../../etc/passwd", PDF)).toMatchObject({ publicReference: "desconocida", fileCheck: { result: "no_verificable" } });
    expect(store.getByReference).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("el PDF no sale hacia Mirror: solo se consulta el localizador", async () => {
    const { service, fetch } = setup(record());
    await service.verify(REFERENCE, PDF);
    expect(JSON.stringify(fetch.mock.calls)).not.toContain(Buffer.from(PDF).toString("base64"));
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe("https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.5005/messages/42");
  });

  it("archivo que no es PDF o demasiado grande: error de entrada", async () => {
    const { service } = setup(record());
    await expect(service.verify(REFERENCE, new TextEncoder().encode("hola"))).rejects.toBeInstanceOf(VerificationInputError);
    const big = new Uint8Array(MAX_VERIFY_PDF_BYTES + 1);
    big.set(PDF);
    await expect(service.verify(REFERENCE, big)).rejects.toMatchObject({ code: "VERIFY_FILE_TOO_LARGE" });
  });

  it("la respuesta no lleva datos privados", async () => {
    const r = await setup(record()).service.verify(REFERENCE, PDF);
    expect(Object.keys(r).sort()).toEqual(["fileCheck", "proof", "publicReference", "registrationStatus", "schemaVersion"]);
    expect(JSON.stringify(r)).not.toMatch(/nonce|transactionId|0\.0\.1001|operation|declaredName/);
  });
});
