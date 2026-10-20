import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ALC_BLOCK, ALC_RULE } from "@/lib/contracts/alc";
import { ALC_AUDIT_ACTIONS } from "@/lib/documents/audit";

/**
 * Pruebas ESTÁTICAS de la migración ALC (leen el archivo; no ejecutan SQL). No acreditan comportamiento en
 * Postgres ni RLS: eso exige la base local (Docker) y la revisión independiente de SQL que pide el plan.
 */
const dir = path.resolve(import.meta.dirname, "../../../supabase/migrations");
const file = "20261020000100_alc_evaluation_guards.sql";
const sql = readFileSync(path.join(dir, file), "utf8");
const lines = sql.split("\n").filter((l) => !l.trim().startsWith("--"));
const code = lines.join("\n");

function block(name: string): string {
  const start = code.indexOf(name);
  expect(start, name).toBeGreaterThan(-1);
  const end = code.indexOf("\n$$;", start);
  return code.slice(start, end);
}

describe("migración ALC (estática)", () => {
  it("es la más reciente y aditiva (no hay otra posterior)", () => {
    const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    expect(all.at(-1)).toBe(file);
  });

  it("no borra datos ni tablas existentes", () => {
    expect(code).not.toMatch(/drop\s+table|truncate|delete\s+from/i);
  });

  it("retira la firma antigua de freeze_revision y crea la v2 sin control_status del llamador", () => {
    expect(code).toContain("drop function public.freeze_revision(uuid, integer, text, text, jsonb, text, text, text);");
    const v2 = block("create function public.freeze_revision(");
    expect(v2).toContain("p_evaluation_id uuid");
    expect(v2).not.toContain("p_control_status");
    expect(v2).toContain("content->'alc' is distinct from ev.shared");
  });

  it("toda función SECURITY DEFINER fija search_path vacío", () => {
    const defs = code.split(/create (?:or replace )?function /).slice(1).filter((d) => /security definer/i.test(d.split("$$")[0]));
    expect(defs.length).toBeGreaterThan(8);
    for (const d of defs) expect(d.split("$$")[0], d.slice(0, 60)).toMatch(/set search_path = ''/);
  });

  it("las RPC nuevas no se exponen a roles de la API", () => {
    // Solo `freeze_revision` v2 se concede a `authenticated` (el propietario congela con su sesión).
    const grants = [...code.matchAll(/grant execute on function ([^;]*?) to ([a-z_]+);/g)].map((m) => ({ fn: m[1], role: m[2] }));
    for (const g of grants.filter((x) => /save_alc_evaluation|get_alc_evaluation|check_seal_eligibility/.test(x.fn))) {
      expect(g.role).toBe("galcoa_executor");
    }
    expect(grants.filter((g) => g.role === "authenticated").map((g) => g.fn)).toEqual([
      "public.freeze_revision(uuid, integer, text, uuid, jsonb, text, text, text)",
    ]);
    expect(code).toMatch(/grant execute on function public\.save_alc_evaluation[^;]*to galcoa_executor;/);
    expect(code).toMatch(/grant execute on function public\.check_seal_eligibility\(uuid, uuid, text\) to galcoa_executor;/);
    expect(code).toMatch(/revoke all on public\.alc_evaluations from public, anon, authenticated, service_role/);
  });

  it("alc_evaluations es append-only con RLS", () => {
    expect(code).toContain("private.make_append_only('public.alc_evaluations')");
    expect(code).toContain("alter table public.alc_evaluations enable row level security");
  });

  it("instala las guardas en claim, reanudación, publicación e intento de sello", () => {
    expect(code).toContain("create trigger trg_versions_alc_guard before insert on public.document_versions");
    expect(code).toContain("create trigger trg_attempts_alc_guard before insert on public.hedera_attempts");
    expect(code).toContain("create trigger trg_responses_order before insert on public.corroboration_responses");
    expect(code).toContain("create trigger trg_revisions_require_alc before insert on public.document_revisions");
    const claim = block("create or replace function public.claim_finalization(");
    expect(claim.indexOf("alc_sealability(rev.id, false)")).toBeLessThan(claim.indexOf("'resumed'"));
    expect(claim).toContain("alc_sealability(rev.id, true)");
    expect(block("create or replace function public.record_seal_intent(")).toContain("alc_sealability(v.revision_id, false)");
  });

  it("conserva el orden de respuesta autor → transportista → comprador", () => {
    expect(block("create function private.responses_order_guard()")).toContain("private.role_rank(s.role) < private.role_rank(new.role)");
    expect(code).toContain("'confirmation_order'");
  });

  it("los códigos y reglas coinciden con los de TypeScript", () => {
    for (const c of [ALC_BLOCK.EVALUATION_REQUIRED, ALC_BLOCK.STALE_EVALUATION, ALC_BLOCK.SELECTION_INVALID, ALC_BLOCK.RED]) {
      expect(code, c).toContain(`'${c}'`);
    }
    for (const r of [ALC_RULE.CONTRADICTION, ALC_RULE.UNREADABLE, ALC_RULE.AMBIGUITY, ALC_RULE.PARTICIPANTS, ALC_RULE.DECLARED, ALC_RULE.MATCHING]) {
      expect(code, r).toContain(`'${r}'`);
    }
    for (const a of Object.values(ALC_AUDIT_ACTIONS)) expect(code, a).toContain(`'${a}'`);
  });
});
