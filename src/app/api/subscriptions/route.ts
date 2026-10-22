import { handleSubscriptionRequest } from "@/lib/conversion/http";
import { conversionHttpDeps } from "@/lib/conversion/runtime";

export const POST = (request: Request) => handleSubscriptionRequest(request, conversionHttpDeps);
