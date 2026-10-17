import { createPublishedDownloadHandler } from "@/lib/documents/published-download";

export const runtime = "nodejs";
const read = createPublishedDownloadHandler();
export async function GET(_request: Request, context: { params: Promise<{ id: string; versionNumber: string }> }) {
  const { id, versionNumber } = await context.params;
  return read(id, versionNumber, false);
}
