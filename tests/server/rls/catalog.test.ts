import { describe, expect, it } from "vitest";

import { psql, psqlOk, TABLES_WITHOUT_RLS_SQL } from "./harness";

/** Tablas solo del ejecutor de servidor: ni siquiera el propietario las lee por API. */
const SERVER_ONLY_TABLES = [
  "artifact_reservations",
  "artifact_staging",
  "corroboration_requests",
  "finalization_operations",
  "hedera_attempts",
  "idempotency_records",
];

const column = async (sql: string) => (await psqlOk(sql)).map((row) => row[0]);

describe("catálogo: esquema aplicado desde cero (MVP-023)", () => {
  it("registra las migraciones base y la aditiva F4", async () => {
    expect(await column("select version from supabase_migrations.schema_migrations order by 1;")).toEqual([
      "20261016000100",
      "20261016000200",
      "20261016000300",
      "20261016000400",
      "20261016001000",
      "20261016001100",
      "20261016001200",
      "20261016001201",
    ]);
  });

  it("crea las tablas del modelo C1–C3", async () => {
    const tables = await column("select tablename from pg_tables where schemaname = 'public' order by 1;");
    expect(tables).toEqual(
      [
        "artifact_reservations", "artifact_staging", "audit_events", "corroboration_requests",
        "corroboration_responses", "document_revisions", "document_versions", "documents", "drafts",
        "evidence_extractions", "evidences", "finalization_operations", "hedera_attempts",
        "hedera_registrations", "idempotency_records", "message_events", "messages", "report_sources",
        "revision_participants", "revision_snapshots", "snapshot_sources", "verification_reports",
        "version_artifacts", "version_receipts",
      ].sort(),
    );
  });

  it("el ejecutor de servidor existe sin login, sin bypass de RLS y sin superusuario", async () => {
    expect(
      await psqlOk("select rolcanlogin, rolbypassrls, rolsuper from pg_roles where rolname = 'galcoa_executor';"),
    ).toEqual([["f", "f", "f"]]);
  });
});

describe("catálogo: RLS y permisos (MVP-024)", () => {
  it("toda tabla de `public` tiene RLS habilitado", async () => {
    expect(await column(TABLES_WITHOUT_RLS_SQL)).toEqual([]);
  });

  it("el chequeo detecta una tabla expuesta sin RLS", async () => {
    const result = await psql(`begin; create table public.zz_sin_rls (id int); ${TABLES_WITHOUT_RLS_SQL} rollback;`);
    expect(result.ok).toBe(true);
    expect(result.rows.map((row) => row[0])).toContain("zz_sin_rls");
    expect(await column(TABLES_WITHOUT_RLS_SQL)).toEqual([]);
  });

  it("anon y service_role no tienen ningún privilegio sobre tablas; authenticated solo SELECT", async () => {
    const any = "'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'";
    const base = "from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p')";
    expect(await column(`select c.relname ${base} and (has_table_privilege('anon', c.oid, ${any}) or has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) order by 1;`)).toEqual([]);
    expect(await column(`select c.relname ${base} and (has_table_privilege('service_role', c.oid, ${any}) or has_any_column_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')) order by 1;`)).toEqual([]);
    expect(await column(`select c.relname ${base} and (has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('authenticated', c.oid, 'INSERT,UPDATE,REFERENCES')) order by 1;`)).toEqual([]);
  });

  it("PUBLIC no tiene privilegios sobre tablas ni secuencias de `public`", async () => {
    expect(
      await column(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace,
           aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
         where n.nspname = 'public' and c.relkind in ('r','p','S') and a.grantee = 0 order by 1;`,
      ),
    ).toEqual([]);
  });

  it("las tablas solo del ejecutor no son legibles por authenticated", async () => {
    const unreadable = await column(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not has_table_privilege('authenticated', c.oid, 'SELECT') order by 1;`,
    );
    expect(unreadable).toEqual(SERVER_ONLY_TABLES);
  });

  it("solo se exponen las RPC de F4 enumeradas (sin funciones genéricas)", async () => {
    expect(
      await column(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by p.proname;`,
      ),
    ).toEqual(["accept_evidence", "append_agent_message", "append_document_audit", "append_evidence_extraction", "append_message", "create_document", "discard_evidence_reservation", "get_document", "get_evidence", "list_documents", "list_evidence_extractions", "list_evidences", "list_messages", "reserve_evidence"]);
  });

  it("toda función propia fija `search_path` y ninguna es ejecutable por PUBLIC ni anon", async () => {
    const own = "from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private')";
    expect(
      await column(
        `select p.proname ${own} and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') order by 1;`,
      ),
    ).toEqual([]);
    expect(
      await column(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
           aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         where n.nspname in ('public','private') and a.grantee = 0 and a.privilege_type = 'EXECUTE' order by 1;`,
      ),
    ).toEqual([]);
    expect(await column(`select p.proname ${own} and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1;`)).toEqual([]);
    expect(await column(`select has_schema_privilege('anon', 'private', 'USAGE');`)).toEqual(["f"]);
  });

  it("los buckets de Storage existen y no son públicos", async () => {
    expect(await psqlOk("select id, public from storage.buckets order by 1;")).toEqual([
      ["evidences-private", "f"],
      ["versions-private", "f"],
    ]);
  });

  it("los objetos de Storage no tienen políticas de UPDATE ni DELETE para roles de API", async () => {
    expect(
      await column(
        `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
           and cmd in ('UPDATE','DELETE','ALL') and (roles && array['anon','authenticated','public']::name[]) order by 1;`,
      ),
    ).toEqual([]);
  });
});
