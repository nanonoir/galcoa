import { createHash, randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createSupabaseSealingStore } from "@/lib/documents/sealing/supabase";

import { psql, psqlOk, seedDocument } from "../rls/harness";

import { distinctBackends, runSqlOnIndependentConnections } from "./concurrency";

/**
 * MVP-091/092 · almacén del sello (migración 02507) contra Postgres local real: intento activo único bajo
 * concurrencia, fencing viejo rechazado, registro atómico, lectura sin `payload`/`signed_bytes` y acceso solo
 * del ejecutor. Las RPC corren como `galcoa_executor` (conexión propia por llamada). Sin Hedera ni Mirror.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const lit = (v: unknown): string =>
  v === null ? "null"
  : typeof v === "number" ? String(v)
  : Buffer.isBuffer(v) ? `decode('${v.toString("hex")}', 'hex')`
  : typeof v === "object" ? `${lit(JSON.stringify(v))}::jsonb`
  : `'${String(v).replace(/'/g, "''")}'`;
const TOPIC = "0.0.7001";
const PAYLOAD = Buffer.from('{"v":"galcoa.hcs.v1","r":"ficticio"}');
const PAYLOAD_HASH = createHash("sha256").update(PAYLOAD).digest("hex");
const SIGNED = Buffer.from("bytes-firmados-privados-ficticios");

async function asExecutor(call: string): Promise<R> {
  const result = await psql(`set role galcoa_executor;\nselect ${call};`, "supabase_admin");
  if (!result.ok) throw new Error(`RPC rechazada: ${result.error}`);
  return JSON.parse(result.rows[0].join("|"));
}
const rpc = (name: string, args: Record<string, unknown>) =>
  asExecutor(`public.${name}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(", ")})`);

/** Misma RPC que el adaptador de producción, por la conexión del ejecutor. */
const executor = {
  async rpc(name: string, args: Record<string, unknown> = {}) {
    try {
      return { data: await rpc(name, args), error: null };
    } catch {
      return { data: null, error: { code: "EXECUTOR_UNAVAILABLE" } };
    }
  },
};

let owner: string;
let stranger: string;

async function user(): Promise<string> {
  const id = randomUUID();
  const r = await psql(`insert into auth.users (id, email) values ('${id}', 'seal-${id}@galcoa.test');`, "supabase_admin");
  if (!r.ok) throw new Error(`usuario de prueba: ${r.error}`);
  return id;
}

beforeAll(async () => {
  owner = await user();
  stranger = await user();
});

/** Versión publicada sin intentos (la semilla común ya trae un registro; aquí se publica a mano). */
async function version(): Promise<string> {
  const seed = await seedDocument(owner, { withVersion: false });
  await psqlOk(`
begin;
update public.finalization_operations set phase = 'pdf_staged' where id = '${seed.operationId}';
update public.finalization_operations set phase = 'manifest_ready' where id = '${seed.operationId}';
update public.finalization_operations set phase = 'object_checked' where id = '${seed.operationId}';
insert into public.document_versions (id, document_id, operation_id, revision_id, snapshot_id, snapshot_hash, version_number, previous_version_id, public_reference, schema_version, envelope, manifest_hash)
  values ('${seed.versionId}', '${seed.documentId}', '${seed.operationId}', '${seed.revisionId}', '${seed.snapshotId}', '${seed.snapshotHash}', 1, null, '${seed.publicReference}', 1, '{"estado":"finalizada"}', '${sha(seed.versionId)}');
update public.finalization_operations set phase = 'published' where id = '${seed.operationId}';
commit;`);
  return seed.versionId;
}

const intentArgs = (versionId: string, tx: string, actor = owner) => ({
  p_actor_id: actor, p_version_id: versionId, p_payload: PAYLOAD, p_payload_hash: PAYLOAD_HASH, p_signed_bytes: SIGNED,
  p_transaction_id: tx, p_valid_start: "2026-10-17T10:00:00.000Z", p_valid_until: "2026-10-17T10:02:00.000Z", p_topic_id: TOPIC,
  p_network: "testnet", p_correlation_id: "corr-seal",
});
const intent = (versionId: string, tx: string, actor = owner) => rpc("record_seal_intent", intentArgs(versionId, tx, actor));
const outcome = (attemptId: string, fencing: number, result: string, extra: R = {}) =>
  rpc("record_seal_outcome", {
    p_actor_id: owner, p_attempt_id: attemptId, p_fencing: fencing, p_outcome: result,
    p_observation: { topicId: TOPIC, network: "testnet", ...extra }, p_correlation_id: "corr-out",
  });
const registration = (attemptId: string, fencing: number, tx: string, over: R = {}) =>
  rpc("record_seal_registration", {
    p_actor_id: owner, p_attempt_id: attemptId, p_fencing: fencing, p_payload_hash: PAYLOAD_HASH, p_network: "testnet",
    p_topic_id: TOPIC, p_transaction_id: tx, p_sequence_number: "42", p_consensus_timestamp: "1760695200.123456789",
    p_correlation_id: "corr-reg", ...over,
  });
const count = async (sql: string) => Number((await psqlOk(`select count(*) from ${sql};`))[0][0]);

describe("lectura (get_seal_version / get_seal_state)", () => {
  it("expone la referencia y el manifestHash al propietario; ajeno e inexistente dan lo mismo", async () => {
    const v = await version();
    const ok = await rpc("get_seal_version", { p_actor_id: owner, p_version_id: v });
    expect(ok).toMatchObject({ status: "ready", versionId: v, manifestHash: sha(v) });
    expect(await rpc("get_seal_version", { p_actor_id: stranger, p_version_id: v })).toEqual({ status: "not_available" });
    expect(await rpc("get_seal_version", { p_actor_id: owner, p_version_id: randomUUID() })).toEqual({ status: "not_available" });
    expect(await rpc("get_seal_state", { p_actor_id: owner, p_version_id: v })).toEqual({ status: "ok", registration: null, latestAttempt: null });
  });

  it("el estado nunca incluye payload ni signed_bytes", async () => {
    const v = await version();
    const made = await intent(v, "0.0.9@1.1");
    expect(made.status).toBe("recorded");
    const state = await rpc("get_seal_state", { p_actor_id: owner, p_version_id: v });
    expect(state.latestAttempt).toMatchObject({ id: made.attemptId, outcome: "pendiente", claimFencing: 1, payloadHash: PAYLOAD_HASH });
    const text = JSON.stringify(state);
    expect(text).not.toContain(SIGNED.toString("hex"));
    expect(Object.keys(state.latestAttempt).sort()).toEqual(["claimFencing", "id", "observation", "outcome", "payloadHash", "transactionId"]);
    expect(await count(`public.hedera_attempts where id = '${made.attemptId}' and signed_bytes = ${lit(SIGNED)}`)).toBe(1);
  });
});

describe("intención y claim", () => {
  it("cinco intenciones simultáneas (conexiones independientes) dejan un solo intento activo", async () => {
    const v = await version();
    const calls = Array.from({ length: 5 }, (_, i) => `select pg_backend_pid(), public.record_seal_intent(${Object.entries(intentArgs(v, `0.0.5@1.${i}`)).map(([k, x]) => `${k} => ${lit(x)}`).join(", ")})->>'status';`);
    const results = await Promise.all(calls.map((sql) => runSqlOnIndependentConnections(1, `set role galcoa_executor;\n${sql}`, "supabase_admin").then((r) => r[0])));
    expect(distinctBackends(results)).toBe(5);
    const statuses = results.map((r) => r.rows.at(-1)!.at(-1)).sort();
    expect(statuses).toEqual(["active_attempt", "active_attempt", "active_attempt", "active_attempt", "recorded"]);
    expect(await count(`public.hedera_attempts where version_id = '${v}' and outcome in ('pendiente','incierto')`)).toBe(1);
    expect(await count(`public.audit_events where action = 'seal.intent_recorded' and document_id = (select document_id from public.document_versions where id = '${v}')`)).toBe(1);
  });

  it("valida la forma y la red antes de escribir", async () => {
    const v = await version();
    for (const bad of [{ p_network: "mainnet" }, { p_topic_id: "x" }, { p_payload_hash: "0".repeat(64) }, { p_valid_until: "2026-10-17T09:00:00.000Z" }]) {
      await expect(rpc("record_seal_intent", { ...intentArgs(v, "0.0.8@1.1"), ...bad })).rejects.toThrow();
    }
    expect(await count(`public.hedera_attempts where version_id = '${v}'`)).toBe(0);
    expect(await intent(v, "0.0.8@1.2", stranger)).toEqual({ status: "not_available" });
  });
});

describe("fencing y resultados", () => {
  it("un fencing viejo no escribe y un intento terminal no se reabre", async () => {
    const v = await version();
    const a = await intent(v, "0.0.3@1.1");
    expect(await outcome(a.attemptId, 1, "incierto", { reason: "timeout" })).toEqual({ status: "recorded" });
    expect(await intent(v, "0.0.3@1.2")).toEqual({ status: "active_attempt" });
    expect(await outcome(a.attemptId, 1, "fallido", { hederaStatus: "INVALID_TOPIC_ID" })).toEqual({ status: "recorded" });
    expect(await outcome(a.attemptId, 1, "pendiente")).toEqual({ status: "terminal" });

    const b = await intent(v, "0.0.3@1.3");
    expect(b).toMatchObject({ status: "recorded", claimFencing: 2 });
    expect(await outcome(b.attemptId, 1, "fallido")).toEqual({ status: "stale_fencing" });
    expect(await registration(b.attemptId, 1, "0.0.3@1.3")).toEqual({ status: "stale_fencing" });
    const state = await rpc("get_seal_state", { p_actor_id: owner, p_version_id: v });
    expect(state.latestAttempt).toMatchObject({ id: b.attemptId, outcome: "pendiente", claimFencing: 2 });
    expect(state.registration).toBeNull();
    expect(await outcome(b.attemptId, 2, "pendiente", { sequenceNumber: "42", hederaStatus: "SUCCESS" })).toEqual({ status: "recorded" });
  });

  it("rechaza observaciones con llaves o formas fuera de la lista", async () => {
    const v = await version();
    const a = await intent(v, "0.0.4@1.1");
    await expect(outcome(a.attemptId, 1, "pendiente", { privateKey: "no" })).rejects.toThrow();
    await expect(outcome(a.attemptId, 1, "registrado")).rejects.toThrow();
    await expect(rpc("record_seal_outcome", { p_actor_id: owner, p_attempt_id: a.attemptId, p_fencing: 1, p_outcome: "pendiente", p_observation: { topicId: "0.0.1", network: "testnet" }, p_correlation_id: "c" })).rejects.toThrow();
  });
});

describe("registro atómico", () => {
  it("pasa el intento a registrado e inserta el registro; conserva los nanosegundos exactos", async () => {
    const v = await version();
    const a = await intent(v, "0.0.6@1.1");
    expect(await registration(a.attemptId, 1, "0.0.6@1.1")).toEqual({ status: "registered" });
    expect(await registration(a.attemptId, 1, "0.0.6@1.1")).toEqual({ status: "already_registered" });
    const state = await rpc("get_seal_state", { p_actor_id: owner, p_version_id: v });
    expect(state.registration).toEqual({
      attemptId: a.attemptId, payloadHash: PAYLOAD_HASH, network: "testnet", topicId: TOPIC, transactionId: "0.0.6@1.1",
      sequenceNumber: "42", consensusTimestamp: "1760695200.123456789",
    });
    expect(state.latestAttempt).toMatchObject({ outcome: "registrado" });
    expect(await count(`public.hedera_registrations where version_id = '${v}'`)).toBe(1);
    expect(await intent(v, "0.0.6@1.2")).toEqual({ status: "registered" });
    expect(await outcome(a.attemptId, 1, "fallido")).toEqual({ status: "terminal" });
    expect(await count(`public.audit_events where action = 'seal.registered' and resource_id = '${a.attemptId}'`)).toBe(1);
  });

  it("un registro que no coincide con el intento no escribe nada (ni cambia el intento)", async () => {
    const v = await version();
    const a = await intent(v, "0.0.2@1.1");
    expect(await registration(a.attemptId, 1, "0.0.2@9.9")).toEqual({ status: "mismatch" });
    expect(await registration(a.attemptId, 1, "0.0.2@1.1", { p_topic_id: "0.0.7002" })).toEqual({ status: "mismatch" });
    expect(await registration(a.attemptId, 1, "0.0.2@1.1", { p_payload_hash: "a".repeat(64) })).toEqual({ status: "mismatch" });
    expect(await count(`public.hedera_registrations where version_id = '${v}'`)).toBe(0);
    expect(await count(`public.hedera_attempts where id = '${a.attemptId}' and outcome = 'pendiente'`)).toBe(1);
    expect(await registration(a.attemptId, 1, "0.0.2@1.1", { p_actor_id: stranger })).toEqual({ status: "not_available" });
  });

  it("tres registros simultáneos: uno solo asienta el registro, los demás son idempotentes", async () => {
    const v = await version();
    const a = await intent(v, "0.0.1@1.1");
    const call = `set role galcoa_executor;\nselect public.record_seal_registration(${Object.entries({
      p_actor_id: owner, p_attempt_id: a.attemptId, p_fencing: 1, p_payload_hash: PAYLOAD_HASH, p_network: "testnet", p_topic_id: TOPIC,
      p_transaction_id: "0.0.1@1.1", p_sequence_number: "7", p_consensus_timestamp: "1760695201.5", p_correlation_id: "corr",
    }).map(([k, x]) => `${k} => ${lit(x)}`).join(", ")})->>'status';`;
    const results = await Promise.all([0, 1, 2].map(() => runSqlOnIndependentConnections(1, call, "supabase_admin").then((r) => r[0])));
    expect(results.map((r) => r.rows.at(-1)!.at(-1)).sort()).toEqual(["already_registered", "already_registered", "registered"]);
    expect(await count(`public.hedera_registrations where version_id = '${v}'`)).toBe(1);
    expect((await rpc("get_seal_state", { p_actor_id: owner, p_version_id: v })).registration.consensusTimestamp).toBe("1760695201.5");
  });
});

describe("permisos", () => {
  it("solo galcoa_executor ejecuta las RPC; el ejecutor no lee las tablas", async () => {
    const rows = await psqlOk(`select p.proname, has_function_privilege('galcoa_executor', p.oid, 'EXECUTE'),
      has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('service_role', p.oid, 'EXECUTE')
      from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like '%\\_seal\\_%' escape '\\') order by 1;`);
    expect(rows.map((r) => r[0])).toEqual(["get_seal_state", "get_seal_version", "record_seal_intent", "record_seal_outcome", "record_seal_registration"]);
    expect(rows.every((r) => r[1] === "t" && r[2] === "f")).toBe(true);
    const read = await psql("set role galcoa_executor; select count(*) from public.hedera_attempts;", "supabase_admin");
    expect(read.ok).toBe(false);
    const writer = await psql("set role galcoa_seal_writer; select signed_bytes from public.hedera_attempts;", "supabase_admin");
    expect(writer.ok).toBe(false);
  });
});

describe("adaptador SealingStore sobre las RPC reales", () => {
  it("recorre intención → resultado → registro con los tipos del puerto", async () => {
    const v = await version();
    let n = 0;
    const store = createSupabaseSealingStore({ verifiedUserId: owner, executor, newCorrelationId: () => `corr-adapter-${++n}` });
    expect(await store.loadVersion(randomUUID())).toBeNull();
    expect(await store.loadVersion(v)).toMatchObject({ versionId: v, manifestHash: sha(v) });
    expect(await store.loadSealState(v)).toEqual({ registration: null, latestAttempt: null });

    const base = { versionId: v, payload: PAYLOAD, payloadHash: PAYLOAD_HASH, signedBytes: SIGNED, validStart: "2026-10-17T10:00:00.000Z", validUntil: "2026-10-17T10:02:00.000Z", topicId: TOPIC, network: "testnet" as const };
    const first = await store.recordIntent({ ...base, transactionId: "0.0.11@1.1" });
    expect(first).toMatchObject({ ok: true, claimFencing: 1 });
    if (!first.ok) throw new Error();
    expect(await store.recordIntent({ ...base, transactionId: "0.0.11@1.2" })).toEqual({ ok: false, reason: "active_attempt" });
    await store.recordOutcome({ attemptId: first.attemptId, claimFencing: 1, outcome: "pendiente", observation: { topicId: TOPIC, network: "testnet", sequenceNumber: "42", hederaStatus: "SUCCESS" } });
    await expect(store.recordOutcome({ attemptId: first.attemptId, claimFencing: 9, outcome: "fallido", observation: { topicId: TOPIC, network: "testnet" } })).rejects.toThrow();
    const registrationInput = { attemptId: first.attemptId, payloadHash: PAYLOAD_HASH, network: "testnet" as const, topicId: TOPIC, transactionId: "0.0.11@1.1", sequenceNumber: "42", consensusTimestamp: "1760695200.000000001" };
    await expect(store.recordRegistration({ claimFencing: 2, registration: registrationInput })).rejects.toThrow();
    await store.recordRegistration({ claimFencing: 1, registration: registrationInput });
    const state = await store.loadSealState(v);
    expect(state.registration).toEqual(registrationInput);
    expect(state.latestAttempt).toMatchObject({ id: first.attemptId, outcome: "registrado", claimFencing: 1 });
  });
});
