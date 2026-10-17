import { handleCallback } from "@/lib/supabase/auth-http";

export const GET = (request: Request) => handleCallback(request);
