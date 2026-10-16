import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicInvitationSchema } from "@/lib/contracts/public";
import type { FrozenOperation } from "@/lib/contracts/review";
import { snapshotHash } from "@/lib/documents/manifest/manifest";
import {
  createIssueInvitationHandler,
  createReadInvitationHandler,
  createRespondInvitationHandler,
  createRevokeInvitationHandler,
} from "@/lib/documents/invitations/http";
import { createInvitationService } from "@/lib/documents/invitations/service";
import { generateInvitationToken, hashInvitationToken, INVITATION_TTL_SECONDS, isWellFormedToken } from "@/lib/documents/invitations/token";

import { createMemoryInvitations } from "./memory-invitations";

// Datos ficticios; ni base ni red reales.
const ANA = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";

const content: FrozenOperation = {
  operation: { title: "Acuerdo ficticio", body: "Se entregan 12 cajas de ejemplo.", corrections: [] },
  warnings: [
    {
      id: "aviso-1",
      message: "Las fuentes no coinciden: 10 cajas (Fuente A) y 12 cajas (Fuente B).",
      severity: "critical",
      sources: [
        { alias: "Fuente A", description: "chat: 10 cajas" },
        { alias: "Fuente B", description: "remito aportado: 12 cajas" },
      ],
    },
  ],
  selection: ["autor", "intermediario", "comprador"],
};
const HASH = snapshotHash(content).hash;
const REV = "rev-1";
const SNAP = "snap-1";
const HOUR = 3_600_000;

function setup(user: string | null = ANA) {
  const mem = createMemoryInvitations({ now: () => Date.parse("2026-10-16T12:00:00Z") });
  mem.seedRevision({ ownerId: ANA, revisionId: REV, snapshotId: SNAP, snapshotHash: HASH, content });
  let n = 0;
  const service = createInvitationService({
    session: { currentUserId: async () => user },
    invitations: mem.store,
    newCorrelationId: () => `corr-${++n}`,
  });
  return { mem, service };
}

const issueCmd = (over: Record<string, unknown> = {}) => ({ revisionId: REV, role: "comprador", idempotencyKey: "issue-key-0001", ...over });

async function issued(service: ReturnType<typeof setup>["service"], over: Record<string, unknown> = {}) {
  const r = await service.issue(issueCmd(over));
  if (!r.ok) throw new Error(`issue: ${r.error.code}`);
  return r.value;
}

const respondCmd = (token: string, over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  actor: "tercero",
  token,
  revisionId: REV,
  snapshotId: SNAP,
  snapshotHash: HASH,
  idempotencyKey: "respond-key-0001",
  declaredName: "Juan Pérez",
  decision: "confirmar",
  checkboxChecked: true,
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("MVP-072 · token", () => {
  it("32 bytes en base64url (43 caracteres) y hash SHA-256 estable", () => {
    const t = generateInvitationToken();
    expect(isWellFormedToken(t)).toBe(true);
    expect(t).toHaveLength(43);
    expect(generateInvitationToken()).not.toBe(t);
    expect(hashInvitationToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken(t)).toBe(hashInvitationToken(t));
    expect(INVITATION_TTL_SECONDS).toBe(72 * 3600);
  });

  it.each([undefined, null, "", "corto", `${"a".repeat(42)}=`, `${"a".repeat(44)}`, "../../etc/passwd", 123])("%j no es un token", (value) => {
    expect(isWellFormedToken(value)).toBe(false);
  });
});

describe("MVP-072 · emisión", () => {
  it("el texto plano vuelve una vez y la base solo guarda el hash", async () => {
    const { service, mem } = setup();
    const inv = await issued(service);
    expect(isWellFormedToken(inv.token)).toBe(true);
    expect(inv).toMatchObject({ revisionId: REV, role: "comprador", expiresAt: "2026-10-19T12:00:00.000Z" });
    expect(mem.dump()).not.toContain(inv.token);
    expect(mem.dump()).toContain(hashInvitationToken(inv.token));
  });

  it("repetir la emisión no recupera el token: pide reemitir", async () => {
    const { service } = setup();
    await issued(service);
    expect(await service.issue(issueCmd())).toMatchObject({ ok: false, error: { code: "REISSUE_REQUIRED" } });
  });

  it("la reemisión con otra clave deja un solo token vigente y revoca el anterior", async () => {
    const { service } = setup();
    const first = await issued(service);
    const second = await issued(service, { idempotencyKey: "issue-key-0002" });
    expect(second.token).not.toBe(first.token);
    expect(await service.read(first.token)).toMatchObject({ ok: true, value: { kind: "unavailable", availability: "no_disponible" } });
    expect(await service.read(second.token)).toMatchObject({ ok: true, value: { kind: "available" } });
    // Otro tercero de la misma revisión conserva el suyo.
    const other = await issued(service, { role: "intermediario", idempotencyKey: "issue-key-0003" });
    expect(await service.read(second.token)).toMatchObject({ ok: true, value: { kind: "available" } });
    expect(await service.read(other.token)).toMatchObject({ ok: true, value: { kind: "available" } });
  });

  it("rol no seleccionado, revisión sustituida, ajena, sin sesión y clave con otro contenido", async () => {
    const { service, mem } = setup();
    mem.seedRevision({ ownerId: ANA, revisionId: "rev-solo", snapshotId: "s", snapshotHash: HASH, content: { ...content, selection: ["autor", "comprador"] } });
    expect(await service.issue(issueCmd({ revisionId: "rev-solo", role: "intermediario" }))).toMatchObject({ ok: false, error: { code: "ROLE_NOT_SELECTED" } });
    expect(await setup(LUIS).service.issue(issueCmd())).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(await setup(null).service.issue(issueCmd())).toMatchObject({ ok: false, error: { code: "NO_SESSION" } });
    expect(await service.issue(issueCmd({ role: "autor" }))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    await issued(service);
    expect(await service.issue(issueCmd({ role: "intermediario" }))).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
    mem.supersede(REV);
    expect(await service.issue(issueCmd({ idempotencyKey: "issue-key-0009" }))).toMatchObject({ ok: false, error: { code: "REVISION_NOT_ACTIVE" } });
  });

  it("revocar: el enlace deja de leerse y de responder; repetir es idempotente; solo el propietario", async () => {
    const { service } = setup();
    const inv = await issued(service);
    expect(await setup(LUIS).service.revoke(inv.invitationId)).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(await service.revoke(inv.invitationId)).toMatchObject({ ok: true });
    expect(await service.revoke(inv.invitationId)).toMatchObject({ ok: true, replayed: true });
    expect(await service.read(inv.token)).toMatchObject({ ok: true, value: { availability: "no_disponible" } });
    expect(await service.respond(respondCmd(inv.token))).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
  });
});

describe("MVP-073 · lectura pública sin consumo", () => {
  it("entrega el snapshot completo e idéntico por allowlist, sin ids privados ni chat", async () => {
    const { service } = setup();
    const inv = await issued(service);
    const r = await service.read(inv.token);
    if (!r.ok || r.value.kind !== "available") throw new Error("read");
    const dto = r.value.invitation;
    expect(PublicInvitationSchema.safeParse(dto).success).toBe(true);
    expect(dto).toMatchObject({ revisionId: REV, snapshotId: SNAP, snapshotHash: HASH, role: "comprador", availability: "disponible", selection: content.selection });
    expect(dto.operation).toEqual(content.operation);
    expect(dto.warnings).toEqual(content.warnings);
    expect(Object.keys(dto).sort()).toEqual(["availability", "expiresAt", "operation", "revisionId", "role", "schemaVersion", "selection", "snapshotHash", "snapshotId", "warnings"]);
    expect(JSON.stringify(dto)).not.toMatch(/ownerId|tokenHash|invitationId|privateLocation|messageId|evidenceId/i);
  });

  it("un GET repetido no cambia nada y la persona aún puede responder", async () => {
    const { service, mem } = setup();
    const inv = await issued(service);
    const before = mem.dump();
    for (let i = 0; i < 5; i += 1) await service.read(inv.token);
    expect(mem.dump()).toBe(before);
    expect(mem.responsesOf(REV)).toHaveLength(0);
    expect(await service.respond(respondCmd(inv.token))).toMatchObject({ ok: true });
  });

  it("inexistente, mal formado y revocado dan la misma respuesta; el mal formado ni consulta la base", async () => {
    const { service, mem } = setup();
    const inv = await issued(service);
    await service.revoke(inv.invitationId);
    const reads = mem.calls.read;
    const unknown = await service.read(generateInvitationToken());
    const revoked = await service.read(inv.token);
    const malformed = await service.read("corto");
    expect(unknown).toEqual(revoked);
    expect(malformed).toEqual(revoked);
    expect(mem.calls.read).toBe(reads + 2);
  });

  it("vencida, sustituida y ya respondida tienen su propio estado", async () => {
    const a = setup();
    const invA = await issued(a.service);
    a.mem.advance(73 * HOUR);
    expect(await a.service.read(invA.token)).toMatchObject({ value: { kind: "unavailable", availability: "caducada" } });

    const b = setup();
    const invB = await issued(b.service);
    b.mem.supersede(REV);
    expect(await b.service.read(invB.token)).toMatchObject({ value: { availability: "sustituida" } });

    const c = setup();
    const invC = await issued(c.service);
    await c.service.respond(respondCmd(invC.token));
    expect(await c.service.read(invC.token)).toMatchObject({ value: { availability: "ya_respondida" } });
  });

  it("la vigencia es de 72 h desde la emisión y el GET no la renueva", async () => {
    const { service, mem } = setup();
    const inv = await issued(service);
    mem.advance(71 * HOUR);
    await service.read(inv.token);
    mem.advance(2 * HOUR);
    expect(await service.read(inv.token)).toMatchObject({ value: { availability: "caducada" } });
  });
});

describe("MVP-074 · respuesta atómica e idempotente", () => {
  it("confirmar con nombre autodeclarado: parcial hasta que confirme el autor, después completa", async () => {
    const { service, mem } = setup();
    const inv = await issued(service);
    const r = await service.respond(respondCmd(inv.token));
    expect(r).toMatchObject({
      ok: true,
      value: { confirmationStatus: "parcial", actor: { role: "comprador", declaredName: "Juan Pérez" }, outcome: { decision: "confirmar" }, replayed: false, revisionId: REV, snapshotHash: HASH },
    });
    mem.confirmAsAuthor(REV);
    const other = await issued(service, { role: "intermediario", idempotencyKey: "issue-key-0002" });
    const r2 = await service.respond(respondCmd(other.token, { declaredName: "Marta Gómez" }));
    expect(r2).toMatchObject({ ok: true, value: { confirmationStatus: "completa", actor: { role: "intermediario" } } });
  });

  it("rechazar: nombre obligatorio, casilla vacía y ratificación; el rechazo queda persistido", async () => {
    const { service, mem } = setup();
    const inv = await issued(service);
    const r = await service.respond(respondCmd(inv.token, { decision: "rechazar", checkboxChecked: false, rejectionRatified: true }));
    expect(r).toMatchObject({ ok: true, value: { confirmationStatus: "rechazada", outcome: { decision: "rechazar", rejectionRatified: true }, actor: { declaredName: "Juan Pérez" } } });
    expect(mem.responsesOf(REV)).toHaveLength(1);
  });

  it.each([
    ["confirmar sin casilla", { checkboxChecked: false }],
    ["rechazar con casilla marcada", { decision: "rechazar", checkboxChecked: true, rejectionRatified: true }],
    ["rechazar sin ratificación", { decision: "rechazar", checkboxChecked: false }],
    ["sin nombre", { declaredName: "   " }],
    ["nombre de 201 caracteres", { declaredName: "a".repeat(201) }],
    ["comando del autor", { actor: "autor", documentId: "doc-1", token: undefined, declaredName: undefined }],
    ["campo de más", { esAdmin: true }],
  ])("comando incoherente rechazado en servidor: %s", async (_, over) => {
    const { service, mem } = setup();
    const inv = await issued(service);
    expect(await service.respond(respondCmd(inv.token, over))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(mem.responsesOf(REV)).toHaveLength(0);
  });

  it("doble clic o reintento con la misma clave: una sola decisión", async () => {
    const { service, mem } = setup();
    const inv = await issued(service);
    const [a, b] = await Promise.all([service.respond(respondCmd(inv.token)), service.respond(respondCmd(inv.token))]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.responseId).toBe(b.value.responseId);
    expect([a, b].filter((r) => r.ok && r.replayed)).toHaveLength(1);
    expect(mem.responsesOf(REV)).toHaveLength(1);
  });

  it("misma clave con otro contenido es conflicto; token consumido con otra decisión, error estable", async () => {
    const { service, mem } = setup();
    const inv = await issued(service);
    await service.respond(respondCmd(inv.token));
    expect(await service.respond(respondCmd(inv.token, { declaredName: "Otra Persona" }))).toMatchObject({ ok: false, error: { code: "IDEMPOTENCY_CONFLICT" } });
    const reject = respondCmd(inv.token, { idempotencyKey: "respond-key-0002", decision: "rechazar", checkboxChecked: false, rejectionRatified: true });
    expect(await service.respond(reject)).toMatchObject({ ok: false, error: { code: "ALREADY_RESPONDED" } });
    expect(mem.responsesOf(REV)).toHaveLength(1);
  });

  it("confirmar y rechazar a la vez sobre el mismo token: una sola ganadora", async () => {
    const { service, mem } = setup();
    const inv = await issued(service);
    const results = await Promise.all([
      service.respond(respondCmd(inv.token, { idempotencyKey: "respond-key-aaaa" })),
      service.respond(respondCmd(inv.token, { idempotencyKey: "respond-key-bbbb", decision: "rechazar", checkboxChecked: false, rejectionRatified: true })),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.error.code === "ALREADY_RESPONDED")).toHaveLength(1);
    expect(mem.responsesOf(REV)).toHaveLength(1);
  });

  it("una respuesta tardía no revive una revisión sustituida, un vencimiento ni un enlace revocado", async () => {
    const sup = setup();
    const invSup = await issued(sup.service);
    sup.mem.supersede(REV);
    expect(await sup.service.respond(respondCmd(invSup.token))).toMatchObject({ ok: false, error: { code: "REVISION_SUPERSEDED" } });

    const exp = setup();
    const invExp = await issued(exp.service);
    exp.mem.advance(73 * HOUR);
    expect(await exp.service.respond(respondCmd(invExp.token))).toMatchObject({ ok: false, error: { code: "INVITATION_EXPIRED" } });
    expect(sup.mem.responsesOf(REV)).toHaveLength(0);
    expect(exp.mem.responsesOf(REV)).toHaveLength(0);
  });

  it("revisión, snapshot o hash distintos de los vistos: no se registra nada", async () => {
    const { service, mem } = setup();
    const inv = await issued(service);
    for (const over of [{ snapshotHash: "0".repeat(64) }, { snapshotId: "otro" }, { revisionId: "otra" }]) {
      expect(await service.respond(respondCmd(inv.token, over))).toMatchObject({ ok: false, error: { code: "SNAPSHOT_MISMATCH" } });
    }
    expect(mem.responsesOf(REV)).toHaveLength(0);
    expect(await service.respond(respondCmd(inv.token))).toMatchObject({ ok: true });
  });

  it("token mal formado o desconocido: no disponible, sin tocar la base", async () => {
    const { service, mem } = setup();
    expect(await service.respond(respondCmd("corto"))).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
    expect(mem.calls.respond).toBe(0);
    expect(await service.respond(respondCmd(generateInvitationToken()))).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
  });
});

describe("El token no aparece en logs ni en errores", () => {
  it("ni en consola, ni en la base, ni en las respuestas de error o de una falla de base", async () => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "info")];
    const { service, mem } = setup();
    const inv = await issued(service);
    const outputs: unknown[] = [];
    outputs.push(await service.read(inv.token));
    outputs.push(await service.respond(respondCmd(inv.token, { declaredName: "  " })));
    outputs.push(await service.respond(respondCmd(inv.token)));
    outputs.push(await service.respond(respondCmd(inv.token, { idempotencyKey: "respond-key-0002" })));
    mem.failWith(new Error(`falla con ${inv.token}`));
    const failed = await service.respond(respondCmd(inv.token, { idempotencyKey: "respond-key-0003" }));
    expect(failed).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE", retryable: true } });
    outputs.push(failed, await service.read(inv.token));
    mem.failWith(null);

    for (const out of outputs) expect(JSON.stringify(out)).not.toContain(inv.token.slice(0, 20));
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain(inv.token.slice(0, 20));
    expect(mem.dump()).not.toContain(inv.token);
  });
});

describe("MVP-072/073/074 · handlers HTTP", () => {
  const post = (body: unknown) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
  const get = () => new Request("http://localhost/api");

  it("emitir (201) devuelve el token una vez; repetir pide reemitir (409); sin sesión 401", async () => {
    const { service } = setup();
    const handler = createIssueInvitationHandler(async () => service);
    const a = await handler(post(issueCmd()));
    expect(a.status).toBe(201);
    expect(a.headers.get("Cache-Control")).toContain("no-store");
    expect(isWellFormedToken((await a.json()).token)).toBe(true);
    const b = await handler(post(issueCmd()));
    expect(b.status).toBe(409);
    expect(JSON.stringify(await b.json())).not.toMatch(/token"\s*:\s*"[A-Za-z0-9_-]{43}/);
    expect((await createIssueInvitationHandler(async () => setup(null).service)(post(issueCmd()))).status).toBe(401);
  });

  it("leer: 200 disponible, 404 inexistente, 410 vencida; cabeceras públicas y sin el token en el cuerpo de error", async () => {
    const { service, mem } = setup();
    const inv = await issued(service);
    const read = createReadInvitationHandler(async () => service);
    const ok = await read(get(), inv.token);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toContain("no-store");
    expect(ok.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(ok.headers.get("X-Robots-Tag")).toContain("noindex");
    expect((await ok.json()).invitation.availability).toBe("disponible");

    const missing = await read(get(), generateInvitationToken());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ status: "unavailable", availability: "no_disponible" });

    mem.advance(73 * HOUR);
    const late = await read(get(), inv.token);
    expect(late.status).toBe(410);
    expect(JSON.stringify(await late.json())).not.toContain(inv.token);
  });

  it("responder: 201, repetir 200, consumida 409; el actor siempre es tercero", async () => {
    const { service } = setup();
    const inv = await issued(service);
    const respond = createRespondInvitationHandler(async () => service);
    const { actor: _actor, ...body } = respondCmd(inv.token, { actor: "autor" });
    void _actor;
    const a = await respond(post(body));
    expect(a.status).toBe(201);
    expect(await a.json()).toMatchObject({ confirmationStatus: "parcial", actor: { role: "comprador" } });
    expect((await respond(post(body))).status).toBe(200);
    expect((await respond(post({ ...body, idempotencyKey: "respond-key-0002" }))).status).toBe(409);
    expect((await respond(new Request("http://localhost/api", { method: "POST", body: "no json" }))).status).toBe(400);
  });

  it("revocar: 200 y luego 404 para ajenos", async () => {
    const { service } = setup();
    const inv = await issued(service);
    expect((await createRevokeInvitationHandler(async () => service)(post({}), inv.invitationId)).status).toBe(200);
    expect((await createRevokeInvitationHandler(async () => setup(LUIS).service)(post({}), inv.invitationId)).status).toBe(404);
  });
});
