import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

import { psqlOk, readLocalStack, type LocalStack } from "../../server/rls/harness";

/**
 * Siembra determinista y ficticia para el E2E del autor: una cuenta confirmada y varios
 * documentos con mensaje, evidencia, borrador y reporte (sin IA ni Hedera). El congelado, las
 * invitaciones y las confirmaciones las hace el producto real durante la prueba. Credenciales y
 * ids van al archivo de `REVIEW_E2E_SEED_FILE` (lo borra el runner); no se imprimen.
 */

const DOCUMENT_KEYS = ["solo", "intermediario", "comprador", "ambos", "cambio", "sin-cambio"] as const;

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const operation = { title: "Acuerdo ficticio de entrega", body: "Se entregan 12 cajas de ejemplo.", corrections: [] as string[] };

async function seedDocument(stack: LocalStack, accessToken: string, title: string) {
  const rpc = createClient(stack.apiUrl, stack.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const created = await rpc.rpc("create_document", { p_title: title, p_key: `doc-${randomUUID()}`, p_correlation_id: "corr-doc" });
  const documentId = created.data.value.documentId as string;
  const message = await rpc.rpc("append_message", {
    p_document_id: documentId, p_content: "Vendí 10 cajas", p_declared_event_date: { kind: "unknown" }, p_key: `msg-${randomUUID()}`, p_correlation_id: "corr-msg",
  });
  const messageId = message.data.value.messageId as string;
  const evidenceId = randomUUID();
  const extractionId = randomUUID();
  await psqlOk(`
begin;
insert into public.evidences (id, document_id, message_id, kind, mime_type, byte_length, sha256, private_location)
  values ('${evidenceId}', '${documentId}', '${messageId}', 'pdf', 'application/pdf', 10, '${sha("e")}', '${documentId}/${randomUUID()}');
insert into public.evidence_extractions (id, document_id, evidence_id, method, result) values ('${extractionId}', '${documentId}', '${evidenceId}', 'prueba', '{}');
insert into public.drafts (document_id, draft_revision, content) values ('${documentId}', 1, '${JSON.stringify(operation)}'::jsonb);
insert into public.verification_reports (document_id, input, output, model, prompt_version, rules_version) values ('${documentId}',
  '${JSON.stringify({ inputs: [{ ref: "m1", kind: "mensaje", id: messageId }, { ref: "e1", kind: "extraccion", id: extractionId }, { ref: "b1", kind: "borrador", id: randomUUID() }] })}'::jsonb,
  '${JSON.stringify({ result: "contradiccion_critica", draftRevision: 1, findings: [{ message: "Las fuentes no coinciden: 10 cajas (m1) y 12 cajas (e1).", severity: "critical", sourceRefs: ["m1", "e1"] }] })}'::jsonb,
  'modelo-ficticio', 'contrast-v1', 'rules-v1');
commit;`);
  return documentId;
}

it("siembra la cuenta del autor y un documento por escenario", async () => {
  const file = process.env.REVIEW_E2E_SEED_FILE;
  expect(file, "falta REVIEW_E2E_SEED_FILE: usá `npm run test:e2e:review`").toBeTruthy();
  const stack = readLocalStack();

  const email = `autor-${randomUUID()}@galcoa.test`;
  const password = `pw-${randomUUID()}`;
  const admin = createClient(stack.apiUrl, stack.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error, "alta de la cuenta ficticia").toBeNull();

  const anon = createClient(stack.apiUrl, stack.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const session = await anon.auth.signInWithPassword({ email, password });
  expect(session.error, "sesión de siembra").toBeNull();
  const accessToken = session.data.session!.access_token;

  const documents: Record<string, string> = {};
  for (const key of DOCUMENT_KEYS) documents[key] = await seedDocument(stack, accessToken, `Documento ficticio ${key}`);
  writeFileSync(file!, JSON.stringify({ email, password, documents }), { mode: 0o600 });
});
