import { describe, expect, it, vi } from "vitest";

import { createClaimFinalizationHandler, type FinalizationHttpDeps } from "@/lib/documents/finalization/http";
import type { ClaimResult } from "@/lib/documents/finalization/supabase";

const USER = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const REV = "33333333-3333-4333-8333-333333333333";

function handler(claim: ClaimResult, advance = vi.fn(), sealerFor = vi.fn()) {
  const deps: FinalizationHttpDeps = {
    trustedOrigins: () => ["http://localhost:3000"],
    getContext: async () => ({ session: { status: "authenticated", user: { id: USER, email: null } }, rpc: { rpc: async () => ({ data: null, error: null }) } }),
    storeFor: () => ({ claim: async () => claim }),
    advancerFor: () => ({ advance }),
    sealerFor,
  };
  const request = new Request("http://localhost:3000/x", { method: "POST", headers: { Origin: "http://localhost:3000" } });
  return { run: () => createClaimFinalizationHandler(deps)(request, DOC, REV), advance, sealerFor };
}

describe("guarda ALC en el reclamo de finalización", () => {
  it.each(["red", "evaluation_required", "stale_evaluation", "selection_invalid"] as const)("bloquea con %s sin avanzar ni sellar", async (code) => {
    const t = handler({ status: "blocked", code });
    const res = await t.run();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: { code: "ALC_BLOCKED", retryable: false }, reason: code });
    expect(t.advance).not.toHaveBeenCalled();
    expect(t.sealerFor).not.toHaveBeenCalled();
  });
});
