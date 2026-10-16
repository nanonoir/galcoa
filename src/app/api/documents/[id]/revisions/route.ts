import { createReviewOwnerHandler } from "@/lib/documents/review-http";
import { reviewHttpDeps } from "@/lib/documents/review-runtime";

const freeze = createReviewOwnerHandler(reviewHttpDeps, "freeze");
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return freeze(request, (await context.params).id);
}
