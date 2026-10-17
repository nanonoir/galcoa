import { createVerifyHandlers } from "@/lib/documents/verification/http";
import { createPublicVerification } from "@/lib/documents/verification/runtime";

const HEADERS = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const technical = () =>
  Response.json({ error: { code: "TECHNICAL_FAILURE", correlationId: crypto.randomUUID() } }, { status: 503, headers: HEADERS });

/** Estado público del registro, sin archivo. El límite de abuso corre antes que la lectura. */
export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const { reference } = await context.params;
  try {
    const { service, limiter } = createPublicVerification();
    return await limiter.limited("read", createVerifyHandlers({ service }).get)(request, reference);
  } catch {
    return technical();
  }
}

/** Comparación en memoria de un PDF (multipart, campo `file`). Límite de escritura: es la operación costosa. */
export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const { reference } = await context.params;
  try {
    const { service, limiter } = createPublicVerification();
    return await limiter.limited("write", createVerifyHandlers({ service }).post)(request, reference);
  } catch {
    return technical();
  }
}
