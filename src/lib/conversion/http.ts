import "server-only";

import { FunnelEventSchema, SubscriptionRequestResultSchema, SubscriptionRequestSchema } from "@/lib/contracts/conversion";
import { PRIVATE_RESPONSE_HEADERS, type SessionCheck } from "@/lib/supabase/auth";

/**
 * Adaptadores HTTP del embudo de conversión (conversion-funnel.md, D5 y D6).
 * Validan con Zod, llaman a las funciones SQL por un puerto inyectable y nunca
 * devuelven detalles internos. La medición responde 204 aunque se descarte el
 * evento: no condiciona la experiencia ni revela el tope de abuso.
 */

/** Cuerpo máximo admitido (los eventos válidos ocupan menos de 300 bytes). */
export const MAX_BODY_BYTES = 2048;

export type RpcResult = { data: unknown; error: unknown };
export type ConversionRpc = (fn: "record_funnel_event" | "request_subscription", args: Record<string, unknown>) => Promise<RpcResult>;

export interface ConversionHttpDeps {
  rpc: () => Promise<ConversionRpc>;
  session: () => Promise<SessionCheck>;
}

/** JSON explícito y nunca de otro sitio: un formulario ajeno no puede enviar `application/json` sin preflight. */
function isSameOriginJson(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  return (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");
}

/** Lee el cuerpo por trozos y corta al superar el tope, aunque no declare `content-length`. */
async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES || !request.body) return undefined;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return undefined;
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    return undefined;
  }
}

/** «Do Not Track» y Global Privacy Control también se respetan en el servidor. */
const optedOut = (request: Request) => request.headers.get("dnt") === "1" || request.headers.get("sec-gpc") === "1";

const json = (status: number, body: unknown) => Response.json(body, { status, headers: PRIVATE_RESPONSE_HEADERS });
const error = (status: number, code: string, retryable: boolean) => json(status, { error: { code, retryable } });

export async function handleFunnelEvent(request: Request, deps: ConversionHttpDeps): Promise<Response> {
  if (!isSameOriginJson(request)) return error(400, "INVALID_EVENT", false);
  if (optedOut(request)) return new Response(null, { status: 204, headers: PRIVATE_RESPONSE_HEADERS });
  const parsed = FunnelEventSchema.safeParse(await readJson(request));
  if (!parsed.success) return error(400, "INVALID_EVENT", false);
  try {
    const call = await deps.rpc();
    await call("record_funnel_event", {
      p_visitor_id: parsed.data.visitorId,
      p_event: parsed.data.event,
      p_step: parsed.data.step,
      p_source: parsed.data.source,
      p_plan: parsed.data.plan,
    });
  } catch {
    // Sin configuración o base caída: la medición se pierde, la experiencia sigue.
  }
  return new Response(null, { status: 204, headers: PRIVATE_RESPONSE_HEADERS });
}

export async function handleSubscriptionRequest(request: Request, deps: ConversionHttpDeps): Promise<Response> {
  let session: SessionCheck;
  try {
    session = await deps.session();
  } catch {
    session = { status: "unavailable" };
  }
  if (session.status === "anonymous") return error(401, "NO_SESSION", false);
  if (session.status === "unavailable") return error(503, "AUTH_UNAVAILABLE", true);

  if (!isSameOriginJson(request)) return error(400, "INVALID_REQUEST", false);
  const parsed = SubscriptionRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return error(400, "INVALID_REQUEST", false);
  try {
    const call = await deps.rpc();
    const { data, error: rpcError } = await call("request_subscription", { p_plan: parsed.data.plan, p_idempotency_key: parsed.data.idempotencyKey });
    if (rpcError) return error(503, "SUBSCRIPTION_UNAVAILABLE", true);
    const result = SubscriptionRequestResultSchema.safeParse(data);
    if (!result.success) return error(503, "SUBSCRIPTION_UNAVAILABLE", true);
    return json(result.data.status === "solicitada" ? 201 : 200, result.data);
  } catch {
    return error(503, "SUBSCRIPTION_UNAVAILABLE", true);
  }
}
