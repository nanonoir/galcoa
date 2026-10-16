import { createReviewOwnerHandler } from "@/lib/documents/review-http";
import { reviewHttpDeps } from "@/lib/documents/review-runtime";

const issue = createReviewOwnerHandler(reviewHttpDeps, "issue");
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return issue(request, (await context.params).id);
}
