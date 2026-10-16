import "server-only";

import type { TechnicalError } from "@/lib/contracts/technical";

import type { createRevisionService } from "./service";

/**
 * Handlers HTTP de revisiones (MVP-070/071): `Request → Response` con JSON.
 * La ruta de Next solo compone sesión y adaptadores y delega aquí. El `id` del
 * documento sale de la ruta, nunca del cuerpo. Los errores usan el envelope
 * técnico con su estado HTTP.
 */

const STATUS: Record<string, number> = {
  NO_SESSION: 401,
  INVALID_INPUT: 400,
  NOT_AVAILABLE: 404,
  IDEMPOTENCY_CONFLICT: 409,
  STALE_DRAFT: 409,
  SNAPSHOT_MISMATCH: 409,
  REVISION_NOT_ACTIVE: 409,
  ALREADY_RESPONDED: 409,
};

const PRIVATE = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };

function errorResponse(error: TechnicalError): Response {
  return Response.json({ error }, { status: STATUS[error.code] ?? (error.retryable ? 503 : 500), headers: PRIVATE });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

type Service = ReturnType<typeof createRevisionService>;

export function createFreezeHandler(getService: () => Promise<Service>) {
  return async (request: Request, documentId: string): Promise<Response> => {
    const service = await getService();
    const result = await service.freeze({ ...(await readBody(request)), documentId });
    if (!result.ok) return errorResponse(result.error);
    return Response.json(
      { revision: result.value.revision, snapshot: result.value.snapshot, unchanged: result.value.unchanged },
      { status: result.replayed || result.value.unchanged ? 200 : 201, headers: PRIVATE },
    );
  };
}

export function createAuthorConfirmationHandler(getService: () => Promise<Service>) {
  return async (request: Request, documentId: string): Promise<Response> => {
    const service = await getService();
    const result = await service.confirmAsAuthor({ ...(await readBody(request)), actor: "autor", documentId });
    if (!result.ok) return errorResponse(result.error);
    return Response.json(result.value, { status: result.replayed ? 200 : 201, headers: PRIVATE });
  };
}
