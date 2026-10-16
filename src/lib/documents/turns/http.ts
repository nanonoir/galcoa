import "server-only";

import type { TechnicalError } from "@/lib/contracts/technical";

import type { createTurnService, TurnEvent } from "./service";

/**
 * Handler HTTP del turno (MVP-052): `Request → Response` con el flujo en NDJSON
 * (un evento JSON por línea, en orden). Los errores previos al flujo usan el
 * envelope técnico con su estado HTTP. Cancelar la petición propaga el abort al
 * Agente 1. La ruta de Next solo compone sesión y adaptadores y llama aquí.
 */

const STATUS: Record<string, number> = {
  NO_SESSION: 401,
  INVALID_INPUT: 400,
  NOT_AVAILABLE: 404,
  IDEMPOTENCY_CONFLICT: 409,
  TURN_IN_PROGRESS: 409,
};

const PRIVATE = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };

export function errorResponse(error: TechnicalError): Response {
  return Response.json({ error }, { status: STATUS[error.code] ?? (error.retryable ? 503 : 500), headers: PRIVATE });
}

export function createChatTurnHandler(getService: () => Promise<ReturnType<typeof createTurnService>>) {
  return async (request: Request, documentId: string): Promise<Response> => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const command = body && typeof body === "object" ? { ...(body as Record<string, unknown>), documentId } : null;
    const service = await getService();
    const started = await service.startTurn(command, request.signal);
    if (!started.ok) return errorResponse(started.error);

    const encoder = new TextEncoder();
    const events = started.value.events;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const next = await events.next();
        if (next.done) return controller.close();
        controller.enqueue(encoder.encode(`${JSON.stringify(next.value satisfies TurnEvent)}\n`));
      },
      async cancel() {
        await events.return(undefined);
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { ...PRIVATE, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Turn-Id": started.value.turn.turnId },
    });
  };
}
