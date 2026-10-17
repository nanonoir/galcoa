import { createDocumentHttpHandler } from "@/lib/documents/http";
import { documentHttpDeps } from "@/lib/documents/runtime";

const read = createDocumentHttpHandler(documentHttpDeps, "get");
const rename = createDocumentHttpHandler(documentHttpDeps, "rename");
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return read(request, (await context.params).id);
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return rename(request, (await context.params).id);
}
