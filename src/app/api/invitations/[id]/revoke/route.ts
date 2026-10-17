import { createReviewOwnerHandler } from "@/lib/documents/review-http";
import { reviewHttpDeps } from "@/lib/documents/review-runtime";

const revoke = createReviewOwnerHandler(reviewHttpDeps, "revoke");
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return revoke(request, (await context.params).id);
}
