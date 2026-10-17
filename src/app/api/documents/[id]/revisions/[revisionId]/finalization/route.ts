import { createClaimFinalizationHandler, createFinalizationStatusHandler } from "@/lib/documents/finalization/http";
import { finalizationHttpDeps } from "@/lib/documents/finalization/runtime";

export const runtime = "nodejs";
const claim = createClaimFinalizationHandler(finalizationHttpDeps);
const status = createFinalizationStatusHandler(finalizationHttpDeps);
type Context = { params: Promise<{ id: string; revisionId: string }> };
export async function POST(request: Request, context: Context) {
  const { id, revisionId } = await context.params;
  return claim(request, id, revisionId);
}
export async function GET(request: Request, context: Context) {
  const { id, revisionId } = await context.params;
  return status(request, id, revisionId);
}
