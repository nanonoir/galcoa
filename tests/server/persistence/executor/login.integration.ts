import { randomBytes, randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

import { createExecutorRpc } from "@/lib/documents/persistence/executor-rpc";
import { createDocumentStore } from "@/lib/documents/persistence/store";

import { createTestUser, psqlOk, readLocalStack, supabaseCli, type TestUser } from "../../rls/harness";

let login: Client;
let admin: Client;
let user: TestUser;
let executor: ReturnType<typeof createExecutorRpc>;
let privateUrl: string;

beforeAll(async () => {
  // CLI output and passwords remain in process memory; never include raw pg errors.
  const output = supabaseCli(["status", "-o", "env"]);
  const raw = output.split(/\r?\n/).find((line) => line.startsWith("DB_URL="))?.slice(7).replace(/^"|"$/g, "");
  if (!raw || new URL(raw).hostname !== "127.0.0.1") throw new Error("Se requiere DB local");
  admin = new Client({ connectionString: raw });
  const password = randomBytes(32).toString("hex");
  try {
    await admin.connect();
    await admin.query("select set_config('galcoa.test_password', $1, false)", [password]);
    await admin.query("do $$ begin execute format('alter role galcoa_exec_login password %L', current_setting('galcoa.test_password')); end $$");
    const url = new URL(raw);
    url.username = "galcoa_exec_login";
    url.password = password;
    privateUrl = url.toString();
    login = new Client({ connectionString: privateUrl });
    await login.connect();
  } catch { throw new Error("No se pudo preparar LOGIN local (detalle privado omitido)"); }
  user = await createTestUser(readLocalStack(), "executor-login");
  vi.stubEnv("GALCOA_EXECUTOR_DATABASE_URL", privateUrl);
  executor = createExecutorRpc(user.id);
});

afterAll(async () => {
  await executor?.close();
  await login?.end();
  if (admin) {
    try { await admin.query("alter role galcoa_exec_login password null"); } finally { await admin.end(); }
  }
  vi.unstubAllEnvs();
});

it("LOGIN real sin SET ROLE, mínimos de catálogo y sin membresías API", async () => {
  expect((await login.query("select current_user, session_user")).rows).toEqual([{ current_user: "galcoa_exec_login", session_user: "galcoa_exec_login" }]);
  expect(await psqlOk("select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolconnlimit from pg_roles where rolname='galcoa_exec_login';")).toEqual([["t", "f", "f", "f", "f", "f", "5"]]);
  expect(await psqlOk("select r.rolname, m.inherit_option, m.set_option from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where u.rolname='galcoa_exec_login';")).toEqual([["galcoa_executor", "t", "f"]]);
  expect(await psqlOk("select rolcanlogin from pg_roles where rolname='galcoa_executor';")).toEqual([["f"]]);
  expect(await psqlOk("select pg_has_role('authenticator','galcoa_exec_login','MEMBER'), pg_has_role('authenticated','galcoa_executor','MEMBER'), has_schema_privilege('galcoa_exec_login','public','CREATE');")).toEqual([["f", "f", "f"]]);
  expect(await psqlOk("select count(*) from pg_roles api cross join pg_roles target where api.rolname in ('anon','authenticated','authenticator','service_role') and target.rolname in ('galcoa_exec_login','galcoa_executor') and pg_has_role(api.oid,target.oid,'MEMBER');")).toEqual([["0"]]);
  expect(await psqlOk("select count(*) from pg_class where relowner = 'galcoa_exec_login'::regrole;")).toEqual([["0"]]);
  expect(await psqlOk("select count(*) from pg_proc where proowner = 'galcoa_exec_login'::regrole;")).toEqual([["0"]]);
  expect(await psqlOk("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and (has_table_privilege('galcoa_exec_login', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('galcoa_exec_login', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'));")).toEqual([["0"]]);
});

it("no SELECT/DML general, SET ROLE ni helpers privados", async () => {
  for (const sql of ["select * from public.documents", "insert into public.documents(title) values ('no')", "set role galcoa_executor", "select private.f4_actor()", "select public.list_documents()"] ) {
    const code = await login.query(sql).then(() => "unexpected", (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error ? error.code : "unknown");
    expect(code).toBe("42501");
  }
});

it("rechaza contraseña errónea sin divulgar detalle", async () => {
  const url = new URL(privateUrl);
  url.password = randomBytes(32).toString("hex");
  const wrong = new Client({ connectionString: url.toString() });
  try {
    const code = await wrong.connect().then(() => "unexpected", (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error ? error.code : "unknown");
    expect(code).toBe("28P01");
  } finally { await wrong.end(); }
});

it("adapter real rechaza RPC no enumerada y actor ajeno; API no puede falsificar agente", async () => {
  const args = { p_actor_id: user.id, p_document_id: randomUUID(), p_content: "No autorizado",
    p_declared_event_date: { kind: "unknown" }, p_key: randomUUID(), p_correlation_id: "executor-test" };
  expect(await executor!.rpc("list_documents")).toEqual({ data: null, error: { code: "EXECUTOR_UNAVAILABLE" } });
  expect(await executor!.rpc("append_agent_message", { ...args, p_actor_id: randomUUID() }))
    .toEqual({ data: null, error: { code: "EXECUTOR_UNAVAILABLE" } });
  const denied = await user.client.rpc("append_agent_message", args);
  expect(denied.error?.code).toBe("42501");
});

it("store real: agente y auditoría idempotentes y evento atómico", async () => {
  const verified = await user.client.auth.getUser();
  expect(verified.data.user?.id).toBe(user.id);
  const store = createDocumentStore({ verifiedUserId: user.id, session: user.client, executor });
  const created = await store.createDocument({ ownerId: user.id, title: "Prueba executor", idempotency: { key: randomUUID(), fingerprint: "a".repeat(64) }, audit: { actorScope: user.id, correlationId: "executor-test" } });
  if (!("value" in created)) throw new Error("Documento no creado");
  const doc = created.value.documentId;
  const command = { ownerId: user.id, documentId: doc, sender: "agente" as const, content: "Respuesta ficticia",
    declaredEventDate: { kind: "unknown" as const }, idempotency: { key: randomUUID(), fingerprint: "a".repeat(64) }, audit: { actorScope: user.id, correlationId: "executor-test" } };
  expect((await store.appendMessage(command)).status).toBe("created");
  expect((await store.appendMessage(command)).status).toBe("replayed");
  expect(await psqlOk(`select count(*) from public.audit_events where document_id='${doc}' and action='message.recorded';`)).toEqual([["1"]]);
  const audit = { schemaVersion: 1 as const, type: "document.created" as const, resourceType: "document" as const, actorScope: user.id, documentId: doc, resourceId: doc, outcome: "ok" as const, correlationId: "executor-test" };
  const idem = { key: randomUUID(), fingerprint: "a".repeat(64) };
  expect(await store.appendAuditEvent(audit, idem)).toBe("created");
  expect(await store.appendAuditEvent(audit, idem)).toBe("replayed");
});

it("fallo de auditoría revierte mensaje, secuencia e idempotencia del LOGIN real", async () => {
  const result = await user.client.rpc("create_document", { p_title: "Rollback executor", p_key: randomUUID(), p_correlation_id: "executor-test" });
  expect(result.error).toBeNull();
  const doc = result.data.value.documentId as string;
  const key = randomUUID();
  await admin.query(`create function private.executor_test_fail() returns trigger language plpgsql as $$ begin
    if new.document_id = '${doc}'::uuid then raise exception 'forced-test'; end if; return new; end $$`);
  await admin.query("create trigger executor_test_fail before insert on public.audit_events for each row execute function private.executor_test_fail()");
  try {
    const failed = await executor!.rpc("append_agent_message", { p_actor_id: user.id, p_document_id: doc,
      p_content: "No persistir", p_declared_event_date: { kind: "unknown" }, p_key: key, p_correlation_id: "executor-test" });
    expect(failed.error).toBeTruthy();
    expect(await psqlOk(`select message_seq, (select count(*) from public.messages where document_id='${doc}'),
      (select count(*) from public.idempotency_records where key='${key}') from public.documents where id='${doc}';`)).toEqual([["0", "0", "0"]]);
  } finally {
    await admin.query("drop trigger executor_test_fail on public.audit_events");
    await admin.query("drop function private.executor_test_fail()");
  }
});
