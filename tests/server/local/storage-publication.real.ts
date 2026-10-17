import { createHash, randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createArtifactStorage } from "@/lib/documents/finalization/artifact-storage";
import { createManifestService, createSupabaseManifestStore } from "@/lib/documents/finalization/manifest";
import { createSupabaseVersionPublishStore, createVersionPublishService, type ArtifactStorage } from "@/lib/documents/finalization/publish";
import { createPdfStagingService, createSupabasePdfStagingStore } from "@/lib/documents/finalization/staging";
import type { DocumentRpc } from "@/lib/documents/persistence/store";
import { createRevisionService } from "@/lib/documents/revisions/service";
import { createSupabaseRevisionAdapters } from "@/lib/documents/revisions/supabase";

import { anonClient, createTestUser, psql, psqlOk, readLocalStack, type TestUser } from "../rls/harness";

// Ejecutar con run-storage.mjs: Auth, Postgres y Storage reales, sin .env/IA/HCS.
// Solo se siembra el borrador (entrada del agente fuera de alcance). Freeze, confirmación,
// claim, render, manifiesto, reservas y publicación atraviesan las mutaciones reales.
const lit = (v: unknown): string => v === null ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const key = () => randomUUID();
let owner: TestUser;
let other: TestUser;
let anonymous: ReturnType<typeof anonClient>;
let storage: ArtifactStorage;

beforeAll(async () => {
  if (!process.env.GALCOA_LOCAL_TEST_CONTAINER?.startsWith("supabase_db_galcoa-storage-")) throw new Error("Requiere el launcher aislado run-storage.mjs");
  const stack = readLocalStack();
  if (new URL(stack.apiUrl).hostname !== "127.0.0.1") throw new Error("Solo loopback local");
  owner = await createTestUser(stack, "storage-owner");
  other = await createTestUser(stack, "storage-other");
  anonymous = anonClient(stack);
  storage = createArtifactStorage({ verifiedUserId: owner.id, privilegedDeps: {
    readEnv: (name) => name === "NEXT_PUBLIC_SUPABASE_URL" ? stack.apiUrl : name === "SUPABASE_SECRET_KEY" ? stack.serviceKey : undefined,
  } });
});

/** Transporte del ejecutor real por conexiones SQL independientes; nunca service_role para RPC. */
function executorRpc(rollbackPublication = false): DocumentRpc {
  return { async rpc(name, args = {}) {
    const params = Object.entries(args).map(([k, v]) => `${k} => ${Buffer.isBuffer(v) ? `decode('${v.toString("hex")}', 'hex')` : lit(v)}`);
    const rollback = rollbackPublication && name === "publish_version";
    if (rollback) rollbackPublication = false;
    const query = `set role galcoa_executor; select public.${name}(${params.join(",")});`;
    // La publicación se ejecuta y luego falla su transacción: ningún fixture finge su resultado.
    const result = await psql(rollback ? `begin; ${query} select 1/0; commit;` : query, "supabase_admin");
    if (!result.ok) return { data: null, error: { code: "LOCAL_TRANSACTION_FAILED" } };
    return { data: JSON.parse(result.rows[0].join("|")), error: null };
  } };
}

async function prepared() {
  const created = await owner.client.rpc("create_document", { p_title: "Operación ficticia Storage", p_key: key(), p_correlation_id: key() });
  expect(created.error).toBeNull();
  const documentId = created.data.value.documentId as string;
  const message = await owner.client.rpc("append_message", { p_document_id: documentId, p_content: "Entrega ficticia de 12 cajas", p_declared_event_date: { kind: "unknown" }, p_key: key(), p_correlation_id: key() });
  expect(message.error).toBeNull();
  await psqlOk(`insert into public.drafts(document_id,draft_revision,content) values (${lit(documentId)},1,'{"title":"Acuerdo ficticio","body":"Entrega de doce cajas ficticias.","corrections":[]}'::jsonb);`);
  const adapters = createSupabaseRevisionAdapters({ verifiedUserId: owner.id, session: owner.client });
  const revisions = createRevisionService({ session: { currentUserId: async () => owner.id }, source: adapters.reader, revisions: adapters.store });
  const frozen = await revisions.freeze({ documentId, expectedDraftRevision: 1, selection: ["autor"], idempotencyKey: key() });
  if (!frozen.ok) throw new Error(`freeze: ${frozen.error.code}`);
  const { revisionId, snapshotId, snapshotHash } = frozen.value.revision;
  const confirmed = await revisions.confirmAsAuthor({ schemaVersion: 1, actor: "autor", documentId, revisionId, snapshotId, snapshotHash, idempotencyKey: key(), decision: "confirmar", checkboxChecked: true });
  if (!confirmed.ok) throw new Error(`confirm: ${confirmed.error.code}`);
  const operation = await claim(documentId, revisionId);
  const context = { verifiedUserId: owner.id, executor: executorRpc() };
  const pdf = await createPdfStagingService({ store: createSupabasePdfStagingStore(context) }).stagePdf(operation);
  if (!pdf.ok) throw new Error(`render: ${pdf.error.code}`);
  const manifest = await createManifestService({ store: createSupabaseManifestStore(context) }).prepareManifest(operation);
  if (!manifest.ok) throw new Error(`manifest: ${manifest.error.code}`);
  return { ...operation, documentId, revisionId };
}

async function claim(documentId: string, revisionId: string) {
  const result = await owner.client.rpc("claim_finalization", { p_document_id: documentId, p_revision_id: revisionId, p_renderer: "react-pdf-v1", p_lease_seconds: 300, p_correlation_id: key() });
  expect(result.error).toBeNull();
  return result.data.operation as { operationId: string; fencing: number };
}
const store = (rpc = executorRpc()) => createSupabaseVersionPublishStore({ verifiedUserId: owner.id, executor: rpc });
const countVersions = async (documentId: string) => Number((await psqlOk(`select count(*) from public.document_versions where document_id=${lit(documentId)};`))[0][0]);
const objectIdentity = (operationId: string) => psqlOk(`select o.id::text,o.name,o.created_at::text,o.updated_at::text from storage.objects o join public.artifact_reservations r on r.object_path=o.name where r.operation_id=${lit(operationId)} and o.bucket_id='versions-private' order by o.name;`);
async function reservations(operationId: string) {
  return psqlOk(`select object_path, kind, fencing::text from public.artifact_reservations where operation_id=${lit(operationId)} order by object_path;`);
}
async function inaccessible(path: string) {
  for (const client of [other.client, anonymous]) {
    const result = await client.storage.from("versions-private").download(path);
    expect(result.data === null && result.error !== null).toBe(true);
  }
}
async function verifyArtifacts(operationId: string, published: boolean) {
  const rows = await psqlOk(`select r.object_path, s.sha256, s.byte_length::text from public.artifact_reservations r join public.artifact_staging s on s.operation_id=r.operation_id and s.kind=r.kind where r.operation_id=${lit(operationId)} and r.state in ('active','adopted') order by r.kind;`);
  expect(rows).toHaveLength(2);
  for (const [path, hash, length] of rows) {
    const bytes = await storage.download(path);
    expect(bytes !== null).toBe(true);
    expect(digest(bytes!)).toBe(hash);
    expect(bytes!.byteLength).toBe(Number(length));
    await inaccessible(path);
    const ownerRead = await owner.client.storage.from("versions-private").download(path);
    expect(ownerRead.error === null).toBe(published);
    if (published) {
      const downloaded = new Uint8Array(await ownerRead.data!.arrayBuffer());
      expect([digest(downloaded), downloaded.byteLength]).toEqual([hash, Number(length)]);
    }
  }
}

describe("MVP-083 · publicación con Auth/Storage/DB locales reales", () => {
  it("publica PDF real y manifiesto; A lee después, B/anon nunca; RLS impide INSERT/overwrite/upsert", async () => {
    const op = await prepared();
    const publisher = store();
    const reserved = await publisher.reserve({ ...op, correlationId: key() });
    if (reserved.status !== "reserved") throw new Error("No reservó");
    for (const artifact of reserved.artifacts) {
      const staged = await publisher.staged({ ...op, kind: artifact.kind });
      if (staged.status !== "ready") throw new Error("Sin staging");
      await storage.upload(artifact.objectPath, Buffer.from(staged.contentHex, "hex"), artifact.kind === "pdf" ? "application/pdf" : "application/json");
    }
    await verifyArtifacts(op.operationId, false);
    for (const client of [owner.client, other.client, anonymous]) {
      for (const upsert of [false, true]) {
        for (const path of [reserved.artifacts[0].objectPath, `${owner.id}/${op.documentId}/${key()}.pdf`]) {
          const result = await client.storage.from("versions-private").upload(path, Buffer.from("arbitrary"), { upsert, contentType: "application/pdf" });
          expect(result.error !== null).toBe(true);
          if (path !== reserved.artifacts[0].objectPath) expect(result.error?.message).toMatch(/row-level security/i);
        }
      }
    }
    const result = await createVersionPublishService({ store: publisher, storage }).publishVersion(op);
    expect(result).toMatchObject({ ok: true, value: { reused: false, versionNumber: 1 } });
    expect(await countVersions(op.documentId)).toBe(1);
    await verifyArtifacts(op.operationId, true);
    const again = await createVersionPublishService({ store: publisher, storage }).publishVersion(op);
    expect(again).toMatchObject({ ok: true, value: { reused: true } });
    const state = await psqlOk(`select phase,status from public.finalization_operations where id=${lit(op.operationId)};`);
    expect(state).toEqual([["published", "active"]]);
    expect((await psqlOk(`select document_status from public.documents where id=${lit(op.documentId)};`))[0][0]).toBe("finalizado");
    expect((await psqlOk(`select count(*) from public.hedera_attempts a join public.document_versions v on v.id=a.version_id where v.document_id=${lit(op.documentId)};`))[0][0]).toBe("0");
    const identity = await objectIdentity(op.operationId);
    for (const client of [owner.client, other.client, anonymous]) {
      const overwrite = await client.storage.from("versions-private").upload(reserved.artifacts[0].objectPath, Buffer.from("changed"), { upsert: true, contentType: "application/pdf" });
      expect(overwrite.error !== null).toBe(true);
    }
    expect(await objectIdentity(op.operationId)).toEqual(identity);
    await verifyArtifacts(op.operationId, true);
  });

  it("acepta respuesta Storage perdida solo releyendo bytes persistidos reales", async () => {
    const op = await prepared();
    let uncertain = 0;
    const uncertainStorage: ArtifactStorage = {
      download: storage.download,
      async upload(path, bytes, mime) { await storage.upload(path, bytes, mime); uncertain++; throw new Error("Respuesta perdida tras upload real"); },
    };
    const result = await createVersionPublishService({ store: store(), storage: uncertainStorage }).publishVersion(op);
    expect(result).toMatchObject({ ok: true });
    expect(uncertain).toBe(2);
    expect(await countVersions(op.documentId)).toBe(1);
    const identity = await objectIdentity(op.operationId);
    expect(await createVersionPublishService({ store: store(), storage }).publishVersion(op)).toMatchObject({ ok: true, value: { reused: true } });
    expect(await objectIdentity(op.operationId)).toEqual(identity);
    await verifyArtifacts(op.operationId, true);
  });

  it("objeto existente con bytes distintos es conflicto, no overwrite ni versión falsa", async () => {
    const op = await prepared();
    const publisher = store();
    const reserved = await publisher.reserve({ ...op, correlationId: key() });
    if (reserved.status !== "reserved") throw new Error("No reservó");
    const path = reserved.artifacts[0].objectPath;
    const wrong = Buffer.from("bytes ficticios divergentes");
    await storage.upload(path, wrong, "application/pdf");
    const identity = await objectIdentity(op.operationId);
    expect(await createVersionPublishService({ store: publisher, storage }).publishVersion(op)).toMatchObject({ ok: false, error: { code: "ARTIFACT_CONFLICT" } });
    expect(await countVersions(op.documentId)).toBe(0);
    expect(await objectIdentity(op.operationId)).toEqual(identity);
    expect(digest((await storage.download(path))!)).toBe(digest(wrong));
    expect((await psqlOk(`select document_status from public.documents where id=${lit(op.documentId)};`))[0][0]).not.toBe("finalizado");
    await inaccessible(path);
  });

  it("upload OK / transacción DB abortada: retry adopta mismos objetos, sin overwrite ni render", async () => {
    const op = await prepared();
    const publisher = store(executorRpc(true));
    expect(await createVersionPublishService({ store: publisher, storage }).publishVersion(op)).toMatchObject({ ok: false, error: { code: "TECHNICAL_FAILURE" } });
    expect(await countVersions(op.documentId)).toBe(0);
    await verifyArtifacts(op.operationId, false);
    const before = await reservations(op.operationId);
    const identities = await objectIdentity(op.operationId);
    let duplicates = 0;
    const retryStorage: ArtifactStorage = { download: storage.download, async upload(path, bytes, mime) {
      const result = await storage.upload(path, bytes, mime);
      expect(result).toBe("exists"); duplicates++; return result;
    } };
    expect(await createVersionPublishService({ store: publisher, storage: retryStorage }).publishVersion(op)).toMatchObject({ ok: true });
    expect(duplicates).toBe(2);
    expect(await reservations(op.operationId)).toEqual(before);
    expect(await objectIdentity(op.operationId)).toEqual(identities);
    expect(await countVersions(op.documentId)).toBe(1);
    await verifyArtifacts(op.operationId, true);
  });

  it("takeover rechaza publicación del worker viejo; no elimina sus objetos superseded", async () => {
    const op = await prepared();
    const publisher = store();
    const reserved = await publisher.reserve({ ...op, correlationId: key() });
    if (reserved.status !== "reserved") throw new Error("No reservó");
    for (const artifact of reserved.artifacts) {
      const staged = await publisher.staged({ ...op, kind: artifact.kind });
      if (staged.status !== "ready") throw new Error("Sin staging");
      await storage.upload(artifact.objectPath, Buffer.from(staged.contentHex, "hex"), artifact.kind === "pdf" ? "application/pdf" : "application/json");
    }
    await psqlOk(`update public.finalization_operations set lease_expires_at=now()-interval '1 minute' where id=${lit(op.operationId)};`);
    const takeover = await claim(op.documentId, op.revisionId);
    expect(takeover.fencing).toBe(op.fencing + 1);
    const pdf = reserved.artifacts.find((a) => a.kind === "pdf")!;
    const manifest = reserved.artifacts.find((a) => a.kind === "manifest")!;
    expect(await publisher.publish({ ...op, pdf, manifest, correlationId: key() })).toEqual({ status: "stale_fencing" });
    expect(await countVersions(op.documentId)).toBe(0);
    expect(await createVersionPublishService({ store: publisher, storage }).publishVersion(takeover)).toMatchObject({ ok: true });
    for (const artifact of reserved.artifacts) {
      const old = await storage.download(artifact.objectPath);
      expect([digest(old!), old!.byteLength]).toEqual([artifact.sha256, artifact.byteLength]);
      await inaccessible(artifact.objectPath);
    }
    expect(await countVersions(op.documentId)).toBe(1);
    await verifyArtifacts(op.operationId, true);
  });
});
