import { handleNewPassword } from "@/lib/supabase/auth-http";

export const POST = (request: Request) => handleNewPassword(request);
