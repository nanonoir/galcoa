import { createReadInvitationHandler } from "@/lib/documents/invitations/http";
import { createPublicReview } from "@/lib/documents/review-runtime";

/** Lectura pública: no consume el token. El límite de abuso corre antes que la lectura. */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    const review = createPublicReview();
    return await review.limiter.limited("read", createReadInvitationHandler(async () => review.invitations))(request, token);
  } catch {
    return Response.json(
      { error: { code: "TECHNICAL_FAILURE", stage: "persistencia", retryable: true, correlationId: crypto.randomUUID() } },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } },
    );
  }
}
