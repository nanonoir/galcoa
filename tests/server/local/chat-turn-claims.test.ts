import { createHash, randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { anonClient, createTestUser, expectRejected, psql, psqlAs, psqlOk, readLocalStack, SQLSTATE, type LocalStack, type TestUser } from "../rls/harness";

import { backendPid, distinctBackends, runSqlOnIndependentConnections } from "./concurrency";

/**
 * Turnos de chat durables, checkpoint 1 (migración 02500): claim, attach y close con
 * Postgres/Auth locales reales. Las RPC son del ejecutor (actor explícito); el "agente"
 * se simula con SQL interno porque la publicación atómica (02501) aún no existe: estas
 * pruebas NO acreditan completar un turno ni el chat funcional. Datos ficticios.
 */

let stack: LocalStack;
let ana: TestUser;
let luis: TestUser;
let docA: { documentId: string; messageId: string };
let docB: { documentId: string; messageId: string };

type Turn = { turnId: string; attempt: number; state: string; clientMessageId: string; leaseExpiresAt: string };
type Rpc = { status: string; retried: boolean; turn: Turn; value: { messageId: string } };

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const FP = sha("intencion-completa");
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

async function world(user: TestUser): Promise<{ documentId: string; messageId: string }> {
  const created = await user.client.rpc("create_document", { p_title: "Documento ficticio", p_key: `doc-${randomUUID()}`, p_correlation_id: "corr-doc" });
  const documentId = created.data.value.documentId as string;
  const message = await author(user, documentId, "Vendí 10 cajas");
  return { documentId, messageId: message };
}

async function author(user: TestUser, documentId: string, content: string): Promise<string> {
  const r = await user.client.rpc("append_message", { p_document_id: documentId, p_content: content, p_declared_event_date: { kind: "unknown" }, p_key: `msg-${randomUUID()}`, p_correlation_id: "corr-msg" });
  return r.data.value.messageId as string;
}

/** Ejecuta como `galcoa_executor` (rol sin login) mediante superusuario local y devuelve el JSON de la primera fila. */
async function asExecutor(call: string): Promise<Rpc> {
  const result = await psql(`set role galcoa_executor;\nselect ${call};`, "supabase_admin");
  if (!result.ok) throw new Error(`RPC rechazada: ${result.error}`);
  return JSON.parse(result.rows[0].join("|"));
}

const claim = (user: TestUser, documentId: string, clientId: string, fp = FP, lease = 90) =>
  asExecutor(`public.claim_chat_turn(${lit(user.id)}, ${lit(documentId)}, ${lit(clientId)}, ${lit(fp)}, ${lease}, 'corr-turn')`);
const attach = (user: TestUser, turnId: string, attempt: number, messageId: string) =>
  asExecutor(`public.attach_chat_turn_message(${lit(user.id)}, ${lit(turnId)}, ${attempt}, ${lit(messageId)})`);
const close = (user: TestUser, turnId: string, attempt: number, state: string, code = "proveedor_fallo") =>
  asExecutor(`public.close_chat_turn(${lit(user.id)}, ${lit(turnId)}, ${attempt}, ${lit(state)}, ${lit(code)}, 'corr-turn')`);
const expire = (turnId: string) => psqlOk(`update public.chat_turns set lease_expires_at = clock_timestamp() - interval '1 second' where id = ${lit(turnId)};`);
const row = async (turnId: string) => (await psqlOk(`select attempt, state, coalesce(user_message_id::text, ''), coalesce(agent_message_id::text, ''), coalesce(error_code, '') from public.chat_turns where id = ${lit(turnId)};`))[0];
const newClientId = () => `turn-${randomUUID()}`;

beforeAll(async () => {
  stack = readLocalStack();
  ana = await createTestUser(stack, "turn-a");
  luis = await createTestUser(stack, "turn-b");
  docA = await world(ana);
  docB = await world(luis);
});

describe("acceso: solo el ejecutor", () => {
  it("anon, authenticated y service_role no ejecutan las RPC ni tocan la tabla", async () => {
    const calls = [
      `select public.claim_chat_turn(${lit(ana.id)}, ${lit(docA.documentId)}, 'turn-12345678', ${lit(FP)}, 90, 'c')`,
      `select public.attach_chat_turn_message(${lit(ana.id)}, ${lit(randomUUID())}, 1, ${lit(docA.messageId)})`,
      `select public.close_chat_turn(${lit(ana.id)}, ${lit(randomUUID())}, 1, 'fallido', 'x', 'c')`,
      "select * from public.chat_turns",
      "insert into public.chat_turns(document_id, client_message_id, fingerprint) values (gen_random_uuid(), 'turn-12345678', repeat('a', 64))",
    ];
    for (const sql of calls) {
      for (const actor of [{ kind: "anon" }, { kind: "authenticated", userId: ana.id }, { kind: "service_role" }] as const) {
        const result = await psqlAs(actor, `${sql};`);
        expect(result.ok, `${actor.kind}: ${sql}`).toBe(false);
        expect(result.error).toContain(`ERROR:  ${SQLSTATE.permission}:`);
      }
    }
    for (const client of [ana.client, anonClient(stack)]) {
      const viaApi = await client.rpc("claim_chat_turn", { p_actor_id: ana.id, p_document_id: docA.documentId, p_client_message_id: "turn-12345678", p_fingerprint: FP, p_lease_seconds: 90, p_correlation_id: "c" });
      expect(viaApi.data).toBeNull();
      expect(viaApi.error).not.toBeNull();
    }
    await expectRejected("set role galcoa_executor; select * from public.chat_turns;", SQLSTATE.permission, "supabase_admin");
  });

  it("el propietario de las funciones no tiene login ni bypass y fija search_path vacío", async () => {
    expect(await psqlOk("select rolcanlogin, rolbypassrls, rolsuper from pg_roles where rolname = 'galcoa_turn_writer';")).toEqual([["f", "f", "f"]]);
    const fns = await psqlOk(`select p.proname, pg_get_userbyid(p.proowner), p.prosecdef, coalesce(array_to_string(p.proconfig, ','), ''),
        has_function_privilege('galcoa_executor', p.oid, 'EXECUTE'), has_function_privilege('authenticated', p.oid, 'EXECUTE')
      from pg_proc p where p.proname in ('claim_chat_turn', 'attach_chat_turn_message', 'close_chat_turn') order by 1;`);
    expect(fns).toEqual(["attach_chat_turn_message", "claim_chat_turn", "close_chat_turn"].map((n) => [n, "galcoa_turn_writer", "t", "search_path=\"\"", "t", "f"]));
  });
});

describe("claim", () => {
  it("crea el turno, lo repite como en curso y rechaza otra intención o actor ajeno", async () => {
    const id = newClientId();
    const first = await claim(ana, docA.documentId, id);
    expect(first).toMatchObject({ status: "claimed", retried: false, turn: { attempt: 1, state: "en_curso", clientMessageId: id, userMessageId: null, agentMessageId: null } });
    expect(Date.parse(first.turn.leaseExpiresAt)).toBeGreaterThan(Date.now() + 60_000);

    expect(await claim(ana, docA.documentId, id)).toMatchObject({ status: "in_progress", turn: { turnId: first.turn.turnId, attempt: 1 } });
    expect(await claim(ana, docA.documentId, id, sha("otra-intencion"))).toEqual({ status: "idempotency_conflict" });
    expect(await claim(luis, docA.documentId, id)).toEqual({ status: "not_available" });
    expect(await claim(ana, docB.documentId, id)).toEqual({ status: "not_available" });
  });

  it("la clave completa identifica el turno: 128 caracteres, sin truncar, y más de 128 se rechaza", async () => {
    const prefix = "p".repeat(100);
    const a = await claim(ana, docA.documentId, `${prefix}${"a".repeat(28)}`);
    const b = await claim(ana, docA.documentId, `${prefix}${"b".repeat(28)}`);
    expect([a.status, b.status]).toEqual(["claimed", "claimed"]);
    expect(a.turn.turnId).not.toBe(b.turn.turnId);
    expect(a.turn.clientMessageId).toHaveLength(128);
    await expectRejected(`set role galcoa_executor; select public.claim_chat_turn(${lit(ana.id)}, ${lit(docA.documentId)}, ${lit("c".repeat(129))}, ${lit(FP)}, 90, 'c');`, "22023", "supabase_admin");
    await expectRejected(`set role galcoa_executor; select public.claim_chat_turn(${lit(ana.id)}, ${lit(docA.documentId)}, 'corta', ${lit(FP)}, 90, 'c');`, "22023", "supabase_admin");
    await expectRejected(`set role galcoa_executor; select public.claim_chat_turn(${lit(ana.id)}, ${lit(docA.documentId)}, ${lit(newClientId())}, 'no-es-sha', 90, 'c');`, "22023", "supabase_admin");
  });

  it("dos conexiones independientes: una reclama y la otra ve el turno en curso", async () => {
    const id = newClientId();
    const results = await runSqlOnIndependentConnections(
      2,
      `begin;
set local role galcoa_executor;
select pg_backend_pid();
select public.claim_chat_turn(${lit(ana.id)}, ${lit(docA.documentId)}, ${lit(id)}, ${lit(FP)}, 90, 'corr-turn');
select pg_sleep(1);
commit;`,
    );
    expect(distinctBackends(results)).toBe(2);
    expect(results.every((r) => r.ok)).toBe(true);
    const statuses = results.map((r) => JSON.parse(r.rows[1].join("|")).status).sort();
    expect(statuses).toEqual(["claimed", "in_progress"]);
    expect(backendPid(results[0])).not.toBe(backendPid(results[1]));
    expect((await psqlOk(`select count(*) from public.chat_turns where document_id = ${lit(docA.documentId)} and client_message_id = ${lit(id)};`))[0][0]).toBe("1");
  });

  it("cancelado reintenta con intento mayor, conserva el mensaje del autor y audita sin contenido", async () => {
    const id = newClientId();
    const first = await claim(ana, docA.documentId, id);
    const msg = await author(ana, docA.documentId, "Confidencial: no debe ir a auditoría");
    expect((await attach(ana, first.turn.turnId, 1, msg)).status).toBe("attached");
    expect(await close(ana, first.turn.turnId, 1, "cancelado", "cancelado_usuario")).toMatchObject({ status: "closed", turn: { state: "cancelado", attempt: 1 } });

    const retry = await claim(ana, docA.documentId, id);
    expect(retry).toMatchObject({ status: "claimed", retried: true, turn: { turnId: first.turn.turnId, attempt: 2, state: "en_curso", userMessageId: msg } });
    expect(await row(first.turn.turnId)).toEqual(["2", "en_curso", msg, "", ""]);

    const events = await psqlOk(`select action, outcome, metadata::text from public.audit_events where resource_id = ${lit(first.turn.turnId)} order by id;`);
    expect(events.map((e) => [e[0], e[1]])).toEqual([["chat_turn.claimed", "ok"], ["chat_turn.closed", "ok"], ["chat_turn.claimed", "ok"]]);
    const metadata = events.map((e) => JSON.parse(e.slice(2).join("|")));
    expect(metadata).toEqual([
      { schemaVersion: 1, correlationId: "corr-turn", attempt: 1, retried: false },
      { schemaVersion: 1, correlationId: "corr-turn", attempt: 1, state: "cancelado", errorCode: "cancelado_usuario" },
      { schemaVersion: 1, correlationId: "corr-turn", attempt: 2, retried: true },
    ]);
    expect(JSON.stringify(events)).not.toContain("Confidencial");
  });

  it("un fallo al auditar revierte el claim completo (forzado con un trigger transitorio)", async () => {
    const id = newClientId();
    const result = await psql(
      `begin;
create function public.zz_audit_boom() returns trigger language plpgsql as $$ begin raise exception 'boom' using errcode = 'P0001'; end $$;
create trigger zz_audit_boom before insert on public.audit_events for each row when (new.action = 'chat_turn.claimed') execute function public.zz_audit_boom();
set local role galcoa_executor;
select public.claim_chat_turn(${lit(ana.id)}, ${lit(docA.documentId)}, ${lit(id)}, ${lit(FP)}, 90, 'corr-turn');
commit;`,
      "supabase_admin",
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("boom");
    expect((await psqlOk(`select count(*) from public.chat_turns where client_message_id = ${lit(id)};`))[0][0]).toBe("0");
    expect((await psqlOk("select count(*) from pg_proc where proname = 'zz_audit_boom';"))[0][0]).toBe("0");
  });
});

describe("fencing por intento y lease", () => {
  it("un lease vencido se recupera con otro intento y el worker viejo queda cercado", async () => {
    const id = newClientId();
    const first = await claim(ana, docA.documentId, id);
    const turnId = first.turn.turnId as string;
    const msg = await author(ana, docA.documentId, "Mensaje del turno");
    await expire(turnId);
    expect((await attach(ana, turnId, 1, msg)).status).toBe("stale");

    const takeover = await claim(ana, docA.documentId, id);
    expect(takeover).toMatchObject({ status: "claimed", retried: true, turn: { attempt: 2 } });

    expect(await attach(ana, turnId, 1, msg)).toEqual({ status: "stale" });
    expect(await close(ana, turnId, 1, "fallido")).toEqual({ status: "stale" });
    expect(await row(turnId)).toEqual(["2", "en_curso", "", "", ""]);

    expect((await attach(ana, turnId, 2, msg)).status).toBe("attached");
    expect(await close(ana, turnId, 2, "fallido")).toMatchObject({ status: "closed", turn: { state: "fallido" } });
    // Repetir el mismo cierre no agrega otro evento; otro estado del mismo intento es stale.
    expect((await close(ana, turnId, 2, "fallido")).status).toBe("closed");
    expect(await close(ana, turnId, 2, "cancelado")).toEqual({ status: "stale" });
    expect((await psqlOk(`select count(*) from public.audit_events where resource_id = ${lit(turnId)} and action = 'chat_turn.closed';`))[0][0]).toBe("1");
    expect(await row(turnId)).toEqual(["2", "fallido", msg, "", "proveedor_fallo"]);
  });

  it("el intento no retrocede ni salta por SQL directo", async () => {
    const first = await claim(ana, docA.documentId, newClientId());
    await expectRejected(`update public.chat_turns set attempt = 3 where id = ${lit(first.turn.turnId)};`, SQLSTATE.restrict);
    await expectRejected(`delete from public.chat_turns where id = ${lit(first.turn.turnId)};`, SQLSTATE.restrict);
  });
});

describe("attach del mensaje del autor", () => {
  it("solo acepta un mensaje de autor del mismo documento y no se revincula a otro", async () => {
    const first = await claim(ana, docA.documentId, newClientId());
    const turnId = first.turn.turnId as string;
    const other = await author(ana, docA.documentId, "Otro mensaje");
    const foreign = docB.messageId;
    const agent = (await asExecutor(`public.append_agent_message(${lit(ana.id)}, ${lit(docA.documentId)}, 'respuesta ficticia', '{"kind":"unknown"}'::jsonb, ${lit(`agt-${randomUUID()}`)}, 'c')`)).value.messageId as string;

    for (const bad of [foreign, agent, randomUUID()]) {
      await expectRejected(`set role galcoa_executor; select public.attach_chat_turn_message(${lit(ana.id)}, ${lit(turnId)}, 1, ${lit(bad)});`, "22023", "supabase_admin");
    }
    expect(await attach(luis, turnId, 1, docA.messageId)).toEqual({ status: "not_available" });
    expect(await row(turnId)).toEqual(["1", "en_curso", "", "", ""]);

    expect((await attach(ana, turnId, 1, docA.messageId)).status).toBe("attached");
    expect((await attach(ana, turnId, 1, docA.messageId)).status).toBe("attached");
    await expectRejected(`set role galcoa_executor; select public.attach_chat_turn_message(${lit(ana.id)}, ${lit(turnId)}, 1, ${lit(other)});`, "22023", "supabase_admin");

    // Un mensaje ya ligado a otro turno no se reutiliza.
    const second = await claim(ana, docA.documentId, newClientId());
    await expectRejected(`set role galcoa_executor; select public.attach_chat_turn_message(${lit(ana.id)}, ${lit(second.turn.turnId)}, 1, ${lit(docA.messageId)});`, "22023", "supabase_admin");
  });
});

describe("turno completado (simulado internamente)", () => {
  it("responde con el mensaje existente y close no lo modifica", async () => {
    const id = newClientId();
    const first = await claim(ana, docA.documentId, id);
    const turnId = first.turn.turnId as string;
    const msg = await author(ana, docA.documentId, "Pregunta ficticia");
    await attach(ana, turnId, 1, msg);
    const agent = (await asExecutor(`public.append_agent_message(${lit(ana.id)}, ${lit(docA.documentId)}, 'Respuesta ficticia', '{"kind":"unknown"}'::jsonb, ${lit(`agt-${randomUUID()}`)}, 'c')`)).value.messageId as string;
    // Simula la publicación de 02501 (aún inexistente): no es una prueba de completar el turno.
    await psqlOk(`update public.chat_turns set state = 'completado', agent_message_id = ${lit(agent)}, lease_expires_at = null where id = ${lit(turnId)};`);

    expect(await claim(ana, docA.documentId, id)).toMatchObject({ status: "completed", turn: { state: "completado", agentMessageId: agent }, agentMessage: { messageId: agent, sender: "agente", content: "Respuesta ficticia" } });
    expect(await claim(ana, docA.documentId, id, sha("otra"))).toEqual({ status: "idempotency_conflict" });
    expect(await close(ana, turnId, 1, "cancelado", "tardio")).toEqual({ status: "stale" });
    expect(await attach(ana, turnId, 1, msg)).toEqual({ status: "stale" });
    expect(await row(turnId)).toEqual(["1", "completado", msg, agent, ""]);
    await expectRejected(`update public.chat_turns set error_code = 'x' where id = ${lit(turnId)};`, SQLSTATE.restrict);
  });
});
