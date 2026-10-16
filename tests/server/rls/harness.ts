import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";

/**
 * Helpers de la suite con base real (MVP-024; SH-09; data-transactions §7).
 * Reutilizables por MVP-120: Postgres/Auth/Storage locales de Supabase, sin dobles.
 * Las credenciales son las efímeras de la propia instancia local: se leen del
 * proceso de la CLI, viven solo en memoria y nunca se imprimen ni se escriben.
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const SUPABASE_CLI = path.join(ROOT, "node_modules", "supabase", "dist", "supabase.js");
/** Contenedor de Postgres de la pila local (`supabase/config.toml`: `project_id`). */
export const DB_CONTAINER = "supabase_db_galcoa";

/** Ejecuta la CLI de `supabase` instalada como devDependency (sin shell ni PATH). */
export function supabaseCli(args: string[], timeout = 240_000): string {
  return execFileSync(process.execPath, [SUPABASE_CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export type LocalStack = { apiUrl: string; anonKey: string; serviceKey: string };

export function readLocalStack(): LocalStack {
  const env = new Map<string, string>();
  for (const line of supabaseCli(["status", "-o", "env"], 60_000).split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq > 0) env.set(line.slice(0, eq), line.slice(eq + 1).replace(/^"|"$/g, ""));
  }
  const apiUrl = env.get("API_URL");
  const anonKey = env.get("ANON_KEY");
  const serviceKey = env.get("SERVICE_ROLE_KEY");
  if (!apiUrl || !anonKey || !serviceKey) throw new Error("La pila local de Supabase no está en marcha");
  return { apiUrl, anonKey, serviceKey };
}

/** Espera a que la API (PostgREST + Auth + Storage) responda tras un reset. */
export async function waitForApi(stack: LocalStack, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const rest = await fetch(`${stack.apiUrl}/rest/v1/`, { headers: { apikey: stack.anonKey } });
      const auth = await fetch(`${stack.apiUrl}/auth/v1/health`, { headers: { apikey: stack.anonKey } });
      const storage = await fetch(`${stack.apiUrl}/storage/v1/bucket`, {
        headers: { apikey: stack.anonKey, authorization: `Bearer ${stack.serviceKey}` },
      });
      if (rest.status < 500 && auth.ok && storage.ok) return;
    } catch {
      // aún arrancando
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("La API local de Supabase no respondió a tiempo");
}

// --- SQL con conexiones independientes (un proceso `psql` por llamada) -------------------

export type SqlResult = { ok: boolean; rows: string[][]; error: string };

/** Conexión administrativa local independiente. `supabase_admin` permite probar roles sin otorgarlos a postgres. */
export function psql(sql: string, databaseUser: "postgres" | "supabase_admin" = "postgres"): Promise<SqlResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", DB_CONTAINER, "psql", "-U", databaseUser, "-d", "postgres", "-X", "-q", "-A", "-t", "-F", "|", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({
        ok: code === 0,
        rows: stdout.split(/\r?\n/).filter(Boolean).map((line) => line.split("|")),
        error: stderr.trim(),
      }),
    );
    child.stdin.end(sql);
  });
}

/** Como `psql`, pero exige éxito (para semillas y consultas de verificación). */
export async function psqlOk(sql: string): Promise<string[][]> {
  const result = await psql(sql);
  if (!result.ok) throw new Error(`SQL inesperadamente rechazado: ${result.error}`);
  return result.rows;
}

/** SQLSTATE usados por las aserciones negativas. */
export const SQLSTATE = {
  restrict: "23001", // guardas de inmutabilidad / solo-agregar
  notNull: "23502",
  foreignKey: "23503",
  unique: "23505",
  check: "23514",
  permission: "42501",
} as const;

/** Exige que el script falle con el SQLSTATE indicado (la conexión hace rollback). */
export async function expectRejected(sql: string, sqlstate: string, databaseUser: "postgres" | "supabase_admin" = "postgres"): Promise<void> {
  const result = await psql(sql, databaseUser);
  expect(result.ok, `se esperaba rechazo ${sqlstate}`).toBe(false);
  expect(result.error).toContain(`ERROR:  ${sqlstate}:`);
}

/** Tablas públicas sin RLS: el chequeo de catálogo exige que esté vacío. */
export const TABLES_WITHOUT_RLS_SQL = `
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1;`;

export type SqlActor = { kind: "anon" } | { kind: "authenticated"; userId: string } | { kind: "service_role" };

/** Antepone el cambio de rol de API y los claims JWT que Supabase usa para `auth.uid()`. */
export function asActor(actor: SqlActor, sql: string): string {
  if (actor.kind === "authenticated") {
    const claims = JSON.stringify({ sub: actor.userId, role: "authenticated" }).replace(/'/g, "''");
    return `set role authenticated; set "request.jwt.claims" = '${claims}';\n${sql}`;
  }
  return `set role ${actor.kind};\n${sql}`;
}

/** Ejecuta `sql` bajo un rol de API y devuelve el resultado (sin exigir éxito). */
export function psqlAs(actor: SqlActor, sql: string): Promise<SqlResult> {
  return psql(asActor(actor, sql));
}

// --- Usuarios locales A / B y cliente anon -------------------------------------------------

export type TestUser = { id: string; email: string; client: SupabaseClient };

export function anonClient(stack: LocalStack): SupabaseClient {
  return createClient(stack.apiUrl, stack.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function createTestUser(stack: LocalStack, label: string): Promise<TestUser> {
  const admin = createClient(stack.apiUrl, stack.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `${label}-${randomUUID()}@galcoa.test`;
  const password = `pw-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`No se pudo crear el usuario ${label}: ${created.error?.message}`);
  const client = anonClient(stack);
  const session = await client.auth.signInWithPassword({ email, password });
  if (session.error) throw new Error(`No se pudo iniciar sesión como ${label}: ${session.error.message}`);
  return { id: created.data.user.id, email, client };
}

// --- Semilla: un documento completo (núcleo → revisión → versión → sello) --------------------

export type SeededDocument = {
  ownerId: string;
  documentId: string;
  messageId: string;
  evidenceId: string;
  evidenceLocation: string;
  extractionId: string;
  draftId: string;
  reportId: string;
  revisionId: string;
  snapshotId: string;
  snapshotHash: string;
  authorParticipantId: string;
  buyerParticipantId: string;
  requestId: string;
  authorResponseId: string;
  buyerResponseId: string;
  operationId: string;
  versionId: string;
  attemptId: string;
  /** Reserva de objeto para subir el PDF (vigente, fencing 1). */
  reservationPath: string;
  /** Ruta de un artefacto ya publicado. */
  publishedPath: string;
  publicReference: string;
};

const sha256Hex = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

export function newId(): string {
  return randomUUID();
}

/**
 * Inserta (como superusuario, en una sola transacción) un documento con selección
 * autor + comprador, ambas respuestas, operación de finalización, y —si se pide—
 * versión publicada, constancias, artefactos e intento/registro HCS.
 */
export async function seedDocument(ownerId: string, options: { withVersion: boolean }): Promise<SeededDocument> {
  const id = {
    documentId: newId(), messageId: newId(), evidenceId: newId(), extractionId: newId(), draftId: newId(),
    reportId: newId(), revisionId: newId(), snapshotId: newId(), authorParticipantId: newId(),
    buyerParticipantId: newId(), requestId: newId(), authorResponseId: newId(), buyerResponseId: newId(),
    operationId: newId(), versionId: newId(), attemptId: newId(),
  };
  const content = JSON.stringify({ operation: { title: `Operación ficticia ${id.documentId}`, body: "Cuerpo", corrections: [] } });
  const bytes = Buffer.from(content, "utf8");
  const snapshotHash = sha256Hex(bytes);
  const pdf = Buffer.from(`%PDF-ficticio-${id.documentId}`);
  const manifest = Buffer.from(`{"manifiesto":"${id.documentId}"}`);
  const suffix = id.documentId.slice(0, 8);
  const evidenceLocation = `${id.documentId}/${newId()}`;
  const reservationPath = `${id.documentId}/pdf/${newId()}`;
  const publishedPath = `${id.documentId}/published/${newId()}`;
  const publicReference = `ref-${suffix}-${newId()}`;
  const payload = Buffer.from(`{"h":"${sha256Hex(pdf)}"}`);

  const base = `
begin;
insert into public.documents (id, owner_id, title) values ('${id.documentId}', '${ownerId}', 'Documento ${suffix}');
insert into public.messages (id, document_id, sequence, sender, content)
  values ('${id.messageId}', '${id.documentId}', 1, 'autor', 'Vendí 12 cajas');
insert into public.message_events (document_id, message_id, kind) values ('${id.documentId}', '${id.messageId}', 'turno');
insert into public.evidences (id, document_id, message_id, kind, mime_type, byte_length, sha256, private_location)
  values ('${id.evidenceId}', '${id.documentId}', '${id.messageId}', 'pdf', 'application/pdf', 10, '${sha256Hex("e")}', '${evidenceLocation}');
insert into public.evidence_extractions (id, document_id, evidence_id, method, result)
  values ('${id.extractionId}', '${id.documentId}', '${id.evidenceId}', 'prueba', '{}');
insert into public.drafts (id, document_id, content) values ('${id.draftId}', '${id.documentId}', '{"title":"t"}');
insert into public.verification_reports (id, document_id, input, output, model, prompt_version, rules_version)
  values ('${id.reportId}', '${id.documentId}', '{}', '{}', 'm', 'p1', 'r1');
insert into public.report_sources (document_id, report_id, message_id) values ('${id.documentId}', '${id.reportId}', '${id.messageId}');
insert into public.document_revisions (id, document_id, sequence, snapshot_id, snapshot_hash, selection, frozen_from_draft_revision)
  values ('${id.revisionId}', '${id.documentId}', 1, '${id.snapshotId}', '${snapshotHash}', array['autor','comprador'], 0);
insert into public.revision_snapshots (id, document_id, revision_id, schema_version, canonical_bytes, snapshot_hash, content)
  values ('${id.snapshotId}', '${id.documentId}', '${id.revisionId}', 1, '\\x${bytes.toString("hex")}', '${snapshotHash}', '${content}'::jsonb);
insert into public.revision_participants (id, document_id, revision_id, snapshot_id, snapshot_hash, role, user_id) values
  ('${id.authorParticipantId}', '${id.documentId}', '${id.revisionId}', '${id.snapshotId}', '${snapshotHash}', 'autor', '${ownerId}'),
  ('${id.buyerParticipantId}', '${id.documentId}', '${id.revisionId}', '${id.snapshotId}', '${snapshotHash}', 'comprador', null);
insert into public.snapshot_sources (document_id, snapshot_id, revision_id, snapshot_hash, alias, message_id)
  values ('${id.documentId}', '${id.snapshotId}', '${id.revisionId}', '${snapshotHash}', 'Fuente A', '${id.messageId}');
update public.documents set active_revision_id = '${id.revisionId}', revision_seq = 1, message_seq = 1 where id = '${id.documentId}';
insert into public.corroboration_requests (id, document_id, revision_id, snapshot_id, snapshot_hash, participant_id, role, token_hash, generation, expires_at)
  values ('${id.requestId}', '${id.documentId}', '${id.revisionId}', '${id.snapshotId}', '${snapshotHash}', '${id.buyerParticipantId}', 'comprador', '${sha256Hex(newId())}', 1, now() + interval '7 days');
insert into public.corroboration_responses (id, document_id, revision_id, snapshot_id, snapshot_hash, participant_id, role, request_id, decision, checkbox_checked, ratified_rejection, declared_name) values
  ('${id.authorResponseId}', '${id.documentId}', '${id.revisionId}', '${id.snapshotId}', '${snapshotHash}', '${id.authorParticipantId}', 'autor', null, 'confirmada', true, false, null),
  ('${id.buyerResponseId}', '${id.documentId}', '${id.revisionId}', '${id.snapshotId}', '${snapshotHash}', '${id.buyerParticipantId}', 'comprador', '${id.requestId}', 'confirmada', true, false, 'Comprador Ficticio');
insert into public.audit_events (document_id, actor_scope, action, resource_type, resource_id, outcome)
  values ('${id.documentId}', 'user:${ownerId}', 'confirm_author', 'revision', '${id.revisionId}', 'ok');
insert into public.idempotency_records (actor_scope, resource_id, action, key, fingerprint, result)
  values ('user:${ownerId}', '${id.revisionId}', 'confirm_author', 'clave-${suffix}-1', '${sha256Hex("cmd")}', '{"ok":true}');
insert into public.finalization_operations (id, document_id, revision_id, snapshot_id, snapshot_hash, reserved_version_id, version_number, renderer, public_reference, nonce, lease_expires_at)
  values ('${id.operationId}', '${id.documentId}', '${id.revisionId}', '${id.snapshotId}', '${snapshotHash}', '${id.versionId}', 1, 'r1', '${publicReference}', '\\x${randomUUID().replace(/-/g, "")}', now() + interval '60 seconds');
insert into public.artifact_staging (operation_id, kind, content, sha256, byte_length)
  values ('${id.operationId}', 'pdf', '\\x${pdf.toString("hex")}', '${sha256Hex(pdf)}', ${pdf.length});
insert into public.artifact_reservations (operation_id, document_id, kind, fencing, object_path, expires_at)
  values ('${id.operationId}', '${id.documentId}', 'pdf', 1, '${reservationPath}', now() + interval '1 hour');
commit;`;

  const version = options.withVersion
    ? `
begin;
update public.finalization_operations set phase = 'pdf_staged' where id = '${id.operationId}';
update public.finalization_operations set phase = 'manifest_ready' where id = '${id.operationId}';
update public.finalization_operations set phase = 'object_checked' where id = '${id.operationId}';
insert into public.document_versions (id, document_id, operation_id, revision_id, snapshot_id, snapshot_hash, version_number, previous_version_id, public_reference, schema_version, envelope, manifest_hash)
  values ('${id.versionId}', '${id.documentId}', '${id.operationId}', '${id.revisionId}', '${id.snapshotId}', '${snapshotHash}', 1, null, '${publicReference}', 1, '{"estado":"finalizada"}', '${sha256Hex(manifest)}');
update public.finalization_operations set phase = 'published' where id = '${id.operationId}';
insert into public.version_receipts (version_id, response_id, revision_id) values
  ('${id.versionId}', '${id.authorResponseId}', '${id.revisionId}'), ('${id.versionId}', '${id.buyerResponseId}', '${id.revisionId}');
insert into public.version_artifacts (version_id, kind, object_path, sha256, byte_length)
  values ('${id.versionId}', 'pdf', '${publishedPath}', '${sha256Hex(pdf)}', ${pdf.length});
update public.documents set last_version_id = '${id.versionId}', version_seq = 1, document_status = 'finalizado' where id = '${id.documentId}';
insert into public.hedera_attempts (id, version_id, payload, payload_hash) values ('${id.attemptId}', '${id.versionId}', '\\x${payload.toString("hex")}', '${sha256Hex(payload)}');
update public.hedera_attempts set outcome = 'registrado' where id = '${id.attemptId}';
insert into public.hedera_registrations (version_id, attempt_id, payload_hash, network, topic_id, transaction_id, sequence_number, consensus_timestamp)
  values ('${id.versionId}', '${id.attemptId}', '${sha256Hex(payload)}', 'testnet', '0.0.1', '0.0.1@1.1', 1, now());
commit;`
    : "";

  await psqlOk(base + version);
  return {
    ownerId, ...id, evidenceLocation, snapshotHash, reservationPath, publishedPath, publicReference,
  };
}
