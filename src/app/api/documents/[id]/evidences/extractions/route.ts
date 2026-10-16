import { createEvidenceHttpHandler } from "@/lib/documents/evidence/http";
import { evidenceHttpDeps } from "@/lib/documents/evidence/runtime";
export const runtime = "nodejs";
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return createEvidenceHttpHandler(evidenceHttpDeps, "extractions")(request, (await ctx.params).id);
}
