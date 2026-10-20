import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

import { psqlOk, readLocalStack, type LocalStack } from "../../server/rls/harness";
import { localAlc } from "../../server/local/alc-support";
import type { AlcEvaluation } from "@/lib/documents/alc/service";
import { buildTestBridge } from "../../server/bridge/build";

/**
 * Siembra determinista y ficticia para el E2E del autor: una cuenta confirmada y varios
 * documentos con mensaje, evidencia, borrador y reporte (sin IA ni Hedera). El congelado, las
 * invitaciones y las confirmaciones las hace el producto real durante la prueba. Credenciales y
 * ids van al archivo de `REVIEW_E2E_SEED_FILE` (lo borra el runner); no se imprimen.
 */

const DOCUMENT_KEYS = ["comprador", "ambos", "cambio", "sin-cambio"] as const;

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
    p_document_id: documentId, p_content: "Se entregan 12 cajas de ejemplo.", p_declared_event_date: { kind: "unknown" }, p_key: `msg-${randomUUID()}`, p_correlation_id: "corr-msg",
  });
  const messageId = message.data.value.messageId as string;
  const evidenceId = randomUUID();
  const extractionId = randomUUID();
  await psqlOk(`
begin;
insert into public.evidences (id, document_id, message_id, kind, mime_type, byte_length, sha256, private_location)
  values ('${evidenceId}', '${documentId}', '${messageId}', 'pdf', 'application/pdf', 10, '${sha("e")}', '${documentId}/${randomUUID()}');
 insert into public.evidence_extractions (id, document_id, evidence_id, method, result)
   values ('${extractionId}', '${documentId}', '${evidenceId}', 'prueba', '${JSON.stringify({ schemaVersion: 1, text: operation.body, promptVersion: "fixture-v1", limitations: [] })}'::jsonb);
insert into public.drafts (document_id, draft_revision, content) values ('${documentId}', 1, '${JSON.stringify(operation)}'::jsonb);
insert into public.verification_reports (document_id, input, output, model, prompt_version, rules_version) values ('${documentId}',
  '${JSON.stringify({ inputs: [{ ref: "m1", kind: "mensaje", id: messageId }, { ref: "e1", kind: "extraccion", id: extractionId }, { ref: "b1", kind: "borrador", id: randomUUID() }] })}'::jsonb,
   '${JSON.stringify({ result: "sin_inconsistencias_criticas_detectadas", draftRevision: 1, findings: [] })}'::jsonb,
  'modelo-ficticio', 'contrast-v1', 'rules-v1');
commit;`);
  expect(await psqlOk(`select result->>'text' from public.evidence_extractions where id = '${extractionId}';`),
    "la extracción ficticia conserva texto legible para el lector real").toEqual([[operation.body]]);
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
  const evaluations: Record<string, AlcEvaluation> = {};
  for (const key of DOCUMENT_KEYS) {
    const documentId = await seedDocument(stack, accessToken, `Documento ficticio ${key}`);
    documents[key] = documentId;
    for (const selection of [["autor", "comprador"], ["autor", "intermediario", "comprador"]]) {
      const evaluated = await localAlc(created.data.user!.id).evaluate({
        ownerId: created.data.user!.id, documentId, selection,
        draft: { revision: 1, title: operation.title, body: operation.body },
      });
      if (!evaluated.ok) throw new Error(`evaluación ficticia: ${evaluated.error.code}`);
      evaluations[`${documentId}:${selection.join(",")}`] = evaluated.value;
    }
  }
  const bridge = await buildTestBridge({ entry: path.resolve("tests/e2e/review/bridge-entry.ts") });
  try {
    writeFileSync(file!, JSON.stringify({ email, password, documents, evaluations, bridgeUrl: bridge.fileUrl, bridgeDir: bridge.dir }), { mode: 0o600 });
  } catch (error) {
    bridge.cleanup();
    throw error;
  }
});
