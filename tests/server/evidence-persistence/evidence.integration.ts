import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { createExecutorRpcFactory } from "@/lib/documents/persistence/executor-rpc";
import { createEvidenceStore } from "@/lib/documents/evidence/persistence";
import { createEvidenceStorage } from "@/lib/documents/evidence/storage";
import { createEvidenceService } from "@/lib/documents/evidence/service";
import { createEvidenceHttpHandler } from "@/lib/documents/evidence/http";
import { parseAuditEvent } from "@/lib/documents/audit";
import type { ReserveEvidenceInput, StoredEvidence } from "@/lib/documents/evidence/ports";
import { createExtractionService, createExtractionReader } from "@/lib/ai/extraction/service";
import { createGeminiStructuredPort } from "@/lib/ai/gemini/structured";
import { GEMINI_API_KEY_ENV } from "@/lib/ai/gemini/config";
import { jsonModel } from "../ai/gemini/doubles";
import { anonClient, createTestUser, readLocalStack, supabaseCli, psqlOk, psql, type TestUser } from "../rls/harness";
import { pdfBytes } from "../evidence/memory";

let admin: Client;
let a: TestUser; let b: TestUser;
const factory = createExecutorRpcFactory();
let store: ReturnType<typeof createEvidenceStore>;
let storage: ReturnType<typeof createEvidenceStorage>;
let service: ReturnType<typeof createEvidenceService>;
const bytes = pdfBytes(1);
const hash = createHash("sha256").update(bytes).digest("hex");
const audit = () => ({ actorScope: a.id, correlationId: randomUUID() });
let privateUrl: string;
let localAdminUrl: string;

beforeAll(async () => {
  const stack = readLocalStack();
  const line = supabaseCli(["status", "-o", "env"]).split(/\r?\n/).find((v) => v.startsWith("DB_URL="));
  const raw = line?.slice(7).replace(/^"|"$/g, "");
  if (!raw || new URL(raw).hostname !== "127.0.0.1") throw new Error("Se requiere DB local");
  localAdminUrl = raw;
  admin = new Client({ connectionString: raw });
  try {
    await admin.connect();
    const password = randomBytes(32).toString("hex");
    await admin.query("select set_config('galcoa.test_password', $1, false)", [password]);
    await admin.query("do $$ begin execute format('alter role galcoa_exec_login password %L', current_setting('galcoa.test_password')); end $$");
    const url = new URL(raw); url.username = "galcoa_exec_login"; url.password = password; privateUrl = url.toString();
  } catch { throw new Error("Preparación local fallida (detalle privado omitido)"); }
  vi.stubEnv("GALCOA_EXECUTOR_DATABASE_URL", privateUrl);
  a = await createTestUser(stack, "evidence-a"); b = await createTestUser(stack, "evidence-b");
  expect((await a.client.auth.getUser()).data.user?.id).toBe(a.id);
  store = createEvidenceStore({ verifiedUserId: a.id, executor: factory.forUser(a.id)! });
  storage = createEvidenceStorage({ verifiedUserId: a.id, session: a.client, store,
    privilegedDeps: { readEnv: (name) => name === "NEXT_PUBLIC_SUPABASE_URL" ? stack.apiUrl : name === "SUPABASE_SECRET_KEY" ? stack.serviceKey : undefined } });
  service = createEvidenceService({ session: { currentUserId: async () => a.id }, store, storage });
});
afterAll(async () => {
  await factory.close();
  if (admin) { try { await admin.query("alter role galcoa_exec_login password null"); } finally { await admin.end(); } }
  vi.unstubAllEnvs();
});
async function doc() {
  const r = await a.client.rpc("create_document", { p_title: "Evidencia ficticia", p_key: randomUUID(), p_correlation_id: randomUUID() });
  expect(r.error).toBeNull(); return r.data.value.documentId as string;
}
afterEach(async () => {
  if (!a) return;
  for (const candidate of await store.listDiscards(a.id)) {
    const claimed = await store.claimDiscard(a.id, candidate.evidenceId, false);
    if (!claimed) continue;
    await storage.remove(claimed.privateLocation);
    await store.discardReservation({ownerId:a.id,evidenceId:claimed.evidenceId});
  }
});
function input(documentId: string, byteLength = bytes.length): ReserveEvidenceInput {
  return { ownerId: a.id, documentId, kind: "pdf", mimeType: "application/pdf", byteLength,
    sha256: hash, privateLocation: `${documentId}/${randomUUID()}`, declaredEventDate: { kind: "unknown" },
    limits: { maxFiles: 3, maxTotalBytes: 20971520 }, idempotency: { key: randomUUID(), fingerprint: "a".repeat(64) } };
}
async function reserve(documentId: string) {
  const result = await store.reserveEvidence(input(documentId));
  if (!("evidence" in result)) throw new Error("Reserva fallida"); return result.evidence;
}
async function upload(e: StoredEvidence, content = bytes) {
  return a.client.storage.from("evidences-private").upload(e.privateLocation, content, { contentType: e.mimeType, upsert: false });
}

it("versiones de migraciones coinciden con el repositorio y rol interno mínimo; autor/anon/service_role no falsifican aceptación", async () => {
  const versions = readdirSync(new URL("../../../supabase/migrations/", import.meta.url))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .map((name) => name.slice(0, name.indexOf("_")))
    .sort();
  expect(versions.length).toBeGreaterThan(0);
  expect(new Set(versions).size).toBe(versions.length);
  expect(await psqlOk("select version from supabase_migrations.schema_migrations order by version;")).toEqual(versions.map((version) => [version]));
  for (const role of ["anon", "authenticated", "service_role"]) {
    expect(await psqlOk(`select has_function_privilege('${role}','public.accept_evidence(uuid,uuid,text)','EXECUTE'),has_function_privilege('${role}','public.append_evidence_extraction(uuid,uuid,uuid,text,text,text,integer[],text,jsonb,text)','EXECUTE');`)).toEqual([["f", "f"]]);
  }
  expect(await psqlOk("select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname='galcoa_evidence_writer';")).toEqual([["f", "f", "f"]]);
  expect(await psqlOk("select has_table_privilege('galcoa_exec_login','public.evidences','INSERT,UPDATE,DELETE,SELECT');")).toEqual([["f"]]);
});
it("reabre filas, replay/conflicto, actor y documento ajenos no revelan datos", async () => {
  const documentId = await doc(); const command = input(documentId);
  const first = await store.reserveEvidence(command); expect(first.status).toBe("reserved");
  expect(await store.reserveEvidence({ ...command, privateLocation: `${documentId}/${randomUUID()}` })).toEqual({ ...first, status: "replayed" });
  expect((await store.reserveEvidence({ ...command, sha256: "b".repeat(64) })).status).toBe("idempotency_conflict");
  if (!("evidence" in first)) throw new Error("Reserva fallida");
  const other = createEvidenceStore({ verifiedUserId: b.id, executor: factory.forUser(b.id)! });
  expect(await other.getEvidence(b.id, documentId, first.evidence.evidenceId)).toBeNull();
  expect(await other.listEvidences(b.id, documentId)).toBeNull();
  expect(await other.listExtractions(b.id, documentId)).toBeNull();
  expect(await other.acceptEvidence({ ownerId: b.id, evidenceId: first.evidence.evidenceId, audit: { actorScope: b.id, correlationId: randomUUID() } })).toBeNull();
  expect(await store.getEvidence(a.id, await doc(), first.evidence.evidenceId)).toBeNull();
  await expect(store.getEvidence(b.id, documentId, first.evidence.evidenceId)).rejects.toThrow();
});
it("cuotas atómicas con cuatro conexiones LOGIN independientes y límite acumulado", async () => {
  const documentId = await doc();
  const connections = Array.from({ length: 4 }, () => new Client({ connectionString: privateUrl }));
  try {
    await Promise.all(connections.map((c) => c.connect()));
    const results = await Promise.all(connections.map(async (c) => {
      const i = input(documentId);
      return (await c.query("select public.reserve_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as r",
        [a.id,documentId,i.kind,i.mimeType,i.byteLength,i.sha256,i.privateLocation,i.declaredEventDate,i.idempotency.key,i.idempotency.fingerprint])).rows[0].r;
    }));
    expect(results.filter((r) => r.status === "reserved")).toHaveLength(3);
    expect(results.filter((r) => r.limit === "files")).toHaveLength(1);
  } finally { await Promise.all(connections.map((c) => c.end())); }
  const large = await doc();
  expect((await store.reserveEvidence(input(large,10485760))).status).toBe("reserved");
  expect((await store.reserveEvidence(input(large,10485760))).status).toBe("reserved");
  expect(await store.reserveEvidence(input(large,1))).toEqual({ status: "limit_exceeded", limit: "total_bytes" });
});
it("Storage real: sesión existente, ruta reservada, expiración antes de iniciar y A/B/anon", async () => {
  const documentId = await doc(); const e = await reserve(documentId);
  const permit = await storage.authorizeDirectUpload(e.privateLocation, { contentType:e.mimeType,maxBytes:e.byteLength,expiresAt:e.uploadExpiresAt });
  expect(permit.transport).toBe("authenticated"); expect(permit.expiresAt).toBe(e.uploadExpiresAt);
  expect(Date.parse(e.uploadExpiresAt)-Date.parse(e.uploadedAt)).toBeGreaterThanOrEqual(119000);
  for (const client of [b.client,anonClient(readLocalStack())]) {
    expect((await client.storage.from("evidences-private").upload(e.privateLocation,bytes,{contentType:e.mimeType})).error).not.toBeNull();
  }
  expect((await upload(e)).error).toBeNull();
  expect((await upload(e)).error).not.toBeNull();
  const expired = await reserve(documentId);
  await admin.query("update public.evidences set upload_expires_at=clock_timestamp()-interval '1 second' where id=$1",[expired.evidenceId]);
  const denied = await upload(expired);
  expect(denied.error).not.toBeNull();
  expect(denied.error?.message).toMatch(/row-level security/i);
  expect(await store.acceptEvidence({ownerId:a.id,evidenceId:expired.evidenceId,audit:audit()})).toBeNull();
  expect((await a.client.auth.getUser()).data.user?.id).toBe(a.id);
});
it("revalida bytes/hash, limpia rechazado y libera reserva; original aceptado queda inmutable", async () => {
  const documentId = await doc(); const bad = await reserve(documentId);
  const altered = pdfBytes(2); expect((await upload(bad,altered)).error).toBeNull();
  const rejected = await service.completeUpload({documentId,evidenceId:bad.evidenceId});
  expect(rejected).toMatchObject({ok:false,error:{code:"EVIDENCE_SIZE_MISMATCH"}});
  expect(await store.getEvidence(a.id,documentId,bad.evidenceId)).toBeNull();
  expect((await a.client.storage.from("evidences-private").download(bad.privateLocation)).error).not.toBeNull();
  const e = await reserve(documentId); expect((await upload(e)).error).toBeNull();
  expect(await service.completeUpload({documentId,evidenceId:e.evidenceId})).toMatchObject({ok:true,value:{uploadState:"accepted"}});
  expect(await service.completeUpload({documentId,evidenceId:e.evidenceId})).toMatchObject({ok:true,replayed:true});
  await store.discardReservation({ownerId:a.id,evidenceId:e.evidenceId});
  await expect(storage.remove(e.privateLocation)).rejects.toThrow("Original inmutable");
  expect(await storage.download(e.privateLocation)).toEqual(bytes);
  expect((await upload(e)).error).not.toBeNull();
  expect((await a.client.storage.from("evidences-private").update(e.privateLocation,pdfBytes(2),{contentType:e.mimeType})).error).not.toBeNull();
  const read = await service.readOriginal({documentId,evidenceId:e.evidenceId}); expect(read.ok).toBe(true);
  if(read.ok) expect((await fetch(read.value.url)).ok).toBe(true);
  expect(await psqlOk(`select count(*) from public.audit_events where resource_id='${e.evidenceId}' and action='evidence.accepted';`)).toEqual([["1"]]);
});
it("fallo de auditoría revierte aceptación/extracción, sin borrar el original subido", async () => {
  const documentId = await doc(); const e = await reserve(documentId); expect((await upload(e)).error).toBeNull();
  const result = await psql(`begin;
    create function pg_temp.evidence_fail() returns trigger language plpgsql as $$ begin raise exception 'forced-evidence-failure'; end $$;
    create trigger evidence_fail before insert on public.audit_events for each row execute function pg_temp.evidence_fail();
    set local role galcoa_executor;
    do $$ begin
      perform public.accept_evidence('${a.id}','${e.evidenceId}','rollback');
      raise exception 'unexpected';
    exception when raise_exception then if sqlerrm <> 'forced-evidence-failure' then raise; end if; end $$;
    reset role;
    select upload_state from public.evidences where id='${e.evidenceId}'; rollback;`, "supabase_admin");
  expect(result.ok).toBe(true); expect(result.rows).toEqual([["reserved"]]);
  expect(await storage.download(e.privateLocation)).toEqual(bytes);
  expect((await service.completeUpload({documentId,evidenceId:e.evidenceId})).ok).toBe(true);
});

it("extracción con puerto Gemini real/modelo doble, dos filas históricas, lector y rollback atómico", async () => {
  const documentId = await doc(); const e = await reserve(documentId);
  expect((await upload(e)).error).toBeNull();
  expect((await service.completeUpload({documentId,evidenceId:e.evidenceId})).ok).toBe(true);
  const mock = jsonModel({text:"Texto sintético de prueba",pages:[1],limitations:[]});
  const gemini = createGeminiStructuredPort({readEnv:(name)=>name===GEMINI_API_KEY_ENV?"test-only":undefined,createModel:()=>mock.model,log:()=>{}});
  const extractor = createExtractionService({session:{currentUserId:async()=>a.id},store,storage,gemini});
  const first = await extractor.extractEvidence({documentId,evidenceId:e.evidenceId});
  const second = await extractor.extractEvidence({documentId,evidenceId:e.evidenceId});
  expect(first).toMatchObject({ok:true,value:{text:"Texto sintético de prueba",method:"gemini",pages:[1]}});
  expect(second.ok && first.ok && second.value.extractionId !== first.value.extractionId).toBe(true);
  expect(await store.listExtractions(a.id,documentId)).toHaveLength(2);
  expect(await createExtractionReader(store).listExtractions(a.id,documentId)).toHaveLength(1);
  expect(await storage.download(e.privateLocation)).toEqual(bytes);
  const failed = await psql(`begin;
    create function pg_temp.extraction_fail() returns trigger language plpgsql as $$ begin raise exception 'forced-extraction-failure'; end $$;
    create trigger extraction_fail before insert on public.audit_events for each row execute function pg_temp.extraction_fail();
    set local role galcoa_executor;
    do $$ begin
      perform public.append_evidence_extraction('${a.id}','${documentId}','${e.evidenceId}','gemini','test-model','p1',array[1],'No persistir','[]','rollback');
      raise exception 'unexpected';
    exception when raise_exception then if sqlerrm <> 'forced-extraction-failure' then raise; end if; end $$;
    reset role;
    select count(*) from public.evidence_extractions where evidence_id='${e.evidenceId}'; rollback;`,"supabase_admin");
  expect(failed.ok).toBe(true); expect(failed.rows).toEqual([["2"]]);
  expect(await psqlOk(`select count(*) from public.audit_events where document_id='${documentId}' and action='extraction.recorded';`)).toEqual([["2"]]);
});

it("handlers con Auth real, Storage real y JSON acotado: reserva/carga/aceptación/lista/lectura/extracción", async () => {
  const documentId = await doc();
  const mock = jsonModel({text:"HTTP sintético",pages:[1],limitations:[]});
  const gemini = createGeminiStructuredPort({readEnv:(name)=>name===GEMINI_API_KEY_ENV?"test-only":undefined,createModel:()=>mock.model,log:()=>{}});
  const deps = {trustedOrigins:()=>["https://app.galcoa.test"],getContext:async()=>{
    const {data,error}=await a.client.auth.getUser();
    if(error || !data.user) throw new Error("Auth local requerido");
    return {session:{status:"authenticated" as const,user:{id:data.user.id,email:data.user.email??null}},forUser:(id:string)=>{
      if(id!==data.user.id) throw new Error("Actor no autorizado"); return {store,storage,gemini};
    }};
  }};
  const req=(body:unknown={},origin="https://app.galcoa.test")=>new Request("https://app.galcoa.test/api",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const reserveHandler=createEvidenceHttpHandler(deps,"reserve");
  expect((await reserveHandler(req({},"https://hostile.test"),documentId)).status).toBe(403);
  expect((await reserveHandler(req({ownerId:b.id}),documentId)).status).toBe(400);
  expect((await reserveHandler(req({payload:"x".repeat(17000)}),documentId)).status).toBe(413);
  const response=await reserveHandler(req({mimeType:"application/pdf",byteLength:bytes.length,sha256:hash,declaredEventDate:{kind:"unknown"},idempotencyKey:randomUUID()}),documentId);
  expect(response.status).toBe(200);
  const payload=await response.json();
  expect(payload.result.upload).toMatchObject({transport:"authenticated",bucket:"evidences-private"});
  expect(payload.result.evidence.privateLocation).toBeUndefined();
  expect(payload.result.upload.token).toBeUndefined();
  const evidenceId=payload.result.evidence.evidenceId;
  expect((await a.client.storage.from(payload.result.upload.bucket).upload(payload.result.upload.objectPath,bytes,{contentType:"application/pdf",upsert:false})).error).toBeNull();
  expect((await createEvidenceHttpHandler(deps,"complete")(req(),documentId,evidenceId)).status).toBe(200);
  const get=new Request("https://app.galcoa.test/api");
  const listed=await createEvidenceHttpHandler(deps,"list")(get,documentId);
  expect(listed.headers.get("Cache-Control")).toContain("no-store");
  expect((await listed.json()).result).toHaveLength(1);
  expect((await createEvidenceHttpHandler(deps,"read")(get,documentId,evidenceId)).status).toBe(200);
  expect((await createEvidenceHttpHandler(deps,"extract")(req(),documentId,evidenceId)).status).toBe(200);
  expect((await (await createEvidenceHttpHandler(deps,"extractions")(get,documentId)).json()).result).toHaveLength(1);
});

it("vencimiento no renueva replay ni libera cuota retenida; descarte libera una plaza", async () => {
  const documentId=await doc(); const command=input(documentId);
  const first=await store.reserveEvidence(command); if(!("evidence" in first)) throw new Error("Sin reserva");
  await reserve(documentId); await reserve(documentId);
  expect((await store.reserveEvidence(input(documentId))).status).toBe("limit_exceeded");
  await admin.query("update public.evidences set upload_expires_at=clock_timestamp()-interval '1 second' where id=$1",[first.evidence.evidenceId]);
  expect(await store.reserveEvidence(command)).toEqual({status:"not_available"});
  expect(await store.reserveEvidence(input(documentId))).toEqual({status:"discard_pending"});
  expect(await store.acceptEvidence({ownerId:a.id,evidenceId:first.evidence.evidenceId,audit:audit()})).toBeNull();
  expect(await store.claimDiscard(a.id, first.evidence.evidenceId, false)).not.toBeNull();
  await storage.remove(first.evidence.privateLocation);
  await store.discardReservation({ownerId:a.id,evidenceId:first.evidence.evidenceId});
  expect(await store.getEvidence(a.id,documentId,first.evidence.evidenceId)).toBeNull();
  expect((await store.reserveEvidence(input(documentId))).status).toBe("reserved");
  expect(await store.reserveEvidence(command)).toEqual({status:"not_available"});
});

it("bytes de reservas vencidas siguen contando aunque no se haya completado la subida", async () => {
  const documentId = await doc();
  const first = await store.reserveEvidence(input(documentId, 10485760));
  const second = await store.reserveEvidence(input(documentId, 10485760));
  expect(first.status).toBe("reserved");
  expect(second.status).toBe("reserved");
  await admin.query("update public.evidences set upload_expires_at=clock_timestamp()-interval '1 second' where document_id=$1", [documentId]);
  expect(await store.reserveEvidence(input(documentId, 1))).toEqual({status:"discard_pending"});
  expect((await admin.query("select sum(byte_length)::text as bytes from public.evidences where document_id=$1", [documentId])).rows[0].bytes).toBe("20971520");
});

it("complete tardío elimina bytes tras claim; una reserva nueva recupera abandonos propios", async () => {
  const documentId = await doc(); const e = await reserve(documentId);
  expect((await upload(e)).error).toBeNull();
  await admin.query("update public.evidences set upload_expires_at=clock_timestamp()-interval '1 second' where id=$1", [e.evidenceId]);
  expect(await service.completeUpload({documentId,evidenceId:e.evidenceId})).toMatchObject({ok:false,error:{code:"NOT_AVAILABLE"}});
  expect(await store.getEvidence(a.id,documentId,e.evidenceId)).toBeNull();
  expect((await a.client.storage.from("evidences-private").download(e.privateLocation)).error).not.toBeNull();
  const abandoned = await reserve(documentId); expect((await upload(abandoned)).error).toBeNull();
  await admin.query("update public.evidences set upload_expires_at=clock_timestamp()-interval '1 second' where id=$1", [abandoned.evidenceId]);
  expect((await service.requestUpload({documentId,mimeType:"application/pdf",byteLength:bytes.length,sha256:hash,declaredEventDate:{kind:"unknown"},idempotencyKey:randomUUID()})).ok).toBe(true);
  expect(await store.getEvidence(a.id,documentId,abandoned.evidenceId)).toBeNull();
});

it("claim terminal bloquea aceptación e INSERT Storage; si aceptación gana jamás concede claim", async () => {
  const documentId = await doc(); const e = await reserve(documentId);
  await expect(storage.remove(e.privateLocation)).rejects.toThrow("Descarte no reclamado");
  expect(await store.claimDiscard(b.id,e.evidenceId,true).catch(() => null)).toBeNull();
  const claimed = await store.claimDiscard(a.id,e.evidenceId,true);
  expect(claimed?.cleanupClaimedAt).toBeTruthy();
  expect(await store.claimDiscard(a.id,e.evidenceId,true)).toEqual(claimed);
  expect(await store.acceptEvidence({ownerId:a.id,evidenceId:e.evidenceId,audit:audit()})).toBeNull();
  expect((await upload(e)).error).not.toBeNull();
  await storage.remove(e.privateLocation); await store.discardReservation({ownerId:a.id,evidenceId:e.evidenceId});
  const accepted = await reserve(documentId); expect((await upload(accepted)).error).toBeNull();
  expect((await service.completeUpload({documentId,evidenceId:accepted.evidenceId})).ok).toBe(true);
  expect(await store.claimDiscard(a.id,accepted.evidenceId,true)).toBeNull();
  await expect(storage.remove(accepted.privateLocation)).rejects.toThrow("Original inmutable");
  expect(await storage.download(accepted.privateLocation)).toEqual(bytes);
});

it("aceptación y claim concurrentes producen un solo ganador sin destruir original aceptado", async () => {
  const documentId = await doc(); const e = await reserve(documentId); expect((await upload(e)).error).toBeNull();
  const [accepted, claimed] = await Promise.all([
    store.acceptEvidence({ownerId:a.id,evidenceId:e.evidenceId,audit:audit()}),
    store.claimDiscard(a.id,e.evidenceId,true),
  ]);
  expect(Number(accepted !== null) + Number(claimed !== null)).toBe(1);
  if (accepted) {
    await expect(storage.remove(e.privateLocation)).rejects.toThrow("Original inmutable");
    expect(await storage.download(e.privateLocation)).toEqual(bytes);
  } else {
    await storage.remove(e.privateLocation); await store.discardReservation({ownerId:a.id,evidenceId:e.evidenceId});
    expect(await store.getEvidence(a.id,documentId,e.evidenceId)).toBeNull();
  }
});

it("autorización RLS espera el lock y revalida vencimiento con reloj posterior a la espera", async () => {
  const documentId = await doc(); const e = await reserve(documentId);
  const waiting = new Client({connectionString:localAdminUrl});
  await waiting.connect();
  try {
    await waiting.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:a.id,role:"authenticated"})]);
    const pid = (await waiting.query("select pg_backend_pid() as pid")).rows[0].pid as number;
    await admin.query("begin");
    await admin.query("select id from public.documents where id=$1 for update", [documentId]);
    const authorization = waiting.query("select private.can_upload_evidence_object($1) as allowed", [e.privateLocation])
      .catch(() => ({rows:[{allowed:null}]}));
    // Espera acotada de readiness: verificar un bloqueo real, no confiar en un sleep fijo.
    await admin.query(`do $$ begin
      for attempt in 1..100 loop
        if cardinality(pg_blocking_pids(${pid}))>0 then return; end if;
        perform pg_sleep(0.01);
      end loop;
      raise exception 'No apareció el bloqueo esperado';
    end $$`);
    await admin.query("update public.evidences set upload_expires_at=clock_timestamp()-interval '1 second' where id=$1", [e.evidenceId]);
    await admin.query("commit");
    expect((await authorization).rows[0].allowed).toBe(false);
  } finally {
    await admin.query("rollback");
    await waiting.end();
  }
});

it("carga HTTP con cuerpo pendiente no publica el objeto después del claim", async () => {
  const documentId = await doc(); const e = await reserve(documentId);
  const stack = readLocalStack(); const session = (await a.client.auth.getSession()).data.session;
  if (!session) throw new Error("Se requiere sesión local");
  let finish = () => {};
  const body = new ReadableStream<Uint8Array>({start(controller) {
    controller.enqueue(bytes.slice(0, 8));
    finish = () => { controller.enqueue(bytes.slice(8)); controller.close(); };
  }});
  const options = {method:"POST",body,duplex:"half" as const,signal:AbortSignal.timeout(10_000),headers:{
    apikey:stack.anonKey,authorization:`Bearer ${session.access_token}`,"Content-Type":e.mimeType,
    "Content-Length":String(bytes.byteLength),"x-upsert":"false",
  }};
  const response = fetch(`${stack.apiUrl}/storage/v1/object/evidences-private/${e.privateLocation}`, options).catch(() => null);
  try {
    // Cuerpo abierto mientras el claim se confirma; no prueba por sí solo el instante del preflight.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await store.claimDiscard(a.id,e.evidenceId,true))?.cleanupClaimedAt).toBeTruthy();
  } finally { finish(); }
  const result = await response;
  expect(result).not.toBeNull();
  expect(result?.ok).toBe(false);
  expect((await a.client.storage.from("evidences-private").download(e.privateLocation)).error).not.toBeNull();
});

it("hash no coincidente con longitud válida rechaza y limpia; bucket impone 10 MiB/tipos", async () => {
  const documentId=await doc(); const command={...input(documentId),sha256:"0".repeat(64)};
  const first=await store.reserveEvidence(command); if(!("evidence" in first)) throw new Error("Sin reserva");
  expect((await upload(first.evidence)).error).toBeNull();
  expect(await service.completeUpload({documentId,evidenceId:first.evidence.evidenceId})).toMatchObject({ok:false,error:{code:"EVIDENCE_HASH_MISMATCH"}});
  expect(await store.getEvidence(a.id,documentId,first.evidence.evidenceId)).toBeNull();
  const e=await reserve(documentId);
  expect((await a.client.storage.from("evidences-private").upload(e.privateLocation,new Uint8Array(10485761),{contentType:"application/pdf"})).error).not.toBeNull();
  expect((await a.client.storage.from("evidences-private").upload(e.privateLocation,bytes,{contentType:"text/plain"})).error).not.toBeNull();
  expect((await upload(e)).error).toBeNull();
});

it("auditoría nueva estricta y RPC de catálogo valida propietario/recurso/tipo", async () => {
  const documentId=await doc(); const e=await reserve(documentId);
  expect((await upload(e)).error).toBeNull();
  expect((await service.completeUpload({documentId,evidenceId:e.evidenceId})).ok).toBe(true);
  const event={schemaVersion:1,type:"evidence.accepted",actorScope:a.id,documentId,resourceType:"evidence",resourceId:e.evidenceId,outcome:"ok",correlationId:randomUUID()};
  expect(parseAuditEvent(event)).toEqual(event);
  for(const extra of [{filename:"private.pdf"},{url:"https://private.invalid"},{text:"private"},{token:"private"}]) expect(()=>parseAuditEvent({...event,...extra})).toThrow();
  const executor=factory.forUser(a.id)!;
  const args={p_actor_id:a.id,p_document_id:documentId,p_type:"evidence.accepted",p_resource_id:e.evidenceId,p_outcome:"ok",p_correlation_id:randomUUID(),p_key:randomUUID()};
  expect((await executor.rpc("append_document_audit",args)).data).toBe("created");
  expect((await executor.rpc("append_document_audit",args)).data).toBe("replayed");
  expect((await executor.rpc("append_document_audit",{...args,p_resource_id:randomUUID(),p_key:randomUUID()})).error).not.toBeNull();
  expect((await executor.rpc("append_document_audit",{...args,p_type:"extraction.recorded",p_key:randomUUID()})).error).not.toBeNull();
});

it("extracción no disponible sin configuración: cero filas, original conservado; API anónima y otro dueño", async () => {
  const documentId=await doc(); const e=await reserve(documentId);
  expect((await upload(e)).error).toBeNull();
  expect((await service.completeUpload({documentId,evidenceId:e.evidenceId})).ok).toBe(true);
  const gemini=createGeminiStructuredPort({readEnv:()=>undefined,log:()=>{}});
  expect(await createExtractionService({session:{currentUserId:async()=>a.id},store,storage,gemini}).extractEvidence({documentId,evidenceId:e.evidenceId})).toMatchObject({ok:false,error:{code:"AI_CONFIG_MISSING"}});
  expect(await store.listExtractions(a.id,documentId)).toEqual([]);
  expect(await storage.download(e.privateLocation)).toEqual(bytes);
  const anon=createEvidenceHttpHandler({trustedOrigins:()=>[],getContext:async()=>({session:{status:"anonymous"},forUser:()=>{throw new Error("No debe componer");}})},"list");
  expect((await anon(new Request("https://app.galcoa.test"),documentId)).status).toBe(401);
  const other=createEvidenceStore({verifiedUserId:b.id,executor:factory.forUser(b.id)!});
  await expect(other.appendExtraction({ownerId:b.id,documentId,evidenceId:e.evidenceId,method:"gemini",model:"test",promptVersion:"test",pages:[1],text:"falso",limitations:[],audit:{actorScope:b.id,correlationId:randomUUID()}})).rejects.toThrow();
});
