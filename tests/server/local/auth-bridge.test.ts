import { execFileSync } from "node:child_process";
import path from "node:path";

import { afterAll, beforeAll, expect, it } from "vitest";

import { createSessionClient, type CookieToSet } from "@/lib/supabase/session";

import { buildTestBridge, smokeImportBridge, type BridgeBuild } from "../bridge/build";
import { createTestUser, readLocalStack, type LocalStack, type TestUser } from "../rls/harness";

let bridge: BridgeBuild;
let stack: LocalStack;
let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
  stack = readLocalStack();
  userA = await createTestUser(stack, "bridge-a");
  userB = await createTestUser(stack, "bridge-b");
  bridge = await buildTestBridge({ entry: path.resolve(import.meta.dirname, "../bridge/entry.ts") });
  expect(smokeImportBridge(bridge)).toContain("createLocalAuthContext");
});

afterAll(() => bridge?.cleanup());

// El mismo adapter que usa Next escribe cookies SSR reales a partir de los tokens
// del usuario del helper compartido. Ni un UID ni service_role entran al puente.
async function cookiesFor(user: TestUser) {
  const { data } = await user.client.auth.getSession();
  const cookies: CookieToSet[] = [];
  const client = createSessionClient({ getAll: () => [], setAll: (changes) => cookies.push(...changes) }, {
    readEnv: (name) => name === "NEXT_PUBLIC_SUPABASE_URL" ? stack.apiUrl :
      name === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ? stack.anonKey : undefined,
  });
  const result = await client.auth.setSession(data.session!);
  if (result.error) throw new Error("No se pudieron adaptar las cookies locales");
  return cookies.map(({ name, value }) => ({ name, value }));
}

// Cada ejercicio importa el ESM generado en Node limpio: sin Vitest, alias ni .env.
// Los datos efímeros viajan por stdin, nunca por argumentos, logs o archivos.
function run(script: string, input: unknown) {
  const program = `import fs from 'node:fs';
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const bridge = await import(${JSON.stringify(bridge.fileUrl)});
    ${script}`;
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", program], {
    input: JSON.stringify(input), encoding: "utf8", timeout: 60_000,
    stdio: ["pipe", "pipe", "pipe"],
  }));
}

it("cookies A/B reales autorizan la factory de dominio sin confiar en un UID del caller", async () => {
  const result = run(`
    const ids = [];
    const outcomes = [];
    for (const cookies of input.cookies) {
      const { session } = bridge.createLocalAuthContext({ ...input.config, cookies });
      ids.push(await session.currentUserId());
      // Almacén en memoria explícito: esto prueba autorización, NO persistencia SQL.
      const unused = {};
      const handlers = bridge.createBridgeHandlers({
        turn: { session, turns: unused, messages: unused, documents: unused, drafting: unused, currentDraftRevision: async () => 0 },
        evidence: { session, store: { listEvidences: async (owner) => owner === input.owner ? [] : null }, storage: unused },
        contrast: { session, messages: unused, store: unused, groq: unused },
        verification: { store: unused, mirror: unused },
      });
      outcomes.push(await handlers.evidence.listEvidences('documento-ficticio-A'));
    }
    console.log(JSON.stringify({ ids, outcomes }));`, {
    config: { url: stack.apiUrl, publishableKey: stack.anonKey },
    cookies: [await cookiesFor(userA), await cookiesFor(userB), []], owner: userA.id,
  });
  expect(result.ids).toEqual([userA.id, userB.id, null]);
  expect(result.outcomes[0]).toMatchObject({ ok: true, value: [] });
  expect(result.outcomes[1]).toMatchObject({ ok: false, error: { code: "NOT_AVAILABLE" } });
  expect(result.outcomes[2]).toMatchObject({ ok: false, error: { code: "NO_SESSION" } });
});

it("rechaza cookie corrupta y token inválido comprobado por Auth local", async () => {
  const cookies = await cookiesFor(userA);
  const corrupt = cookies.map((cookie) => ({ ...cookie, value: "cookie-invalida" }));
  const invalidToken = cookies.map((cookie) => {
    const data = JSON.parse(Buffer.from(cookie.value.slice("base64-".length), "base64url").toString());
    data.access_token = `${data.access_token.slice(0, -8)}invalido`;
    return { ...cookie, value: `base64-${Buffer.from(JSON.stringify(data)).toString("base64url")}` };
  });
  expect(run(`
    const ids = [];
    for (const cookies of input.cookies) ids.push(await bridge.createLocalAuthContext({ ...input.config, cookies }).session.currentUserId());
    console.log(JSON.stringify(ids));`, {
    config: { url: stack.apiUrl, publishableKey: stack.anonKey }, cookies: [corrupt, invalidToken],
  })).toEqual([null, null]);
});

it("Auth indisponible no se convierte en usuario ni anónimo; conserva caché por request", async () => {
  expect(run(`
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('{}', { status: 500 }); };
    const { session } = bridge.createLocalAuthContext(input);
    const codes = [];
    for (let i = 0; i < 2; i++) {
      try { await session.currentUserId(); } catch (error) { codes.push(error.code); }
    }
    console.log(JSON.stringify({ codes, calls }));`, {
    url: stack.apiUrl, publishableKey: stack.anonKey, cookies: await cookiesFor(userA),
  })).toMatchObject({ codes: ["AUTH_UNAVAILABLE", "AUTH_UNAVAILABLE"], calls: 1 });
});

it("cookie vencida se refresca con Auth local y devuelve cookies y headers de respuesta", async () => {
  const cookies = (await cookiesFor(userA)).map((cookie) => {
    const data = JSON.parse(Buffer.from(cookie.value.slice("base64-".length), "base64url").toString());
    data.expires_at = Math.floor(Date.now() / 1000) - 60;
    return { ...cookie, value: `base64-${Buffer.from(JSON.stringify(data)).toString("base64url")}` };
  });
  const result = run(`
    const context = bridge.createLocalAuthContext(input);
    const id = await context.session.currentUserId();
    console.log(JSON.stringify({ id, changes: context.cookieChanges.length, headers: context.cookieHeaders }));`, {
    url: stack.apiUrl, publishableKey: stack.anonKey, cookies,
  });
  expect(result.id).toBe(userA.id);
  expect(result.changes).toBeGreaterThan(0);
  expect(result.headers["Cache-Control"]).toContain("no-store");
});

it("URL remota, puerto ajeno y clave privilegiada fallan antes de cualquier fetch", () => {
  expect(run(`
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('red prohibida'); };
    let rejected = 0;
    for (const url of input.urls) {
      try { bridge.createLocalAuthContext({ url, publishableKey: input.key, cookies: [] }); } catch { rejected++; }
    }
    try { bridge.createLocalAuthContext({ url: 'http://127.0.0.1:54321', publishableKey: 'no-publica', cookies: [] }); } catch { rejected++; }
    console.log(JSON.stringify({ calls, rejected }));`, {
    key: stack.anonKey,
    urls: ["https://cloud.invalid", "http://localhost:54321", "http://127.0.0.1:54322", "http://127.0.0.1:54321/otro", "http://user@127.0.0.1:54321", "http://127.0.0.1:54321?x=1"],
  })).toEqual({ calls: 0, rejected: 7 });
});
