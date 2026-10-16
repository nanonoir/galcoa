import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import {
  anonClient, createTestUser, newId, psql, psqlAs, psqlOk, readLocalStack, seedDocument,
  type LocalStack, type SeededDocument, type TestUser,
} from "./harness";

/** Tablas que el propietario puede leer por API, con la columna que identifica su documento/versión. */
const OWNER_READABLE = [
  "documents", "messages", "message_events", "evidences", "evidence_extractions", "drafts",
  "verification_reports", "report_sources", "document_revisions", "revision_snapshots",
  "revision_participants", "snapshot_sources", "corroboration_responses", "document_versions",
  "audit_events", "version_receipts", "version_artifacts", "hedera_registrations",
];
const SERVER_ONLY = [
  "corroboration_requests", "idempotency_records", "finalization_operations", "artifact_staging",
  "artifact_reservations", "hedera_attempts",
];

let stack: LocalStack;
let userA: TestUser;
let userB: TestUser;
let docA: SeededDocument;
let docB: SeededDocument;

const asString = (value: unknown) => JSON.stringify(value);
const idsOf = (doc: SeededDocument) =>
  Object.values(doc).filter((v): v is string => typeof v === "string" && v.length >= 36);

beforeAll(async () => {
  stack = readLocalStack();
  userA = await createTestUser(stack, "usuario-a");
  userB = await createTestUser(stack, "usuario-b");
  docA = await seedDocument(userA.id, { withVersion: true });
  docB = await seedDocument(userB.id, { withVersion: true });
});

describe("tablas por API REST: A no ve datos de B, ni anon (MVP-024)", () => {
  it.each(OWNER_READABLE)("%s: A ve solo lo suyo, B solo lo suyo", async (table) => {
    const [a, b] = await Promise.all([userA.client.from(table).select("*"), userB.client.from(table).select("*")]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data?.length, `A sin filas en ${table}`).toBeGreaterThan(0);
    expect(b.data?.length, `B sin filas en ${table}`).toBeGreaterThan(0);
    const aText = asString(a.data);
    const bText = asString(b.data);
    for (const value of idsOf(docB)) expect(aText, `${table}: A ve un id de B`).not.toContain(value);
    for (const value of idsOf(docA)) expect(bText, `${table}: B ve un id de A`).not.toContain(value);
  });

  it.each(OWNER_READABLE)("%s: anon no recibe filas", async (table) => {
    const anon = await anonClient(stack).from(table).select("*");
    expect(anon.data ?? []).toHaveLength(0);
    expect(anon.error?.code).toBe("42501");
  });

  it.each(SERVER_ONLY)("%s: ni el propietario ni anon la leen por API", async (table) => {
    for (const client of [userA.client, anonClient(stack)]) {
      const res = await client.from(table).select("*");
      expect(res.data ?? []).toHaveLength(0);
      expect(res.error?.code).toBe("42501");
    }
  });

  it("service_role tampoco es un bypass general de las tablas", async () => {
    const service = createClient(stack.apiUrl, stack.serviceKey, { auth: { persistSession: false } });
    const res = await service.from("documents").select("*");
    expect(res.data ?? []).toHaveLength(0);
    expect(res.error?.code).toBe("42501");
  });

  it("A no puede escribir (ni en lo suyo ni en lo de B) por API", async () => {
    const insert = await userA.client.from("documents").insert({ owner_id: userA.id, title: "intruso" });
    expect(insert.error?.code).toBe("42501");
    const update = await userA.client.from("documents").update({ title: "hackeado" }).eq("id", docB.documentId);
    expect(update.error?.code).toBe("42501");
    const ownUpdate = await userA.client.from("messages").update({ content: "otro" }).eq("id", docA.messageId);
    expect(ownUpdate.error?.code).toBe("42501");
    const del = await userA.client.from("audit_events").delete().eq("document_id", docA.documentId);
    expect(del.error?.code).toBe("42501");
    const anonInsert = await anonClient(stack).from("documents").insert({ owner_id: userA.id, title: "anon" });
    expect(anonInsert.error?.code).toBe("42501");
    expect(await psqlOk(`select title from public.documents where id = '${docB.documentId}';`)).toEqual([
      [expect.stringMatching(/^Documento /)],
    ]);
  });
});

describe("SQL directo bajo roles de API", () => {
  it("authenticated A: ve su documento, 0 filas de B, y no puede modificar", async () => {
    const actor = { kind: "authenticated", userId: userA.id } as const;
    expect((await psqlAs(actor, "select id from public.documents order by 1;")).rows).toEqual([[docA.documentId]]);
    expect((await psqlAs(actor, `select id from public.documents where id = '${docB.documentId}';`)).rows).toEqual([]);
    for (const dml of [
      `update public.documents set title = 'x' where id = '${docB.documentId}';`,
      `delete from public.audit_events;`,
      `insert into public.audit_events (actor_scope, action, resource_type, outcome) values ('x','x','x','ok');`,
      `truncate public.messages;`,
    ]) {
      const result = await psqlAs(actor, dml);
      expect(result.ok, dml).toBe(false);
      expect(result.error).toContain("ERROR:  42501:");
    }
  });

  it("anon: sin acceso a tablas, a funciones privadas ni al esquema `private`", async () => {
    for (const sql of [
      "select * from public.documents;",
      "select * from public.corroboration_requests;",
      `select private.owns_document('${docA.documentId}');`,
    ]) {
      const result = await psqlAs({ kind: "anon" }, sql);
      expect(result.ok, sql).toBe(false);
      expect(result.error).toContain("ERROR:  42501:");
    }
  });

  it("authenticated no puede desactivar triggers y los roles de API no llegan al ejecutor", async () => {
    const result = await psqlAs({ kind: "authenticated", userId: userA.id }, "set session_replication_role = replica;");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ERROR:  42501:");
    // Los clientes de API entran por `authenticator`: solo hereda los roles de API.
    const reachable = await psqlOk(`
      with recursive reach(oid) as (
        select m.roleid from pg_auth_members m join pg_roles u on u.oid = m.member where u.rolname in ('authenticator','anon','authenticated')
        union select m.roleid from pg_auth_members m join reach r on m.member = r.oid)
      select rolname from pg_roles where oid in (select oid from reach) order by 1;`);
    const names = reachable.map((row) => row[0]);
    expect(names).not.toContain("galcoa_executor");
    expect(names).not.toContain("postgres");
    expect(names).not.toContain("supabase_admin");
  });

  it("las funciones de ayuda de propiedad solo responden por el usuario autenticado", async () => {
    const asA = await psqlAs({ kind: "authenticated", userId: userA.id }, `select private.owns_document('${docA.documentId}'), private.owns_document('${docB.documentId}');`);
    expect(asA.rows).toEqual([["t", "f"]]);
  });
});

describe("Storage privado: A / B / anon contra el Storage local real", () => {
  const evidenceBytes = () => new Blob(["%PDF-evidencia ficticia"], { type: "application/pdf" });

  it("evidencias: solo el propietario sube a su reserva, sin sobrescribir ni borrar", async () => {
    const ok = await userA.client.storage.from("evidences-private").upload(docA.evidenceLocation, evidenceBytes());
    expect(ok.error).toBeNull();

    // B intenta usar la ruta reservada de A, una ruta arbitraria y A también una arbitraria.
    const bOnA = await userB.client.storage.from("evidences-private").upload(docA.evidenceLocation, evidenceBytes(), { upsert: true });
    expect(bOnA.error).not.toBeNull();
    const bFree = await userB.client.storage.from("evidences-private").upload(`${docB.documentId}/libre-${newId()}`, evidenceBytes());
    expect(bFree.error).not.toBeNull();
    const aFree = await userA.client.storage.from("evidences-private").upload(`${docA.documentId}/libre-${newId()}`, evidenceBytes());
    expect(aFree.error).not.toBeNull();
    const aInB = await userA.client.storage.from("evidences-private").upload(docB.evidenceLocation, evidenceBytes());
    expect(aInB.error).not.toBeNull();
    const anon = await anonClient(stack).storage.from("evidences-private").upload(docA.evidenceLocation, evidenceBytes(), { upsert: true });
    expect(anon.error).not.toBeNull();

    // Sin overwrite ni upsert, aun el propietario.
    const overwrite = await userA.client.storage.from("evidences-private").upload(docA.evidenceLocation, evidenceBytes(), { upsert: true });
    expect(overwrite.error).not.toBeNull();
  });

  it("evidencias: A lee y lista lo suyo; B y anon no ven ni leen objetos ajenos", async () => {
    const bOwn = await userB.client.storage.from("evidences-private").upload(docB.evidenceLocation, evidenceBytes());
    expect(bOwn.error).toBeNull();

    const aList = await userA.client.storage.from("evidences-private").list(docA.documentId);
    expect(aList.data?.length).toBe(1);
    const aListB = await userA.client.storage.from("evidences-private").list(docB.documentId);
    expect(aListB.data ?? []).toHaveLength(0);
    const bListA = await userB.client.storage.from("evidences-private").list(docA.documentId);
    expect(bListA.data ?? []).toHaveLength(0);
    const anonList = await anonClient(stack).storage.from("evidences-private").list(docA.documentId);
    expect(anonList.data ?? []).toHaveLength(0);

    expect((await userA.client.storage.from("evidences-private").download(docA.evidenceLocation)).error).toBeNull();
    expect((await userB.client.storage.from("evidences-private").download(docA.evidenceLocation)).error).not.toBeNull();
    expect((await anonClient(stack).storage.from("evidences-private").download(docA.evidenceLocation)).error).not.toBeNull();

    // El bucket no es público: la URL pública no sirve el objeto.
    const publicUrl = anonClient(stack).storage.from("evidences-private").getPublicUrl(docA.evidenceLocation).data.publicUrl;
    expect((await fetch(publicUrl)).ok).toBe(false);
  });

  it("evidencias: el propietario no puede borrar ni mover su original", async () => {
    await userA.client.storage.from("evidences-private").remove([docA.evidenceLocation]);
    expect((await userA.client.storage.from("evidences-private").download(docA.evidenceLocation)).error).toBeNull();
    const move = await userA.client.storage.from("evidences-private").move(docA.evidenceLocation, `${docA.documentId}/movida`);
    expect(move.error).not.toBeNull();
    await userB.client.storage.from("evidences-private").remove([docA.evidenceLocation]);
    expect((await userA.client.storage.from("evidences-private").download(docA.evidenceLocation)).error).toBeNull();
  });

  it("PDF: solo se sube a una reserva técnica vigente del propietario, una sola vez", async () => {
    const pdf = () => new Blob(["%PDF-ficticio"], { type: "application/pdf" });
    const bOnA = await userB.client.storage.from("versions-private").upload(docA.reservationPath, pdf());
    expect(bOnA.error).not.toBeNull();
    const anon = await anonClient(stack).storage.from("versions-private").upload(docA.reservationPath, pdf());
    expect(anon.error).not.toBeNull();
    const free = await userA.client.storage.from("versions-private").upload(`${docA.documentId}/pdf/${newId()}`, pdf());
    expect(free.error).not.toBeNull();

    const ok = await userA.client.storage.from("versions-private").upload(docA.reservationPath, pdf());
    expect(ok.error).toBeNull();
    const again = await userA.client.storage.from("versions-private").upload(docA.reservationPath, pdf(), { upsert: true });
    expect(again.error).not.toBeNull();
    // Subir al objeto no publica nada: la versión solo la crea el ejecutor.
    expect(await psqlOk(`select count(*) from public.version_artifacts where object_path = '${docA.reservationPath}';`)).toEqual([["0"]]);
  });

  it("PDF: una reserva vencida o con fencing viejo no admite subida", async () => {
    const pdf = () => new Blob(["%PDF-ficticio"], { type: "application/pdf" });
    const expired = await seedDocument(userA.id, { withVersion: false });
    await psqlOk(`update public.artifact_reservations set expires_at = now() - interval '1 minute' where operation_id = '${expired.operationId}';`);
    expect((await userA.client.storage.from("versions-private").upload(expired.reservationPath, pdf())).error).not.toBeNull();

    const fenced = await seedDocument(userA.id, { withVersion: false });
    await psqlOk(`update public.finalization_operations set fencing = 2 where id = '${fenced.operationId}';`);
    expect((await userA.client.storage.from("versions-private").upload(fenced.reservationPath, pdf())).error).not.toBeNull();

    const abandoned = await seedDocument(userA.id, { withVersion: false });
    await psqlOk(`update public.finalization_operations set status = 'abandoned' where id = '${abandoned.operationId}';`);
    expect((await userA.client.storage.from("versions-private").upload(abandoned.reservationPath, pdf())).error).not.toBeNull();
  });

  it("PDF publicado: lo lee el propietario; B y anon no", async () => {
    const service = createClient(stack.apiUrl, stack.serviceKey, { auth: { persistSession: false } });
    const published = await service.storage.from("versions-private").upload(docA.publishedPath, new Blob(["%PDF-publicado"]));
    expect(published.error).toBeNull();
    expect((await userA.client.storage.from("versions-private").download(docA.publishedPath)).error).toBeNull();
    expect((await userB.client.storage.from("versions-private").download(docA.publishedPath)).error).not.toBeNull();
    expect((await anonClient(stack).storage.from("versions-private").download(docA.publishedPath)).error).not.toBeNull();
    expect((await userB.client.storage.from("versions-private").list(`${docA.documentId}/published`)).data ?? []).toHaveLength(0);
    expect((await userA.client.storage.from("versions-private").list(`${docA.documentId}/published`)).data?.length).toBe(1);
  });
});

describe("objetos de otras sesiones no se filtran por consulta directa", () => {
  it("authenticated no lee storage.objects ajenos por SQL", async () => {
    const result = await psqlAs(
      { kind: "authenticated", userId: userB.id },
      `select count(*) from storage.objects where name like '${docA.documentId}%';`,
    );
    expect(result.rows).toEqual([["0"]]);
    // Fuera de la política también existe el objeto (visto como superusuario).
    const owner = await psql(`select count(*) from storage.objects where name like '${docA.documentId}%';`);
    expect(Number(owner.rows[0]?.[0])).toBeGreaterThan(0);
  });
});
