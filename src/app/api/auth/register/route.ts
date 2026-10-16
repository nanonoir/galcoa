import { handleRegister } from "@/lib/supabase/auth-http";

export const POST = (request: Request) => handleRegister(request);
