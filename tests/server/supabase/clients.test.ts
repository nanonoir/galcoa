import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  readPrivilegedConfig,
  readSessionConfig,
  SUPABASE_PUBLISHABLE_KEY_ENV,
  SUPABASE_SECRET_KEY_ENV,
  SUPABASE_URL_ENV,
  SupabaseConfigError,
} from "@/lib/supabase/config";
import { createPrivilegedClient, PrivilegedAccessError } from "@/lib/supabase/privileged";
import { createSessionClient, type RequestCookieStore } from "@/lib/supabase/session";

// Valores ficticios; ningún proyecto real.
const URL_OK = "https://proyecto-ficticio.supabase.invalid";
const PUBLIC_KEY = "sb_publishable_ficticia";
const SECRET_KEY = "sb_secret_ficticia_no_usar";
const env = (vars: Record<string, string | undefined>) => (name: string) => vars[name];
const full = env({ [SUPABASE_URL_ENV]: URL_OK, [SUPABASE_PUBLISHABLE_KEY_ENV]: PUBLIC_KEY, [SUPABASE_SECRET_KEY_ENV]: SECRET_KEY });

function cookieStore(initial: Record<string, string>): RequestCookieStore & { set: { name: string; value: string }[] } {
  const set: { name: string; value: string }[] = [];
  return {
    set,
    getAll: () => Object.entries(initial).map(([name, value]) => ({ name, value })),
    setAll: (cookies) => cookies.forEach(({ name, value }) => set.push({ name, value })),
  };
}

describe("Configuración perezosa (MVP-025)", () => {
  it("lee URL y clave pública al usar, y la privilegiada aparte", () => {
    expect(readSessionConfig(full)).toEqual({ url: URL_OK, publishableKey: PUBLIC_KEY });
    expect(readPrivilegedConfig(full)).toEqual({ url: URL_OK, secretKey: SECRET_KEY });
  });

  it.each([
    ["sin URL", { [SUPABASE_PUBLISHABLE_KEY_ENV]: PUBLIC_KEY }],
    ["sin clave pública", { [SUPABASE_URL_ENV]: URL_OK }],
    ["URL inválida", { [SUPABASE_URL_ENV]: "no-es-url", [SUPABASE_PUBLISHABLE_KEY_ENV]: PUBLIC_KEY }],
    ["valores en blanco", { [SUPABASE_URL_ENV]: "  ", [SUPABASE_PUBLISHABLE_KEY_ENV]: " " }],
  ])("sesión %s: error técnico estable y sin valores", (_, vars) => {
    let error: unknown;
    try {
      readSessionConfig(env(vars));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SupabaseConfigError);
    expect(error).toMatchObject({ code: "SUPABASE_CONFIG_MISSING", stage: "persistencia", retryable: false });
    expect(String((error as Error).message)).not.toMatch(/ficticia|supabase\.invalid/);
  });

  it("la falta de clave privilegiada no menciona su nombre ni valores", () => {
    expect(() => readPrivilegedConfig(env({ [SUPABASE_URL_ENV]: URL_OK }))).toThrow(SupabaseConfigError);
    try {
      readPrivilegedConfig(env({ [SUPABASE_URL_ENV]: URL_OK }));
    } catch (e) {
      expect((e as Error).message).not.toContain(SUPABASE_SECRET_KEY_ENV);
    }
  });

  it("la clave privilegiada nunca usa el prefijo público", () => {
    expect(SUPABASE_SECRET_KEY_ENV.startsWith("NEXT_PUBLIC_")).toBe(false);
  });
});

describe("Cliente de sesión por petición (MVP-025)", () => {
  it("se crea con la clave pública y las cookies de esa petición", () => {
    const create = vi.fn(() => ({}) as never);
    const store = cookieStore({ "sb-a-auth-token": "token-a" });
    createSessionClient(store, { readEnv: full, createClient: create });

    expect(create).toHaveBeenCalledTimes(1);
    const [url, key, options] = create.mock.calls[0] as unknown as [string, string, { cookies: { getAll(): unknown; setAll(c: unknown[], h: object): void } }];
    expect([url, key]).toEqual([URL_OK, PUBLIC_KEY]);
    expect(options.cookies.getAll()).toEqual([{ name: "sb-a-auth-token", value: "token-a" }]);
    options.cookies.setAll([{ name: "sb-a-auth-token", value: "nuevo", options: {} }], {});
    expect(store.set).toEqual([{ name: "sb-a-auth-token", value: "nuevo" }]);
  });

  it("dos peticiones no comparten cookies ni cliente", () => {
    const create = vi.fn((_u: string, _k: string, o: { cookies: { getAll(): unknown } }) => ({ cookies: o.cookies.getAll() }) as never);
    const a = createSessionClient(cookieStore({ c: "de-ana" }), { readEnv: full, createClient: create as never });
    const b = createSessionClient(cookieStore({ c: "de-luis" }), { readEnv: full, createClient: create as never });
    expect(a).not.toBe(b);
    expect(a).toMatchObject({ cookies: [{ value: "de-ana" }] });
    expect(b).toMatchObject({ cookies: [{ value: "de-luis" }] });
  });

  it("un almacén de solo lectura (Server Component) no rompe la petición", () => {
    const create = vi.fn(() => ({}) as never);
    const readOnly: RequestCookieStore = {
      getAll: () => [],
      setAll: () => {
        throw new Error("Cookies can only be modified in a Server Action or Route Handler");
      },
    };
    createSessionClient(readOnly, { readEnv: full, createClient: create });
    const options = (create.mock.calls[0] as unknown as [string, string, { cookies: { setAll(c: unknown[], h: object): void } }])[2];
    expect(() => options.cookies.setAll([{ name: "x", value: "y", options: {} }], {})).not.toThrow();
  });

  it("sin configuración falla antes de crear el cliente", () => {
    const create = vi.fn();
    expect(() => createSessionClient(cookieStore({}), { readEnv: env({}), createClient: create as never })).toThrow(SupabaseConfigError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("Cliente privilegiado acotado (MVP-025)", () => {
  it("solo se crea con una operación autorizada, sin sesión persistente", () => {
    const create = vi.fn(() => ({}) as never);
    createPrivilegedClient({ verifiedUserId: "usuario-1", operation: "evidence.sign_upload" }, { readEnv: full, createClient: create });
    expect(create).toHaveBeenCalledWith(URL_OK, SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it.each([
    ["sin usuario verificado", { verifiedUserId: "", operation: "evidence.sign_upload" }],
    ["sin operación", { verifiedUserId: "u", operation: "" }],
    ["operación genérica", { verifiedUserId: "u", operation: "todo" }],
    ["sin constancia", undefined],
  ])("rechaza %s antes de leer la clave", (_, authorized) => {
    const readEnv = vi.fn(full);
    const create = vi.fn();
    expect(() => createPrivilegedClient(authorized as never, { readEnv, createClient: create as never })).toThrow(PrivilegedAccessError);
    expect(readEnv).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("Sin inicialización por import (MVP-025)", () => {
  const dir = path.resolve(import.meta.dirname, "../../../src/lib/supabase");

  it("cada archivo importa server-only y no crea clientes ni lee el entorno al nivel del módulo", () => {
    for (const file of readdirSync(dir)) {
      const source = readFileSync(path.join(dir, file), "utf8");
      const lines = source.split(/\r?\n/);
      expect(lines[0], file).toBe('import "server-only";');
      const topLevel = lines.filter((l) => /^(const|let|var|export const)\s/.test(l));
      // Las funciones flecha se evalúan al llamarlas, no al importar.
      for (const line of topLevel.filter((l) => !l.includes("=>"))) {
        expect(line, file).not.toMatch(/createClient\(|createServerClient\(|process\.env/);
      }
    }
  });

  it("importar los módulos no llama a Supabase", async () => {
    vi.resetModules();
    const calls: string[] = [];
    vi.doMock("@supabase/ssr", () => ({ createServerClient: () => calls.push("ssr") }));
    vi.doMock("@supabase/supabase-js", () => ({ createClient: () => calls.push("js") }));
    await import("@/lib/supabase/session");
    await import("@/lib/supabase/privileged");
    await import("@/lib/supabase/config");
    expect(calls).toEqual([]);
    vi.doUnmock("@supabase/ssr");
    vi.doUnmock("@supabase/supabase-js");
  });
});
