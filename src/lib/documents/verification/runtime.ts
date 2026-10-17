import "server-only";

import { createMirrorReader } from "@/lib/hedera/mirror";
import { createAnonClient } from "@/lib/supabase/anon";

import { createRateLimiter } from "../confirmations/rate-limit";
import { createSupabaseRateLimitStore } from "../confirmations/supabase";

import { createVerificationService } from "./service";
import { createSupabasePublicVerificationStore } from "./supabase";

/** Composición perezosa por petición: cliente anónimo, Mirror de Testnet y límite de abuso durable. Sin sesión ni service_role. */
export function createPublicVerification() {
  const rpc = createAnonClient();
  return {
    service: createVerificationService({ store: createSupabasePublicVerificationStore(rpc), mirror: createMirrorReader() }),
    limiter: createRateLimiter({ store: createSupabaseRateLimitStore(rpc) }),
  };
}
