import "server-only";

import type { TechnicalError } from "@/lib/contracts/technical";

import type { createInvitationService } from "./service";

/**
 * Handlers HTTP de invitaciones (MVP-072/073/074): `Request → Response`. La
 * ruta de Next solo compone sesión y adaptadores y delega aquí. Las respuestas
 * públicas llevan `no-store`, `no-referrer` y `noindex`; el token del GET sale
 * de la ruta, el de la respuesta va en el cuerpo del POST, y ninguno aparece
 * en las respuestas de error.
 */

const STATUS: Record<string, number> = {
  NO_SESSION: 401,
  INVALID_INPUT: 400,
  NOT_AVAILABLE: 404,
  IDEMPOTENCY_CONFLICT: 409,
  ALREADY_RESPONDED: 409,
  SNAPSHOT_MISMATCH: 409,
  REISSUE_REQUIRED: 409,
  REVISION_NOT_ACTIVE: 409,
  ROLE_NOT_SELECTED: 422,
  INVITATION_EXPIRED: 410,
  REVISION_SUPERSEDED: 410,
};

const PUBLIC_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function errorResponse(error: TechnicalError): Response {
  return Response.json({ error }, { status: STATUS[error.code] ?? (error.retryable ? 503 : 500), headers: PUBLIC_HEADERS });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

type Service = ReturnType<typeof createInvitationService>;

/** Propietario: emite (o reemite) el enlace de un tercero. El token en claro vuelve una sola vez. */
export function createIssueInvitationHandler(getService: () => Promise<Service>) {
  return async (request: Request): Promise<Response> => {
    const result = await (await getService()).issue(await readBody(request));
    return result.ok ? Response.json(result.value, { status: 201, headers: PUBLIC_HEADERS }) : errorResponse(result.error);
  };
}

export function createRevokeInvitationHandler(getService: () => Promise<Service>) {
  return async (_request: Request, invitationId: string): Promise<Response> => {
    const result = await (await getService()).revoke(invitationId);
    return result.ok ? Response.json(result.value, { status: 200, headers: PUBLIC_HEADERS }) : errorResponse(result.error);
  };
}

/** Público: lectura sin consumo. Inexistente y no disponible responden igual. */
export function createReadInvitationHandler(getService: () => Promise<Service>) {
  return async (_request: Request, token: string): Promise<Response> => {
    const result = await (await getService()).read(token);
    if (!result.ok) return errorResponse(result.error);
    const read = result.value;
    if (read.kind === "available") return Response.json({ status: "available", invitation: read.invitation }, { status: 200, headers: PUBLIC_HEADERS });
    return Response.json({ status: "unavailable", availability: read.availability }, { status: read.availability === "no_disponible" ? 404 : 410, headers: PUBLIC_HEADERS });
  };
}

/** Público: la respuesta del tercero. */
export function createRespondInvitationHandler(getService: () => Promise<Service>) {
  return async (request: Request): Promise<Response> => {
    const result = await (await getService()).respond({ ...(await readBody(request)), actor: "tercero" });
    return result.ok ? Response.json(result.value, { status: result.replayed ? 200 : 201, headers: PUBLIC_HEADERS }) : errorResponse(result.error);
  };
}
