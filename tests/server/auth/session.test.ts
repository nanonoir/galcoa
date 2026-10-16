import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  createSessionPort,
  PRIVATE_RESPONSE_HEADERS,
  requirePageUser,
  SessionUnavailableError,
  verifySession,
  withApiUser,
  type SessionCheck,
} from "@/lib/supabase/auth";
import { SUPABASE_PUBLISHABLE_KEY_ENV, SUPABASE_URL_ENV } from "@/lib/supabase/config";
import { refreshSession } from "@/lib/supabase/refresh";

// Dobles del cliente de Auth; ningún proyecto real.
const ANA = { id: "11111111-1111-4111-8111-111111111111", email: "ana@ejemplo.invalid" };
type GetUser = () => Promise<{ data: { user: unknown }; error: unknown }>;
const client = (getUser: GetUser) => ({ auth: { getUser } }) as never;
const ok = (user: unknown) => client(async () => ({ data: { user }, error: null }));
const fails = (error: unknown) => client(async () => ({ data: { user: null }, error }));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  },
}));

describe("Verificación de la sesión con el servidor de Auth (MVP-030)", () => {
  it("sesión válida: usuario verificado", async () => {
    expect(await verifySession(ok(ANA))).toEqual({ status: "authenticated", user: ANA });
  });

  it.each([
    ["cookie ausente", new AuthSessionMissingError()],
    ["token inválido o vencido", new AuthApiError("invalid JWT", 401, "bad_jwt")],
    ["usuario borrado", new AuthApiError("user not found", 403, "user_not_found")],
  ])("%s: sin sesión", async (_, error) => {
    expect(await verifySession(fails(error))).toEqual({ status: "anonymous" });
  });

  it.each([
    ["red caída", new AuthRetryableFetchError("fetch failed", 0)],
    ["Auth con 5xx", new AuthApiError("server error", 500, "unexpected_failure")],
    ["excepción inesperada", "lanza"],
  ])("%s: impedimento técnico, nunca éxito ni anónimo", async (_, error) => {
    const c =
      error === "lanza"
        ? client(async () => {
            throw new Error("boom");
          })
        : fails(error);
    expect(await verifySession(c)).toEqual({ status: "unavailable" });
  });

  it("respuesta sin usuario: sin sesión", async () => {
    expect(await verifySession(ok(null))).toEqual({ status: "anonymous" });
  });
});

describe("SessionPort para los servicios (MVP-030)", () => {
  it("devuelve el id verificado o null, y consulta Auth una sola vez por petición", async () => {
    const getUser = vi.fn(async () => ({ data: { user: ANA }, error: null }));
    const port = createSessionPort(client(getUser));
    expect(await port.currentUserId()).toBe(ANA.id);
    expect(await port.currentUserId()).toBe(ANA.id);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(await createSessionPort(fails(new AuthSessionMissingError())).currentUserId()).toBeNull();
  });

  it("si Auth falla, lanza un error técnico reintentable", async () => {
    await expect(createSessionPort(fails(new AuthRetryableFetchError("x", 0))).currentUserId()).rejects.toBeInstanceOf(
      SessionUnavailableError,
    );
  });
});

describe("Guarda de páginas privadas (MVP-030)", () => {
  const check = (s: SessionCheck) => async () => s;

  it("con sesión devuelve el usuario", async () => {
    expect(await requirePageUser(check({ status: "authenticated", user: ANA }))).toEqual(ANA);
  });

  it("sin sesión redirige al acceso", async () => {
    await expect(requirePageUser(check({ status: "anonymous" }))).rejects.toMatchObject({ path: "/acceso" });
  });

  it("si Auth falla no redirige como anónimo: error técnico", async () => {
    await expect(requirePageUser(check({ status: "unavailable" }))).rejects.toBeInstanceOf(SessionUnavailableError);
  });
});

describe("Patrón para Route Handlers privados (MVP-030)", () => {
  const handler = vi.fn(async (_req: Request, _ctx: unknown, user: { id: string }) => Response.json({ owner: user.id }));
  const request = new Request("https://app.invalid/api/documents");

  it("sin sesión: 401 con envelope estable y sin caché; el handler no corre", async () => {
    handler.mockClear();
    const res = await withApiUser(handler, async () => ({ status: "anonymous" }))(request, {});
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "NO_SESSION", stage: "autenticacion", retryable: false } });
    expect(res.headers.get("Cache-Control")).toBe(PRIVATE_RESPONSE_HEADERS["Cache-Control"]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("Auth caído: 503 reintentable, nunca éxito", async () => {
    const res = await withApiUser(handler, async () => ({ status: "unavailable" }))(request, {});
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "AUTH_UNAVAILABLE", retryable: true } });
    const thrown = await withApiUser(handler, async () => {
      throw new Error("x");
    })(request, {});
    expect(thrown.status).toBe(503);
  });

  it("con sesión: pasa el usuario verificado y marca la respuesta como privada", async () => {
    const res = await withApiUser(handler, async () => ({ status: "authenticated", user: ANA }))(request, {});
    expect(await res.json()).toEqual({ owner: ANA.id });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("los errores no incluyen tokens ni el email", async () => {
    const res = await withApiUser(handler, async () => ({ status: "anonymous" }))(
      new Request("https://app.invalid/api/x", { headers: { cookie: "sb-token=secreto" } }),
      {},
    );
    expect(await res.text()).not.toMatch(/secreto|@/);
  });
});

describe("Refresco de cookies en el proxy (MVP-030)", () => {
  const readEnv = (name: string) =>
    ({ [SUPABASE_URL_ENV]: "https://proyecto.supabase.invalid", [SUPABASE_PUBLISHABLE_KEY_ENV]: "pk-ficticia" })[name];

  it("renueva cookies y cabeceras que fija Supabase en la respuesta", async () => {
    const request = new NextRequest("https://app.invalid/documentos", { headers: { cookie: "sb-a=viejo" } });
    const createClient = vi.fn((_u: string, _k: string, options: { cookies: { getAll(): unknown; setAll(c: unknown[], h: object): void } }) => ({
      auth: {
        getClaims: async () => {
          expect(options.cookies.getAll()).toEqual([{ name: "sb-a", value: "viejo" }]);
          options.cookies.setAll([{ name: "sb-a", value: "nuevo", options: { httpOnly: true } }], { "Cache-Control": "private, no-store" });
          return { data: null, error: null };
        },
      },
    }));
    const res = await refreshSession(request, { readEnv, createClient: createClient as never });
    expect(res.cookies.get("sb-a")?.value).toBe("nuevo");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("sin configuración deja pasar sin crear clientes (páginas públicas y build)", async () => {
    const createClient = vi.fn();
    const res = await refreshSession(new NextRequest("https://app.invalid/"), { readEnv: () => undefined, createClient: createClient as never });
    expect(res.status).toBe(200);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("un fallo de Auth no corta la navegación", async () => {
    const createClient = () => ({ auth: { getClaims: async () => Promise.reject(new Error("caído")) } });
    const res = await refreshSession(new NextRequest("https://app.invalid/"), { readEnv, createClient: createClient as never });
    expect(res.status).toBe(200);
  });
});
