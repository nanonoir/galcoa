import { createDraftHandler } from "@/lib/documents/preview-http";
import { draftHttpDeps } from "@/lib/documents/preview-runtime";

const summary = createDraftHandler(draftHttpDeps, "summary");
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return summary(request, (await context.params).id);
}
