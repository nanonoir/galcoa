import { createRespondInvitationHandler } from "@/lib/documents/invitations/http";
import { createPublicReview } from "@/lib/documents/review-runtime";

const HEADERS = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

/** Respuesta pública del tercero: el token viaja en el cuerpo, nunca en la URL. */
export async function POST(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) {
    return Response.json({ error: { code: "INVALID_INPUT", stage: "validacion", retryable: false, correlationId: crypto.randomUUID() } }, { status: 400, headers: HEADERS });
  }
  if (Number(request.headers.get("Content-Length") ?? 0) > 65536) {
    return Response.json({ error: { code: "PAYLOAD_TOO_LARGE", stage: "validacion", retryable: false, correlationId: crypto.randomUUID() } }, { status: 413, headers: HEADERS });
  }
  try {
    const review = createPublicReview();
    return await review.limiter.limited("write", createRespondInvitationHandler(async () => review.invitations))(request);
  } catch {
    return Response.json({ error: { code: "TECHNICAL_FAILURE", stage: "persistencia", retryable: true, correlationId: crypto.randomUUID() } }, { status: 503, headers: HEADERS });
  }
}
