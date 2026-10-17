import { createDocumentHttpHandler } from "@/lib/documents/http";
import { documentHttpDeps } from "@/lib/documents/runtime";

const read = createDocumentHttpHandler(documentHttpDeps, "messages");
const write = createDocumentHttpHandler(documentHttpDeps, "append");
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return read(request, (await context.params).id);
}
export async function POST(request: Request, context: Context) {
  return write(request, (await context.params).id);
}
