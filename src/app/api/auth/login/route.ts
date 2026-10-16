import { handleLogin } from "@/lib/supabase/auth-http";

export const POST = (request: Request) => handleLogin(request);
