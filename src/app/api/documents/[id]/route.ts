import { createDocumentHttpHandler } from "@/lib/documents/http";
import { documentHttpDeps } from "@/lib/documents/runtime";

const handle = createDocumentHttpHandler(documentHttpDeps, "get");
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(request, (await context.params).id);
}
