import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createDocumentStore } from "@/lib/documents/persistence/store";

import { anonClient, asActor, createTestUser, expectRejected, psql, psqlAs, psqlOk, readLocalStack, SQLSTATE, type TestUser } from "../rls/harness";

let a: TestUser;
let b: TestUser;
const key = () => randomUUID();
const correlation = "f4-local-test";

async function create(title = "Documento ficticio") {
  const result = await a.client.rpc("create_document", { p_title: title, p_key: key(), p_correlation_id: correlation });
  expect(result.error).toBeNull();
  return result.data.value.documentId as string;
}

beforeAll(async () => {
  const stack = readLocalStack();
  a = await createTestUser(stack, "f4-a");
  b = await createTestUser(stack, "f4-b");
});

describe("F4 Postgres real, A/B/anon, sin proveedores", () => {
  it("persiste y reabre con otra instancia de adapter; B y anon no acceden", async () => {
    const doc = await create();
    const first = createDocumentStore({ verifiedUserId: a.id, session: a.client });
    const second = createDocumentStore({ verifiedUserId: a.id, session: a.client });
    const command = { ownerId: a.id, documentId: doc, sender: "autor" as const, content: "  Original ficticio  ",
      declaredEventDate: { kind: "declared" as const, originalText: "octubre de 2026", precision: "month" as const, timeZone: null, instant: null },
      idempotency: { key: key(), fingerprint: "a".repeat(64) }, audit: { actorScope: a.id, correlationId: correlation } };
    const result = await first.appendMessage(command);
    expect(result.status).toBe("created");
    expect(await second.listMessages(a.id, doc)).toEqual(["value" in result ? result.value : null]);
    const other = createDocumentStore({ verifiedUserId: b.id, session: b.client });
    expect(await other.getDocument(b.id, doc)).toBeNull();
    expect(await other.listMessages(b.id, doc)).toBeNull();
    expect((await other.listDocuments(b.id)).some((d) => d.documentId === doc)).toBe(false);
    const denied = await anonClient(readLocalStack()).rpc("get_document", { p_document_id: doc });
    expect(denied.error).not.toBeNull();
  });

  it("creaciones concurrentes en conexiones independientes: una identidad y un evento", async () => {
    const idem = key();
    const sql = `select public.create_document('Concurrente', '${idem}', '${correlation}')::text;`;
    const results = await Promise.all([psqlAs({ kind: "authenticated", userId: a.id }, sql), psqlAs({ kind: "authenticated", userId: a.id }, sql)]);
    expect(results.every((r) => r.ok)).toBe(true);
    const values = results.map((r) => JSON.parse(r.rows[0][0]));
    expect(values.map((v) => v.status).sort()).toEqual(["created", "replayed"]);
    const doc = values[0].value.documentId;
    expect(values[1].value.documentId).toBe(doc);
    expect(await psqlOk(`select count(*) from public.audit_events where document_id = '${doc}';`)).toEqual([["1"]]);
  });

  it("append concurrente: replay, secuencia única y conflicto semántico", async () => {
    const doc = await create();
    const idem = key();
    const sql = `select public.append_message('${doc}', 'Original', '{"kind":"unknown"}', '${idem}', '${correlation}')::text;`;
    const results = await Promise.all([psqlAs({ kind: "authenticated", userId: a.id }, sql), psqlAs({ kind: "authenticated", userId: a.id }, sql)]);
    expect(results.every((r) => r.ok)).toBe(true);
    const values = results.map((r) => JSON.parse(r.rows[0][0]));
    expect(values.map((v) => v.status).sort()).toEqual(["created", "replayed"]);
    expect(values[0].value.messageId).toBe(values[1].value.messageId);
    const conflict = await a.client.rpc("append_message", { p_document_id: doc, p_content: "Otro",
      p_declared_event_date: { kind: "unknown" }, p_key: idem, p_correlation_id: correlation });
    expect(conflict.data.status).toBe("idempotency_conflict");
    expect(await psqlOk(`select message_seq, (select count(*) from public.messages where document_id = '${doc}'),
      (select count(*) from public.audit_events where document_id = '${doc}' and action = 'message.recorded') from public.documents where id = '${doc}';`)).toEqual([["1", "1", "1"]]);
    const denied = await b.client.rpc("append_message", { p_document_id: doc, p_content: "Ajeno",
      p_declared_event_date: { kind: "unknown" }, p_key: key(), p_correlation_id: correlation });
    expect(denied.data.status).toBe("not_available");
  });

  it("sin DML ni RPC internas para autor/anon/service_role; ejecutor sin grants generales", async () => {
    const doc = await create();
    for (const role of ["anon", "authenticated", "service_role", "galcoa_executor"]) {
      expect(await psqlOk(`select has_table_privilege('${role}', 'public.messages', 'INSERT'),
        has_table_privilege('${role}', 'public.audit_events', 'UPDATE'), has_table_privilege('${role}', 'public.documents', 'INSERT');`)).toEqual([["f", "f", "f"]]);
    }
    for (const actor of [{ kind: "anon" }, { kind: "authenticated", userId: a.id }, { kind: "service_role" }] as const) {
      await expectRejected(asActor(actor, `select public.append_agent_message('${a.id}', '${doc}', 'No autorizado', '{"kind":"unknown"}', '${key()}', '${correlation}');`), SQLSTATE.permission);
    }
    const internal = await psql(`set role galcoa_executor; select public.append_agent_message('${a.id}', '${doc}', 'Respuesta ficticia', '{"kind":"unknown"}', '${key()}', '${correlation}')::text;`, "supabase_admin");
    expect(internal.ok).toBe(true);
    expect(JSON.parse(internal.rows[0][0]).value.sender).toBe("agente");
    const wrongOwner = await psql(`set role galcoa_executor; select public.append_agent_message('${b.id}', '${doc}', 'Ajeno', '{"kind":"unknown"}', '${key()}', '${correlation}')::text;`, "supabase_admin");
    expect(JSON.parse(wrongOwner.rows[0][0]).status).toBe("not_available");
  });

  it("mensajes y auditoría conservan guardas de inmutabilidad", async () => {
    const doc = await create();
    await expectRejected(`update public.audit_events set outcome = 'error' where document_id = '${doc}';`, SQLSTATE.restrict);
    await expectRejected(`delete from public.audit_events where document_id = '${doc}';`, SQLSTATE.restrict);
    await a.client.rpc("append_message", { p_document_id: doc, p_content: "Original", p_declared_event_date: { kind: "unknown" }, p_key: key(), p_correlation_id: correlation });
    await expectRejected(`update public.messages set content = 'Cambio' where document_id = '${doc}';`, SQLSTATE.restrict);
    await expectRejected(`delete from public.messages where document_id = '${doc}';`, SQLSTATE.restrict);
  });

  it("la RPC directa rechaza fecha inválida y una sesión sin identidad", async () => {
    const doc = await create();
    const invalid = await a.client.rpc("append_message", { p_document_id: doc, p_content: "Original",
      p_declared_event_date: { kind: "unknown", instant: "inventado" }, p_key: key(), p_correlation_id: correlation });
    expect(invalid.error).not.toBeNull();
    expect(await psqlOk(`select count(*) from public.messages where document_id = '${doc}';`)).toEqual([["0"]]);
    await expectRejected(`set role authenticated; select public.create_document('Sin sesión', '${key()}', '${correlation}');`, SQLSTATE.permission);
  });

  it("auditoría interna revalida recurso, propietario e idempotencia", async () => {
    const doc = await create();
    const idem = key();
    const call = `select public.append_document_audit('${a.id}', '${doc}', 'document.created', '${doc}', 'ok', '${correlation}', '${idem}');`;
    const result = await psql(`set role galcoa_executor; ${call} ${call}`, "supabase_admin");
    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([["created"], ["replayed"]]);
    await expectRejected(`set role galcoa_executor; select public.append_document_audit('${b.id}', '${doc}', 'document.created', '${doc}', 'ok', '${correlation}', '${key()}');`, SQLSTATE.permission, "supabase_admin");
    await expectRejected(`set role galcoa_executor; select public.append_document_audit('${a.id}', '${doc}', 'message.recorded', '${doc}', 'ok', '${correlation}', '${key()}');`, "22023", "supabase_admin");
  });

  it("un fallo de auditoría revierte documento e idempotencia juntos", async () => {
    const idem = key();
    const result = await psql(`begin;
      create function pg_temp.f4_fail_audit() returns trigger language plpgsql as $$ begin raise exception 'f4-forced-failure'; end $$;
      create trigger f4_fail_audit before insert on public.audit_events for each row execute function pg_temp.f4_fail_audit();
      set local role authenticated;
      set local "request.jwt.claims" = '{"sub":"${a.id}","role":"authenticated"}';
      do $$ begin
        perform public.create_document('No debe persistir ${idem}', '${idem}', '${correlation}');
        raise exception 'La escritura no falló';
      exception when raise_exception then
        if sqlerrm <> 'f4-forced-failure' then raise; end if;
      end $$;
      reset role;
      select (select count(*) from public.documents where title = 'No debe persistir ${idem}'),
        (select count(*) from public.idempotency_records where key = '${idem}');
      rollback;`);
    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([["0", "0"]]);
  });
});
