import { createDraftHandler } from "@/lib/documents/preview-http";
import { draftHttpDeps } from "@/lib/documents/preview-runtime";

const preview = createDraftHandler(draftHttpDeps, "preview");
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return preview(request, (await context.params).id);
}
