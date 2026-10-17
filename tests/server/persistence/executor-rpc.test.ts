import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({ query: vi.fn(), on: vi.fn(), end: vi.fn(), configs: [] as unknown[] }));
vi.mock("pg", () => ({ Pool: class {
  constructor(config: unknown) { doubles.configs.push(config); }
  query = doubles.query;
  on = doubles.on;
  end = doubles.end;
} }));

import { createExecutorRpcFactory } from "@/lib/documents/persistence/executor-rpc";

let owner: ReturnType<typeof createExecutorRpcFactory>;
const createExecutorRpc = (user: string) => owner.forUser(user);

const args = () => ({ p_actor_id: "verified", p_document_id: "doc", p_content: "'); drop table messages; --",
  p_declared_event_date: { kind: "unknown" }, p_key: "key", p_correlation_id: "correlation" });

beforeEach(() => {
  owner = createExecutorRpcFactory();
  vi.stubEnv("GALCOA_EXECUTOR_DATABASE_URL", "postgresql://galcoa_exec_login:unit-only@localhost/db");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("GALCOA_EXECUTOR_DATABASE_CA", "");
  doubles.configs.length = 0;
  doubles.query.mockReset().mockResolvedValue({ rows: [{ result: { status: "created" } }] });
  doubles.end.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => { await owner.close(); vi.unstubAllEnvs(); });

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
  it("ocho contextos concurrentes A/B comparten un pool sin cruzar actores", async () => {
    const actors = ["A", "B", "A", "B", "A", "B", "A", "B"];
    const results = await Promise.all(actors.map((actor) => createExecutorRpc(actor)!.rpc("append_agent_message", { ...args(), p_actor_id: actor })));
    expect(results.every((result) => result.error === null)).toBe(true);
    expect(doubles.configs).toHaveLength(1);
    expect(doubles.configs[0]).toMatchObject({ max: 2 });
    expect(doubles.query.mock.calls.map((call) => call[1][0])).toEqual(actors);
    const wrapperA = createExecutorRpc("A")!;
    expect("close" in wrapperA).toBe(false);
    expect((await wrapperA.rpc("append_agent_message", { ...args(), p_actor_id: "B" })).error).toBeTruthy();
    expect((await wrapperA.rpc("select 1", args())).error).toBeTruthy();
    expect(doubles.query).toHaveBeenCalledTimes(8);
    expect(doubles.end).not.toHaveBeenCalled();
  });
  it("composición productiva comparte el owner privado entre peticiones", async () => {
    vi.resetModules();
    try {
      const product = await import("@/lib/documents/persistence/executor-rpc");
      expect(doubles.configs).toHaveLength(0);
      await Promise.all(["A", "B", "A", "B"].map((actor) =>
        product.createExecutorRpc(actor)!.rpc("append_agent_message", { ...args(), p_actor_id: actor })));
      expect(doubles.configs).toHaveLength(1);
      expect(doubles.query.mock.calls.map((call) => call[1][0])).toEqual(["A", "B", "A", "B"]);
      expect("close" in product.createExecutorRpc("A")!).toBe(false);
    } finally {
      // Pool is mocked: clearing the module isolates the private owner without hooks.
      vi.resetModules();
    }
  });
  it("cambio de configuración falla cerrado sin acumular pools; exige reinicio", async () => {
    await createExecutorRpc("verified")!.rpc("append_agent_message", args());
    vi.stubEnv("GALCOA_EXECUTOR_DATABASE_URL", "postgres://galcoa_exec_login:rotated@localhost/db");
    expect((await createExecutorRpc("verified")!.rpc("append_agent_message", args())).error).toBeTruthy();
    expect(doubles.configs).toHaveLength(1);
    expect(doubles.query).toHaveBeenCalledTimes(1);
    expect(doubles.end).not.toHaveBeenCalled();
  });
  it("permite las RPC de turnos durables con un pool y su orden exacto de argumentos", async () => {
    const { turnRpcCommands } = await import("@/lib/documents/turns/rpc-commands");
    const rpc = createExecutorRpc("verified")!;
    for (const [name, keys] of Object.entries(turnRpcCommands)) {
      doubles.query.mockClear();
      const input = Object.fromEntries(keys.map((key) => [key, key === "p_actor_id" ? "verified" : key]));
      expect((await rpc.rpc(name, input)).error).toBeNull();
      expect(doubles.query).toHaveBeenCalledWith(
        `select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(", ")}) as result`, [...keys].map((key) => input[key]));
      expect((await rpc.rpc(name, { ...input, p_actor_id: "other" })).error).toBeTruthy();
      expect((await rpc.rpc(name, { ...input, extra: 1 })).error).toBeTruthy();
    }
    expect(doubles.configs).toHaveLength(1);
  });
  it("close es idempotente y solo dispone el pool del owner que lo creó", async () => {
    const other = createExecutorRpcFactory();
    await createExecutorRpc("verified")!.rpc("append_agent_message", args());
    await other.forUser("verified")!.rpc("append_agent_message", args());
    await other.close();
    await other.close();
    expect(doubles.end).toHaveBeenCalledTimes(1);
    expect((await other.forUser("verified")!.rpc("append_agent_message", args())).error).toBeTruthy();
    expect((await createExecutorRpc("verified")!.rpc("append_agent_message", args())).error).toBeNull();
    expect(doubles.configs).toHaveLength(2);
    await owner.close();
    expect(doubles.end).toHaveBeenCalledTimes(2);
  });
});
