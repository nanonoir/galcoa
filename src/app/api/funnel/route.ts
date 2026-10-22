import { handleFunnelEvent } from "@/lib/conversion/http";
import { conversionHttpDeps } from "@/lib/conversion/runtime";

export const POST = (request: Request) => handleFunnelEvent(request, conversionHttpDeps);
