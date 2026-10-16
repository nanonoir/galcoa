import { createReviewOwnerHandler } from "@/lib/documents/review-http";
import { reviewHttpDeps } from "@/lib/documents/review-runtime";

const confirm = createReviewOwnerHandler(reviewHttpDeps, "confirm");
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return confirm(request, (await context.params).id);
}
