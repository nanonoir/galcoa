import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildHcsPayload } from "@/lib/hedera/payload";
import { canonicalHash, canonicalize, CanonicalizationError, parseJsonStrict, sha256Hex } from "@/lib/documents/manifest/jcs";
import {
  buildEnvelope,
  generateNonce,
  generateReference,
  pdfHash,
  privateDetailHash,
  PrivateDetailSchema,
  snapshotHash,
} from "@/lib/documents/manifest/manifest";

// Vectores de docs/design/manifest-hcs.md (datos ficticios).
const NONCE = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const REFERENCE = "000102030405060708090a0b0c0d0e0f";
const PDF_V1 = new Uint8Array(Buffer.from("255044462d312e370a2525454f460a", "hex"));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const V5_CONTENT = {
  operation: {
    body: "Se entregan 12 cajas de ejemplo el 2026-10-01. Precio no informado.",
    corrections: ["Ortografía: «entregan»"],
    title: "Acuerdo ficticio de entrega",
  },
  selection: ["autor", "intermediario", "comprador"],
  warnings: [
    {
      id: "w-1",
      message: "Chat indica 10 cajas; remito indica 12.",
      severity: "critical",
      sources: [
        { alias: "Fuente A", description: "chat: 10 cajas" },
        { alias: "Fuente B", description: "remito aportado: 12 cajas" },
      ],
    },
  ],
};

const detailV6 = (snapshot: string) => ({
  schemaVersion: "galcoa.private-detail.v1",
  versionId: "v-fixture",
  revisionId: "r-fixture",
  snapshotId: "s-fixture",
  snapshotHash: snapshot,
  evidences: [{ evidenceId: "e-1", sha256: sha("original-1") }],
  reports: [{ reportId: "rep-1", sha256: sha("report-1"), sources: [{ type: "message", id: "m-1", page: null, region: null }] }],
  confirmations: [
    ["c-1", "autor", null, "2026-10-16T12:00:00.000Z"],
    ["c-2", "intermediario", "María Ñandú", "2026-10-16T12:01:00.000Z"],
    ["c-3", "comprador", "Juan Pérez", "2026-10-16T12:02:00.000Z"],
  ].map(([responseId, role, declaredName, respondedAt]) => ({
    responseId,
    role,
    snapshotHash: snapshot,
    decision: "confirmar",
    checkbox: true,
    declaredName,
    ratifiedRejection: false,
    respondedAt,
  })),
  previousVersion: null,
  nonce: NONCE,
});

describe("JCS del perfil v1 (MVP-082)", () => {
  it("V0: claves ordenadas, entero 1.0 → 1, texto exacto, 45 bytes", () => {
    const value = parseJsonStrict('{"text":"\\u00e9","n":1.0,"amount":"10.00","a":null}');
    const { bytes, hash } = canonicalHash(value);
    expect(canonicalize(value)).toBe('{"a":null,"amount":"10.00","n":1,"text":"é"}');
    expect(bytes.byteLength).toBe(45);
    expect(hash).toBe("7bb015f4bf985ad10d7ddecc34049888a4e0eaf14305f376be1c13d6f5ab3643");
  });

  it("orden por unidades UTF-16, no por locale", () => {
    expect(canonicalize({ b: 1, B: 2, á: 3, a: 4, "\u{1F600}": 5, "￿": 6 })).toBe('{"B":2,"a":4,"b":1,"á":3,"😀":5,"￿":6}');
  });

  it("sin normalización Unicode: é precompuesta y descompuesta dan hashes distintos", () => {
    expect(canonicalHash({ t: "é" }).hash).not.toBe(canonicalHash({ t: "é" }).hash);
  });

  it("reordenar claves no cambia el hash; reordenar arrays sí", () => {
    expect(canonicalHash({ a: 1, b: [1, 2] }).hash).toBe(canonicalHash({ b: [1, 2], a: 1 }).hash);
    expect(canonicalHash({ b: [1, 2] }).hash).not.toBe(canonicalHash({ b: [2, 1] }).hash);
  });

  it.each([
    ["NaN", { n: Number.NaN }],
    ["infinito", { n: Number.POSITIVE_INFINITY }],
    ["fracción", { n: 1.5 }],
    ["entero inseguro", { n: 2 ** 53 }],
    ["surrogate suelto", { t: "\uD800" }],
    ["undefined", { t: undefined }],
    ["Date", { t: new Date(0) }],
    ["BigInt", { t: BigInt(1) }],
    ["hueco en array", { t: [1, , 3] }],
  ])("rechaza %s", (_, value) => {
    expect(() => canonicalize(value)).toThrow(CanonicalizationError);
  });

  it("el parser estricto rechaza claves duplicadas y basura", () => {
    expect(() => parseJsonStrict('{"a":1,"a":2}')).toThrow(/duplicada/);
    expect(() => parseJsonStrict('{"a":1} x')).toThrow(CanonicalizationError);
    expect(parseJsonStrict(' {"a":[1,"x",{"b":null}]} ')).toEqual({ a: [1, "x", { b: null }] });
  });
});

describe("Cadena de hashes con los vectores del diseño (MVP-082)", () => {
  it("V1: SHA-256 de los bytes del PDF", () => {
    expect(pdfHash(PDF_V1)).toBe("1e7313ace78f0fb481a486939b4885902663102818090805515553d84e0bbfd3");
  });

  it("V2 y V3: detalle privado sintético y envelope", () => {
    const snapshot = canonicalHash({}).hash;
    expect(snapshot).toBe("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
    const detail = { ...detailV6(snapshot), evidences: [], reports: [], confirmations: [] };
    const d = privateDetailHash(detail);
    expect(d.bytes.byteLength).toBe(345);
    expect(d.hash).toBe("bc0c645b44cccdb9194c703e0763a3f532e571a56f354c79d171ea0718f0f24a");
    const env = buildEnvelope({ reference: REFERENCE, pdfHash: pdfHash(PDF_V1), privateDetailHash: d.hash });
    expect(env.bytes.byteLength).toBe(249);
    expect(env.manifestHash).toBe("71190077727205270fbc7017d8302e7869696ec5b034a2cf54008fe373eeef0b");
  });

  it("V5 → V8: contenido congelado, detalle de dominio, envelope y payload HCS", () => {
    const s = snapshotHash(V5_CONTENT);
    expect(s.bytes.byteLength).toBe(451);
    expect(s.hash).toBe("736a8da7c6c9257c313c1580dbc42dc88c17b3db4de868a24f41d255fbefe804");

    const d = privateDetailHash(detailV6(s.hash));
    expect(d.bytes.byteLength).toBe(1369);
    expect(d.hash).toBe("d4cc79a41dc83a2c5d2cffa7bc5267be2a8d475763064032fdf100ec567a4a03");

    const env = buildEnvelope({ reference: REFERENCE, pdfHash: pdfHash(PDF_V1), privateDetailHash: d.hash });
    expect(env.manifestHash).toBe("699b15c9f13b20aed9f2a3a5905ba0d7feb9f151c7930cff940a073d591d7590");

    const payload = buildHcsPayload({ reference: REFERENCE, manifestHash: env.manifestHash });
    expect(payload.payloadHash).toBe("164e65d41726232960bbdc6bb49b090dc8c6c57e8cc103d76688cad6ee6d5508");
  });

  it("un byte distinto del PDF cambia pdfHash y la raíz", () => {
    const changed = PDF_V1.slice();
    changed[0] ^= 1;
    const d = privateDetailHash(detailV6(snapshotHash(V5_CONTENT).hash)).hash;
    const a = buildEnvelope({ reference: REFERENCE, pdfHash: pdfHash(PDF_V1), privateDetailHash: d }).manifestHash;
    const b = buildEnvelope({ reference: REFERENCE, pdfHash: pdfHash(changed), privateDetailHash: d }).manifestHash;
    expect(a).not.toBe(b);
  });

  it("otra selección cambia el snapshotHash y un orden no canónico se rechaza", () => {
    expect(snapshotHash({ ...V5_CONTENT, selection: ["autor", "comprador"] }).hash).not.toBe(snapshotHash(V5_CONTENT).hash);
    // Un orden no canónico ni siquiera llega a hashearse: se ordena antes de congelar.
    expect(() => snapshotHash({ ...V5_CONTENT, selection: ["comprador", "autor"] })).toThrow();
  });
});

describe("Esquemas estrictos y privacidad (MVP-082)", () => {
  const snapshot = snapshotHash(V5_CONTENT).hash;

  it("el envelope solo tiene schemaVersion, reference, pdfHash y privateDetailHash", () => {
    const env = buildEnvelope({ reference: REFERENCE, pdfHash: pdfHash(PDF_V1), privateDetailHash: snapshot });
    expect(Object.keys(env.envelope).sort()).toEqual(["pdfHash", "privateDetailHash", "reference", "schemaVersion"]);
    expect(() => buildEnvelope({ reference: REFERENCE, pdfHash: snapshot, privateDetailHash: snapshot, nonce: NONCE } as never)).toThrow();
    expect(new TextDecoder().decode(env.bytes)).not.toContain(NONCE);
  });

  it.each([
    ["campo extra", (d: ReturnType<typeof detailV6>) => ({ ...d, email: "ana@ejemplo.invalid" })],
    ["versión desconocida", (d: ReturnType<typeof detailV6>) => ({ ...d, schemaVersion: "galcoa.private-detail.v2" })],
    ["constancias fuera de orden", (d: ReturnType<typeof detailV6>) => ({ ...d, confirmations: [...d.confirmations].reverse() })],
    ["tercero sin nombre declarado", (d: ReturnType<typeof detailV6>) => ({ ...d, confirmations: d.confirmations.map((c) => ({ ...c, declaredName: null })) })],
    ["constancia de otro snapshot", (d: ReturnType<typeof detailV6>) => ({ ...d, confirmations: d.confirmations.map((c) => ({ ...c, snapshotHash: "0".repeat(64) })) })],
    ["nonce corto", (d: ReturnType<typeof detailV6>) => ({ ...d, nonce: "abcd" })],
    ["instante sin milisegundos", (d: ReturnType<typeof detailV6>) => ({ ...d, confirmations: d.confirmations.map((c) => ({ ...c, respondedAt: "2026-10-16T12:00:00Z" })) })],
  ])("el detalle privado rechaza %s", (_, mutate) => {
    expect(PrivateDetailSchema.safeParse(mutate(detailV6(snapshot))).success).toBe(false);
  });

  it("nonce y referencia: CSPRNG con el largo aprobado, distintos en cada llamada", () => {
    expect(generateNonce()).toMatch(/^[0-9a-f]{64}$/);
    expect(generateReference()).toMatch(/^[0-9a-f]{32}$/);
    expect(generateNonce()).not.toBe(generateNonce());
  });

  it("mismos datos y nonce: mismos hashes", () => {
    const a = privateDetailHash(detailV6(snapshot)).hash;
    const b = privateDetailHash(JSON.parse(JSON.stringify(detailV6(snapshot)))).hash;
    expect(a).toBe(b);
    expect(sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
