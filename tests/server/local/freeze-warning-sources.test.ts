import { createHash, randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createRevisionService } from "@/lib/documents/revisions/service";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";

import { localAlc } from "./alc-support";

import { anonClient, createTestUser, psqlOk, readLocalStack, type LocalStack, type TestUser } from "../rls/harness";

/**
 * Lectura congelada (migración 02503) con Postgres/Auth locales reales: `get_freeze_source` elige por
 * separado el contraste y la redacción del borrador vigente EXACTO, y el adaptador combina
 * advertencias de ambos agentes sin atribuir evaluaciones no ejecutadas. Datos ficticios.
 */

let stack: LocalStack;
let ana: TestUser;
let luis: TestUser;

beforeAll(async () => {
  stack = readLocalStack();
  ana = await createTestUser(stack, "fws-a");
  luis = await createTestUser(stack, "fws-b");
});

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const json = (v: unknown) => `${lit(JSON.stringify(v))}::jsonb`;
const content = (body: string) => ({ title: "Acuerdo ficticio", body, corrections: [] as string[] });

type World = { documentId: string; draftId: string; msg1: string; msg2: string; evidenceId: string; extractionId: string; reportId: string };

/** Documento con dos mensajes, una evidencia aceptada con extracción y un borrador en la revisión 3. */
async function world(user: TestUser, body = "Se entregan 12 cajas de ejemplo."): Promise<World> {
  const created = await user.client.rpc("create_document", { p_title: "Documento ficticio", p_key: `doc-${randomUUID()}`, p_correlation_id: "corr-doc" });
  const documentId = created.data.value.documentId as string;
  const send = async (text: string) =>
    (await user.client.rpc("append_message", { p_document_id: documentId, p_content: text, p_declared_event_date: { kind: "unknown" }, p_key: `msg-${randomUUID()}`, p_correlation_id: "corr-msg" })).data.value.messageId as string;
  const msg1 = await send("Vendí 10 cajas");
  const msg2 = await send("Otro mensaje");
  const evidenceId = randomUUID();
  const extractionId = randomUUID();
  const draftId = randomUUID();
  const reportId = randomUUID();
  await psqlOk(`begin;
insert into public.evidences (id, document_id, message_id, kind, mime_type, byte_length, sha256, private_location, upload_state, accepted_at)
  values ('${evidenceId}', '${documentId}', '${msg1}', 'pdf', 'application/pdf', 10, '${sha("e")}', '${documentId}/${randomUUID()}', 'accepted', now());
insert into public.evidence_extractions (id, document_id, evidence_id, method, result) values ('${extractionId}', '${documentId}', '${evidenceId}', 'prueba', '{}');
insert into public.drafts (id, document_id, draft_revision, content, source_refs) values ('${draftId}', '${documentId}', 3, ${json(content(body))}, ${json([{ kind: "reporte", id: reportId }])});
commit;`);
  return { documentId, draftId, msg1, msg2, evidenceId, extractionId, reportId };
}

const insertReport = (w: World, input: unknown, output: unknown, id: string = randomUUID()) =>
  psqlOk(`insert into public.verification_reports (id, document_id, input, output, model, prompt_version, rules_version)
    values ('${id}', '${w.documentId}', ${json(input)}, ${json(output)}, 'modelo-ficticio', 'prompt-v1', 'formato-v1');`).then(() => id);

const contrastInput = (w: World, over: Record<string, unknown> = {}) => ({
  kind: "contraste", schemaVersion: 1,
  inputs: [{ ref: "m1", kind: "mensaje", id: w.msg1 }, { ref: "e1", kind: "extraccion", id: w.extractionId }, { ref: "b1", kind: "borrador", id: w.draftId }],
  draft: { draftId: w.draftId, draftRevision: 3, content: content("Se entregan 12 cajas de ejemplo.") }, ...over,
});
const contrastOutput = (w: World, over: Record<string, unknown> = {}) => ({
  kind: "contraste", schemaVersion: 1, draftId: w.draftId, draftRevision: 3, result: "contradiccion_critica",
  findings: [{ message: "Las fuentes no coinciden: 10 cajas (m1) y 12 cajas (e1).", severity: "critical", sourceRefs: ["m1", "e1", "b1"] }], ...over,
});

/** Publica una redacción como `complete_chat_turn`: su id figura en `drafts.source_refs` (`world` lo reservó). */
async function publishDraftingReport(w: World, over: { revision?: number; kind?: string; warnings?: unknown; link?: boolean } = {}) {
  const id: string = over.link === false ? randomUUID() : w.reportId;
  const revision = over.revision ?? 3;
  await insertReport(w,
    { kind: over.kind ?? "redaccion", schemaVersion: 1, expectedDraftRevision: revision - 1, inputs: [{ ref: "m1", kind: "mensaje", id: w.msg2 }, { ref: "e1", kind: "extraccion", id: w.extractionId }] },
    { kind: over.kind ?? "redaccion", schemaVersion: 1, publishedDraftRevision: revision, proposal: { title: "T", body: "B", facts: [], warnings: over.warnings ?? [{ message: "Falta la unidad (m1)", severity: "warning", sourceRefs: ["m1", "e1"] }] } },
    id);
  return id;
}

const read = async (user: TestUser, w: World) => (await user.client.rpc("get_freeze_source", { p_document_id: w.documentId })).data;

describe("get_freeze_source: reportes discriminados", () => {
  it("devuelve contraste y redacción vigentes por separado, con sus refs resueltos", async () => {
    const w = await world(ana);
    await insertReport(w, contrastInput(w), contrastOutput(w));
    await publishDraftingReport(w);
    const source = await read(ana, w);
    expect(source.report).toEqual({ result: "contradiccion_critica", findings: [expect.objectContaining({ severity: "critical" })] });
    expect(source.refs).toEqual([{ ref: "m1", kind: "mensaje", id: w.msg1 }, { ref: "e1", kind: "evidencia", id: w.evidenceId }]);
    expect(source.agent1).toEqual({
      warnings: [{ message: "Falta la unidad (m1)", severity: "warning", sourceRefs: ["m1", "e1"] }],
      refs: [{ ref: "m1", kind: "mensaje", id: w.msg2 }, { ref: "e1", kind: "evidencia", id: w.evidenceId }],
    });
  });

  it("una redacción no se toma por contraste y viceversa", async () => {
    const onlyDrafting = await world(ana);
    await publishDraftingReport(onlyDrafting);
    expect(await read(ana, onlyDrafting)).toMatchObject({ report: null, agent1: { warnings: [expect.anything()] } });
    const onlyContrast = await world(ana);
    await insertReport(onlyContrast, contrastInput(onlyContrast), contrastOutput(onlyContrast));
    expect(await read(ana, onlyContrast)).toMatchObject({ report: { result: "contradiccion_critica" }, agent1: null });
  });

  it("excluye contrastes de otra revisión, otro contenido u otro borrador; usa el último compatible", async () => {
    const w = await world(ana);
    const stale = [
      [contrastInput(w), contrastOutput(w, { draftRevision: 2 })],
      [contrastInput(w, { draft: { draftId: w.draftId, draftRevision: 3, content: content("Otro texto") } }), contrastOutput(w)],
      [contrastInput(w), contrastOutput(w, { draftId: randomUUID() })],
      [contrastInput(w), contrastOutput(w, { kind: "desconocido" })],
      [contrastInput(w), contrastOutput(w, { schemaVersion: 2 })],
    ];
    for (const [input, output] of stale) await insertReport(w, input, output);
    expect((await read(ana, w)).report).toBeNull();

    await insertReport(w, contrastInput(w), contrastOutput(w, { result: "con_advertencias", findings: [{ message: "Vieja", severity: "warning", sourceRefs: ["m1"] }] }));
    await insertReport(w, contrastInput(w), contrastOutput(w, { result: "con_advertencias", findings: [{ message: "Nueva", severity: "warning", sourceRefs: ["m1"] }] }));
    expect((await read(ana, w)).report.findings[0].message).toBe("Nueva");
  });

  it("al avanzar el borrador, redacción y contraste anteriores dejan de contar", async () => {
    const w = await world(ana);
    await insertReport(w, contrastInput(w), contrastOutput(w));
    await publishDraftingReport(w);
    await psqlOk(`update public.drafts set draft_revision = 4, content = ${json(content("Se entregan 11 cajas."))}, updated_at = now() where document_id = '${w.documentId}';`);
    expect(await read(ana, w)).toMatchObject({ draft: { draftRevision: 4 }, report: null, agent1: null });
  });

  it("la redacción exige coincidir con la revisión publicada y figurar en el borrador; ignora kind desconocido", async () => {
    const orphan = await world(ana);
    await publishDraftingReport(orphan, { link: false });
    expect((await read(ana, orphan)).agent1).toBeNull();
    const otherRevision = await world(ana);
    await publishDraftingReport(otherRevision, { revision: 2 });
    expect((await read(ana, otherRevision)).agent1).toBeNull();
    const unknown = await world(ana);
    await publishDraftingReport(unknown, { kind: "futuro" });
    expect(await read(ana, unknown)).toMatchObject({ report: null, agent1: null });
  });

  it("un reporte vigente corrupto se devuelve sin normalizar (no se omite) y congelar falla sin advertir en silencio", async () => {
    const badDrafting = await world(ana);
    await publishDraftingReport(badDrafting, { warnings: "no es una lista" });
    expect((await read(ana, badDrafting)).agent1.warnings).toBe("no es una lista");

    const badContrast = await world(ana);
    await insertReport(badContrast, contrastInput(badContrast), contrastOutput(badContrast, { result: "aprobado" }));
    expect((await read(ana, badContrast)).report.result).toBe("aprobado");

    const masksOlder = await world(ana);
    await insertReport(masksOlder, contrastInput(masksOlder), contrastOutput(masksOlder, { result: "con_advertencias", findings: [] }));
    await insertReport(masksOlder, contrastInput(masksOlder), contrastOutput(masksOlder, { findings: "roto" }));
    expect((await read(ana, masksOlder)).report.findings).toBe("roto");

    for (const w of [badDrafting, badContrast, masksOlder]) {
      const { store, reader } = createSupabaseRevisionAdapters({ verifiedUserId: ana.id, session: ana.client });
      const service = createRevisionService({ session: { currentUserId: async () => ana.id }, source: reader, revisions: store, alc: localAlc(ana.id) });
      const frozen = await service.freeze({ documentId: w.documentId, expectedDraftRevision: 3, selection: ["comprador"], idempotencyKey: `freeze-${randomUUID()}` });
      expect(frozen.ok).toBe(false);
      if (!frozen.ok) expect(frozen.error.code).toBe("TECHNICAL_FAILURE");
      expect(await psqlOk(`select count(*) from public.document_revisions where document_id = '${w.documentId}';`)).toEqual([["0"]]);
    }
  });

  it("conserva el reporte histórico sin kind de la revisión vigente", async () => {
    const w = await world(ana);
    await insertReport(w,
      { inputs: [{ ref: "m1", kind: "mensaje", id: w.msg1 }, { ref: "b1", kind: "borrador", id: randomUUID() }] },
      { result: "con_advertencias", draftRevision: 3, findings: [{ message: "Histórica", severity: "warning", sourceRefs: ["m1"] }] });
    expect(await read(ana, w)).toMatchObject({ report: { result: "con_advertencias" }, refs: [{ ref: "m1", kind: "mensaje", id: w.msg1 }], agent1: null });
  });

  it("otro usuario y anon no leen: igual que un documento inexistente o sin sesión", async () => {
    const w = await world(ana);
    await publishDraftingReport(w);
    expect(await read(luis, w)).toBeNull();
    const anon = await anonClient(stack).rpc("get_freeze_source", { p_document_id: w.documentId });
    expect(anon.data).toBeNull();
    expect(anon.error).not.toBeNull();
  });
});

describe("congelado con ambos agentes", () => {
  it("el snapshot lleva las advertencias de Agente 1 y Agente 2 con fuentes distintas, sin ids ni refs privados", async () => {
    const w = await world(ana);
    await insertReport(w, contrastInput(w), contrastOutput(w));
    await publishDraftingReport(w);
    const { store, reader } = createSupabaseRevisionAdapters({ verifiedUserId: ana.id, session: ana.client });
    const service = createRevisionService({ session: { currentUserId: async () => ana.id }, source: reader, revisions: store, alc: localAlc(ana.id) });
    const frozen = await service.freeze({ documentId: w.documentId, expectedDraftRevision: 3, selection: ["comprador"], idempotencyKey: `freeze-${randomUUID()}` });
    if (!frozen.ok) throw new Error(`freeze: ${frozen.error.code}`);
    const warnings = frozen.value.snapshot.content.warnings;
    expect(warnings).toHaveLength(2);
    expect(warnings.map((x) => x.severity).sort()).toEqual(["critical", "warning"]);
    // El control documental se deriva de la evaluación ALC (verde en este fixture), no de la severidad de las advertencias.
    expect(frozen.value.revision.controlStatus).toBe("sin_inconsistencias_criticas_detectadas");
    expect(JSON.stringify(frozen.value.snapshot.content)).not.toMatch(/\b[me]\d+\b|b1/);
    // Tres fuentes reales distintas de las advertencias (mensaje 1, mensaje 2 y evidencia) más las dos que cita la evaluación ALC (`ALC-n`).
    expect(await psqlOk(`select count(*) from public.snapshot_sources where revision_id = '${frozen.value.revision.revisionId}';`)).toEqual([["5"]]);
    expect(await psqlOk(`select alias from public.snapshot_sources where revision_id = '${frozen.value.revision.revisionId}' and alias like 'ALC-%' order by 1;`)).toEqual([["ALC-1"], ["ALC-2"]]);
  });
});
