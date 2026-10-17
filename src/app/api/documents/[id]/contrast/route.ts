import { createChatHttpHandler } from "@/lib/documents/chat-http";
import { chatHttpDeps } from "@/lib/documents/chat-runtime";

export const runtime = "nodejs";
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return createChatHttpHandler(chatHttpDeps, "contrast")(request, (await ctx.params).id);
}
