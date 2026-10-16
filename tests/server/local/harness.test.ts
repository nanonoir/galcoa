import { beforeAll, describe, expect, it } from "vitest";

import { anonClient, createTestUser, newId, psqlOk, readLocalStack, seedDocument, SQLSTATE, type LocalStack, type SeededDocument, type TestUser } from "../rls/harness";

import { backendPid, distinctBackends, runIndependent, runSqlOnIndependentConnections } from "./concurrency";

/**
 * Prueba del propio harness sobre Postgres/Auth locales reales (MVP-120). Reutiliza el
 * seed y los helpers de MVP-024; no define otra convención ni duplica usuarios A/B/anon.
 */

let stack: LocalStack;
let userA: TestUser;
let userB: TestUser;
let docA: SeededDocument;

beforeAll(async () => {
  stack = readLocalStack();
  userA = await createTestUser(stack, "harness-a");
  userB = await createTestUser(stack, "harness-b");
  docA = await seedDocument(userA.id, { withVersion: false });
});

describe("usuarios A/B/anon sobre Auth local real", () => {
  it("cada cliente independiente ve lo suyo; anon no ve nada", async () => {
    const reads = await runIndependent(3, async (index) =>
      [userA.client, userB.client, anonClient(stack)][index].from("documents").select("id"),
    );
    const [a, b, anon] = reads.map((r) => (r.status === "fulfilled" ? r.value : null));
    expect(a?.error).toBeNull();
    expect(a?.data?.map((row) => row.id)).toContain(docA.documentId);
    expect(b?.data?.map((row) => row.id) ?? []).not.toContain(docA.documentId);
    expect(anon?.data ?? []).toEqual([]);
  });
});

describe("concurrencia con conexiones independientes", () => {
  it("N conexiones disputan la misma clave única: una sola decisión, el resto 23505", async () => {
    const attempts = 4;
    const messageId = () => newId();
    // Cada conexión toma el lock del índice único y lo mantiene 1 s: las demás quedan
    // bloqueadas en Postgres hasta que el ganador confirma (contención real, no simulada).
    const results = await runSqlOnIndependentConnections(
      attempts,
      `begin;
select pg_backend_pid();
insert into public.messages (id, document_id, sequence, sender, content)
  values ('${messageId()}', '${docA.documentId}', 2, 'autor', 'disputa');
select pg_sleep(1);
commit;`,
    );

    expect(distinctBackends(results)).toBe(attempts);
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(attempts - 1);
    for (const loser of losers) expect(loser.error).toContain(`ERROR:  ${SQLSTATE.unique}:`);
    expect(backendPid(winners[0])).toBeGreaterThan(0);

    const rows = await psqlOk(`select count(*) from public.messages where document_id = '${docA.documentId}' and sequence = 2;`);
    expect(rows[0][0]).toBe("1");
  });

  it("el helper detecta que dos resultados vinieron del mismo backend (no acepta una simulación)", () => {
    const same = { ok: true, rows: [["4242"]], error: "" };
    expect(distinctBackends([same, same])).toBe(1);
    expect(() => backendPid({ ok: true, rows: [], error: "" })).toThrow("pg_backend_pid");
  });
});
