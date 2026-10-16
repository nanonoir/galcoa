import { createDocumentHttpHandler } from "@/lib/documents/http";
import { documentHttpDeps } from "@/lib/documents/runtime";

const read = createDocumentHttpHandler(documentHttpDeps, "list");
const write = createDocumentHttpHandler(documentHttpDeps, "create");
export async function GET(request: Request) { return read(request); }
export async function POST(request: Request) { return write(request); }
