import { createEvidenceHttpHandler } from "@/lib/documents/evidence/http";
import { evidenceHttpDeps } from "@/lib/documents/evidence/runtime";
export const runtime = "nodejs";
export async function GET(request: Request, ctx: { params: Promise<{ id: string; evidenceId: string }> }) {
  const { id, evidenceId } = await ctx.params;
  return createEvidenceHttpHandler(evidenceHttpDeps, "read")(request, id, evidenceId);
}
