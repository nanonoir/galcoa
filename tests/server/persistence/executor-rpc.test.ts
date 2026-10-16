import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({ query: vi.fn(), on: vi.fn(), configs: [] as unknown[] }));
vi.mock("pg", () => ({ Pool: class {
  constructor(config: unknown) { doubles.configs.push(config); }
  query = doubles.query;
  on = doubles.on;
} }));

import { createExecutorRpc } from "@/lib/documents/persistence/executor-rpc";

const args = () => ({ p_actor_id: "verified", p_document_id: "doc", p_content: "'); drop table messages; --",
  p_declared_event_date: { kind: "unknown" }, p_key: "key", p_correlation_id: "correlation" });

beforeEach(() => {
  vi.stubEnv("GALCOA_EXECUTOR_DATABASE_URL", "postgresql://galcoa_exec_login:unit-only@localhost/db");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("GALCOA_EXECUTOR_DATABASE_CA", "");
  doubles.configs.length = 0;
  doubles.query.mockReset().mockResolvedValue({ rows: [{ result: { status: "created" } }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("executor RPC, sin conexiones reales", () => {
  it("es opcional y perezoso", () => {
    expect(doubles.configs).toHaveLength(0);
    createExecutorRpc("verified");
    expect(doubles.configs).toHaveLength(0);
    vi.stubEnv("GALCOA_EXECUTOR_DATABASE_URL", "");
    expect(createExecutorRpc("verified")).toBeUndefined();
  });
  it("parametriza contenido y usa solo nombres fijos", async () => {
    const rpc = createExecutorRpc("verified")!;
    expect((await rpc.rpc("append_agent_message", args())).error).toBeNull();
    expect(doubles.query).toHaveBeenCalledWith(
      "select public.append_agent_message(p_actor_id => $1, p_document_id => $2, p_content => $3, p_declared_event_date => $4, p_key => $5, p_correlation_id => $6) as result",
      Object.values(args()));
    expect(doubles.configs[0]).toMatchObject({ max: 2, ssl: false, connectionTimeoutMillis: 3000, query_timeout: 5000 });
  });
  it.each(["append_agent_message); drop table x;--", "toString", "constructor", "create_document"])("rechaza RPC %s", async (name) => {
    expect((await createExecutorRpc("verified")!.rpc(name, args())).error).toBeTruthy();
    expect(doubles.query).not.toHaveBeenCalled();
  });
  it("rechaza actor, claves extra y faltantes antes de crear pool", async () => {
    const rpc = createExecutorRpc("verified")!;
    for (const input of [{ ...args(), p_actor_id: "other" }, { ...args(), extra: 1 }, { p_actor_id: "verified" }]) {
      expect((await rpc.rpc("append_agent_message", input)).error).toBeTruthy();
    }
    expect(doubles.configs).toHaveLength(0);
  });
  it.each(["https://galcoa_exec_login@localhost/db", "postgres://postgres@localhost/db", "postgres://service_role@localhost/db", "postgres://galcoa_executor@localhost/db", "postgres://galcoa_exec_login@localhost/db?sslmode=disable", "not a URL"])("rechaza configuración insegura %s", async (url) => {
    vi.stubEnv("GALCOA_EXECUTOR_DATABASE_URL", url);
    expect((await createExecutorRpc("verified")!.rpc("append_agent_message", args())).error).toBeTruthy();
    expect(doubles.configs).toHaveLength(0);
  });
  it("TLS remoto estricto con CA opcional", async () => {
    vi.stubEnv("GALCOA_EXECUTOR_DATABASE_URL", "postgres://galcoa_exec_login.ref@aws-0.pooler.supabase.com/db");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
    vi.stubEnv("GALCOA_EXECUTOR_DATABASE_CA", "unit-ca");
    await createExecutorRpc("verified")!.rpc("append_agent_message", args());
    expect(doubles.configs[0]).toMatchObject({ ssl: { rejectUnauthorized: true, ca: "unit-ca" } });
  });
  it("rechaza referencia de proyecto ajena", async () => {
    vi.stubEnv("GALCOA_EXECUTOR_DATABASE_URL", "postgres://galcoa_exec_login.other@aws-0.pooler.supabase.com/db");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
    expect((await createExecutorRpc("verified")!.rpc("append_agent_message", args())).error).toBeTruthy();
    expect(doubles.query).not.toHaveBeenCalled();
  });
  it("auditoría tiene allowlist propia y no expone errores pg", async () => {
    doubles.query.mockRejectedValue({ message: "private URL SQL params", detail: "private", code: "XX000" });
    expect(await createExecutorRpc("verified")!.rpc("append_document_audit", {
      p_actor_id: "verified", p_document_id: "doc", p_type: "document.created", p_resource_id: "doc",
      p_outcome: "success", p_correlation_id: "c", p_key: "k",
    })).toEqual({ data: null, error: { code: "EXECUTOR_UNAVAILABLE" } });
  });
  it("conserva solo SQLSTATE enumerado sin mensaje ni detalle", async () => {
    doubles.query.mockRejectedValue({ code: "42501", message: "private", detail: "private", stack: "private" });
    expect(await createExecutorRpc("verified")!.rpc("append_agent_message", args())).toEqual({ data: null, error: { code: "42501" } });
  });
});
