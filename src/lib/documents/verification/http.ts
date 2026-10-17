import "server-only";

import { VerificationInputError, MAX_VERIFY_PDF_BYTES, type createVerificationService } from "./service";

/**
 * Adaptador HTTP del verificador público (MVP-100; INV-15). `GET` informa el estado del registro; `POST`
 * recibe un multipart con un PDF (campo `file`), lo compara en memoria y no lo persiste ni lo registra.
 * Cabeceras privadas y `noindex`; los errores son opacos y estables. Una referencia inexistente recibe
 * la misma respuesta neutra que una no verificable (la decide el servicio): aquí no se distingue.
 * El límite de abuso lo aplica quien compone el handler, antes de leer el cuerpo.
 */

const HEADERS = { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
/** Margen del multipart (fronteras y cabeceras de parte) sobre el tamaño máximo del PDF. */
const MULTIPART_OVERHEAD = 16 * 1024;

type Service = ReturnType<typeof createVerificationService>;

function fail(status: number, code: string): Response {
  return Response.json({ error: { code, correlationId: crypto.randomUUID() } }, { status, headers: HEADERS });
}

/** Lee el cuerpo con tope duro; devuelve `null` si lo supera (no depende de `Content-Length`). */
async function readBounded(request: Request, max: number): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function createVerifyHandlers(deps: { service: Service }) {
  return {
    async get(_request: Request, reference: string): Promise<Response> {
      try {
        return Response.json(await deps.service.verify(reference), { headers: HEADERS });
      } catch {
        return fail(503, "TECHNICAL_FAILURE");
      }
    },

    async post(request: Request, reference: string): Promise<Response> {
      if (!/^multipart\/form-data\s*;/i.test(request.headers.get("Content-Type") ?? "")) return fail(415, "UNSUPPORTED_MEDIA_TYPE");
      const max = MAX_VERIFY_PDF_BYTES + MULTIPART_OVERHEAD;
      const declared = Number(request.headers.get("Content-Length") ?? 0);
      if (Number.isFinite(declared) && declared > max) return fail(413, "PAYLOAD_TOO_LARGE");
      try {
        const body = await readBounded(request, max);
        if (!body) return fail(413, "PAYLOAD_TOO_LARGE");
        let form: FormData;
        try {
          form = await new Response(body as BodyInit, { headers: { "Content-Type": request.headers.get("Content-Type")! } }).formData();
        } catch {
          return fail(400, "INVALID_INPUT");
        }
        const files = form.getAll("file");
        const file = files[0];
        if (files.length !== 1 || typeof file === "string") return fail(400, "INVALID_INPUT");
        if (file.size > MAX_VERIFY_PDF_BYTES) return fail(413, "PAYLOAD_TOO_LARGE");
        const result = await deps.service.verify(reference, new Uint8Array(await file.arrayBuffer()));
        return Response.json(result, { headers: HEADERS });
      } catch (error) {
        if (error instanceof VerificationInputError) {
          return error.code === "VERIFY_FILE_TOO_LARGE" ? fail(413, "PAYLOAD_TOO_LARGE") : fail(400, "INVALID_INPUT");
        }
        return fail(503, "TECHNICAL_FAILURE");
      }
    },
  };
}
