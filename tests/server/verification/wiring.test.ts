import { describe, expect, it, vi } from "vitest";

import { PublicVerificationSchema } from "@/lib/contracts/public";
import { buildEnvelope, pdfHash } from "@/lib/documents/manifest/manifest";
import { createVerifyHandlers } from "@/lib/documents/verification/http";
import { createVerificationService, MAX_VERIFY_PDF_BYTES } from "@/lib/documents/verification/service";
import { createSupabasePublicVerificationStore } from "@/lib/documents/verification/supabase";
import { createMirrorReader } from "@/lib/hedera/mirror";
import { buildHcsPayload } from "@/lib/hedera/payload";

// Datos ficticios; base y Mirror doblados, sin red.
const REFERENCE = "000102030405060708090a0b0c0d0e0f";
const PDF = new Uint8Array(Buffer.from("%PDF-1.7\nversion final ficticia\n%%EOF\n", "latin1"));
const PRIVATE_DETAIL_HASH = "d4cc79a41dc83a2c5d2cffa7bc5267be2a8d475763064032fdf100ec567a4a03";
const env = buildEnvelope({ reference: REFERENCE, pdfHash: pdfHash(PDF), privateDetailHash: PRIVATE_DETAIL_HASH });

const found = {
  status: "found",
  record: {
    reference: REFERENCE,
    envelope: { pdfHash: pdfHash(PDF), privateDetailHash: PRIVATE_DETAIL_HASH },
    manifestHash: env.manifestHash,
    hcsStatus: "registrado",
    registration: { network: "testnet", topicId: "0.0.5005", sequenceNumber: "42", transactionId: "0.0.1001@1792173600.000000000" },
  },
};
const mirrorMessage = {
  topic_id: "0.0.5005",
  sequence_number: 42,
  consensus_timestamp: "1792173605.123456789",
  message: Buffer.from(buildHcsPayload({ reference: REFERENCE, manifestHash: env.manifestHash }).bytes).toString("base64"),
  chunk_info: { initial_transaction_id: { account_id: "0.0.1001", transaction_valid_start: "1792173600.000000000" } },
};

const rpcReturning = (data: unknown, error: unknown = null) => ({ rpc: vi.fn(async () => ({ data, error })) });

function handlers(data: unknown, mirror: () => Promise<Response> = async () => Response.json(mirrorMessage)) {
  const rpc = rpcReturning(data);
  const fetch = vi.fn(mirror);
  const service = createVerificationService({
    store: createSupabasePublicVerificationStore(rpc),
    mirror: createMirrorReader({ fetch: fetch as never }),
  });
  return { ...createVerifyHandlers({ service }), rpc, fetch };
}

const upload = (bytes: Uint8Array, name = "x.pdf", field = "file") => {
  const form = new FormData();
  form.append(field, new File([bytes as BlobPart], name, { type: "application/pdf" }));
  return new Request("http://localhost/api/verify/x", { method: "POST", body: form });
};
const get = () => new Request("http://localhost/api/verify/x");

describe("Adaptador de lectura pública (get_public_verification)", () => {
  it("proyecta found y mapea not_available a null", async () => {
    expect((await createSupabasePublicVerificationStore(rpcReturning(found)).getByReference(REFERENCE))?.reference).toBe(REFERENCE);
    expect(await createSupabasePublicVerificationStore(rpcReturning({ status: "not_available" })).getByReference(REFERENCE)).toBeNull();
  });

  it("rechaza campos extra o red distinta de Testnet, y los errores de SDK no cruzan", async () => {
    const store = (data: unknown) => createSupabasePublicVerificationStore(rpcReturning(data));
    await expect(store({ ...found, record: { ...found.record, nonce: "secreto" } }).getByReference(REFERENCE)).rejects.toThrow("inválida");
    const mainnet = { ...found.record, registration: { ...found.record.registration, network: "mainnet" } };
    await expect(store({ status: "found", record: mainnet }).getByReference(REFERENCE)).rejects.toThrow("inválida");
    await expect(createSupabasePublicVerificationStore(rpcReturning(null, { message: "boom secret" })).getByReference(REFERENCE)).rejects.toThrow(
      "Persistencia no disponible",
    );
  });
});

describe("Handlers HTTP del verificador", () => {
  it("GET: estado público validado con el contrato, con cabeceras privadas y sin tocar archivo", async () => {
    const res = await handlers(found).get(get(), REFERENCE);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    const body = PublicVerificationSchema.parse(await res.json());
    expect(body).toMatchObject({ registrationStatus: "registrado", fileCheck: { provided: false } });
  });

  it("POST: PDF idéntico coincide; un byte alterado no coincide", async () => {
    const h = handlers(found);
    expect((await (await h.post(upload(PDF), REFERENCE)).json()).fileCheck).toEqual({ provided: true, result: "coincide" });
    const altered = PDF.slice();
    altered[10] ^= 1;
    expect((await (await h.post(upload(altered), REFERENCE)).json()).fileCheck).toEqual({ provided: true, result: "no_coincide" });
  });

  it("referencia inexistente: la misma respuesta neutra que una no verificable, con o sin archivo", async () => {
    const h = handlers({ status: "not_available" });
    const noFile = await (await h.get(get(), REFERENCE)).json();
    expect(noFile).toMatchObject({ registrationStatus: "no_iniciado", proof: null, fileCheck: { provided: false } });
    const withFile = await (await h.post(upload(PDF), REFERENCE)).json();
    expect(withFile).toMatchObject({ registrationStatus: "no_iniciado", proof: null, fileCheck: { provided: true, result: "no_verificable" } });
    const malformed = await h.get(get(), "../../etc/passwd");
    expect(await malformed.json()).toMatchObject({ publicReference: "desconocida", registrationStatus: "no_iniciado" });
    expect(h.rpc.rpc).toHaveBeenCalledTimes(2);
  });

  it("no filtra datos privados en la respuesta ni en los errores", async () => {
    const ok = JSON.stringify(await (await handlers(found).post(upload(PDF), REFERENCE)).json());
    const bad = await handlers(null).get(get(), REFERENCE);
    const failure = JSON.stringify(await bad.json());
    for (const text of [ok, failure]) expect(text).not.toMatch(/nonce|participant|evidence|chat|operation|payload|signed/i);
    expect([bad.status, JSON.parse(failure).error.code]).toEqual([503, "TECHNICAL_FAILURE"]);
  });

  it("Mirror caído: no verificable, nunca éxito", async () => {
    const h = handlers(found, async () => new Response("x", { status: 503 }));
    expect(await (await h.post(upload(PDF), REFERENCE)).json()).toMatchObject({ proof: null, fileCheck: { result: "no_verificable" } });
  });

  it("POST: valida tipo de contenido, forma, archivo y tamaño con errores opacos", async () => {
    const h = handlers(found);
    const json = new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect((await h.post(json, REFERENCE)).status).toBe(415);
    expect((await h.post(upload(PDF, "x.pdf", "otro"), REFERENCE)).status).toBe(400);
    expect((await h.post(upload(new Uint8Array(Buffer.from("no soy pdf"))), REFERENCE)).status).toBe(400);
    const big = new Uint8Array(MAX_VERIFY_PDF_BYTES + 1);
    big.set(Buffer.from("%PDF-"));
    const tooLarge = await h.post(upload(big), REFERENCE);
    expect([tooLarge.status, (await tooLarge.json()).error.code]).toEqual([413, "PAYLOAD_TOO_LARGE"]);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("POST: corta un cuerpo sin Content-Length que supera el tope", async () => {
    const chunk = new Uint8Array(1_048_576);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ >= 12) return controller.close();
        controller.enqueue(chunk);
      },
    });
    const request = new Request("http://localhost/x", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=zz" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect((await handlers(found).post(request, REFERENCE)).status).toBe(413);
    expect(sent).toBeLessThan(12);
  });
});
