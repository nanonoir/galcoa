import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { SupabaseConfigError, type EnvReader } from "./config";
import { createSessionClient, type SessionClientDeps } from "./session";

/**
 * Refresco de la sesión por petición, para el `proxy` de Next 16 (MVP-030).
 * Solo renueva cookies: no autoriza ni redirige (eso lo hacen las guardas y
 * cada servicio). Sin configuración de Supabase deja pasar la petición sin
 * tocarla, para que páginas públicas y `build` no dependan de credenciales.
 */
export async function refreshSession(
  request: NextRequest,
  deps: SessionClientDeps & { readEnv?: EnvReader } = {},
): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  let client;
  try {
    client = createSessionClient(
      {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies, headers) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
      deps,
    );
  } catch (error) {
    if (error instanceof SupabaseConfigError) return response;
    throw error;
  }
  try {
    // Verifica el JWT y lo renueva si hace falta; el resultado no se usa para autorizar.
    await client.auth.getClaims();
  } catch {
    // Un fallo del proveedor no corta la navegación: la guarda de la ruta responde.
  }
  return response;
}
