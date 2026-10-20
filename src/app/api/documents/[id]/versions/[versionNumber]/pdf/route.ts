import { createFinalPdfDownloadHandler } from "@/lib/documents/finalization/pdf-download";
import { pdfDownloadDeps } from "@/lib/documents/finalization/pdf-download-runtime";

export const runtime = "nodejs";
const download = createFinalPdfDownloadHandler(pdfDownloadDeps);

export async function GET(request: Request, ctx: { params: Promise<{ id: string; versionNumber: string }> }) {
  const { id, versionNumber } = await ctx.params;
  return download(request, id, versionNumber);
}

export async function HEAD(request: Request, ctx: { params: Promise<{ id: string; versionNumber: string }> }) {
  const { id, versionNumber } = await ctx.params;
  return download(request, id, versionNumber);
}
