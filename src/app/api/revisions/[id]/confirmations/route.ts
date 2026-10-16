import { createReviewOwnerHandler } from "@/lib/documents/review-http";
import { reviewHttpDeps } from "@/lib/documents/review-runtime";

const aggregate = createReviewOwnerHandler(reviewHttpDeps, "aggregate");
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return aggregate(request, (await context.params).id);
}
