import { randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

import { expect, it } from "vitest";

import { createInvitationService } from "@/lib/documents/invitations/service";
import { createSupabaseInvitationStore } from "@/lib/documents/invitations/supabase";
import { createRevisionService } from "@/lib/documents/revisions/service";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";

import { localAlc } from "../../server/local/alc-support";

import { createTestUser, psqlOk, readLocalStack, type TestUser } from "../../server/rls/harness";

/**
 * Siembra datos ficticios en la base local y escribe los tokens efímeros en el archivo
 * que indica `CONFIRM_E2E_SEED_FILE` (lo borra el runner). No imprime tokens. Si falta
 * la variable, falla: no se omite en silencio.
 */

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const op = (body: string) => ({ title: "Acuerdo ficticio de entrega", body, corrections: [] as string[] });

async function seedOne(user: TestUser, body: string) {
  const created = await user.client.rpc("create_document", { p_title: "Documento ficticio", p_key: `doc-${randomUUID()}`, p_correlation_id: "corr-doc" });
  const documentId = created.data.value.documentId as string;
  const message = await user.client.rpc("append_message", {
    p_document_id: documentId, p_content: "Vendí 12 cajas", p_declared_event_date: { kind: "unknown" }, p_key: `msg-${randomUUID()}`, p_correlation_id: "corr-msg",
  });
  const messageId = message.data.value.messageId as string;
  const evidenceId = randomUUID();
  const extractionId = randomUUID();
  await psqlOk(`
begin;
insert into public.evidences (id, document_id, message_id, kind, mime_type, byte_length, sha256, private_location)
  values ('${evidenceId}', '${documentId}', '${messageId}', 'pdf', 'application/pdf', 10, '${sha("e")}', '${documentId}/${randomUUID()}');
insert into public.evidence_extractions (id, document_id, evidence_id, method, result) values ('${extractionId}', '${documentId}', '${evidenceId}', 'prueba', '{}');
insert into public.drafts (document_id, draft_revision, content) values ('${documentId}', 1, '${JSON.stringify(op(body))}'::jsonb);
insert into public.verification_reports (document_id, input, output, model, prompt_version, rules_version) values ('${documentId}',
  '${JSON.stringify({ inputs: [{ ref: "m1", kind: "mensaje", id: messageId }, { ref: "e1", kind: "extraccion", id: extractionId }, { ref: "b1", kind: "borrador", id: randomUUID() }] })}'::jsonb,
   '${JSON.stringify({ result: "sin_inconsistencias_criticas_detectadas", draftRevision: 1, findings: [] })}'::jsonb,
  'modelo-ficticio', 'contrast-v1', 'rules-v1');
commit;`);

  const session = { currentUserId: async () => user.id };
  const { store, reader } = createSupabaseRevisionAdapters({ verifiedUserId: user.id, session: user.client });
  const revisions = createRevisionService({ session, source: reader, revisions: store, alc: localAlc(user.id) });
  const invitations = createInvitationService({ session, invitations: createSupabaseInvitationStore({ verifiedUserId: user.id, rpc: user.client }) });
  const frozen = await revisions.freeze({ documentId, expectedDraftRevision: 1, selection: ["comprador"], idempotencyKey: `freeze-${randomUUID()}` });
  if (!frozen.ok) throw new Error(`freeze: ${frozen.error.code}`);
  const declared = await revisions.confirmAsAuthor({
    schemaVersion: 1,
    documentId, revisionId: frozen.value.revision.revisionId,
    snapshotId: frozen.value.snapshot.snapshotId, snapshotHash: frozen.value.snapshot.snapshotHash,
    actor: "autor", decision: "confirmar", checkboxChecked: true, idempotencyKey: `author-${randomUUID()}`,
  });
  if (!declared.ok) throw new Error(`author: ${declared.error.code}`);
  const invite = await invitations.issue({ revisionId: frozen.value.revision.revisionId, role: "comprador", idempotencyKey: `issue-${randomUUID()}` });
  if (!invite.ok) throw new Error(`issue: ${invite.error.code}`);
  return invite.value.token;
}

it("siembra tres invitaciones independientes (confirmar, rechazar, móvil)", async () => {
  const file = process.env.CONFIRM_E2E_SEED_FILE;
  expect(file, "falta CONFIRM_E2E_SEED_FILE: usá `npm run test:e2e:confirm`").toBeTruthy();
  const user = await createTestUser(readLocalStack(), "e2e-conf");
  const tokens = {
    confirm: await seedOne(user, "Se entregan 12 cajas de ejemplo."),
    reject: await seedOne(user, "Se entregan 12 cajas de ejemplo."),
    mobile: await seedOne(user, "Se entregan 12 cajas de ejemplo."),
  };
  writeFileSync(file!, JSON.stringify(tokens), { mode: 0o600 });
});
