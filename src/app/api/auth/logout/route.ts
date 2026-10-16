import { handleLogout } from "@/lib/supabase/auth-http";

export const POST = (request: Request) => handleLogout(request);
