import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Comprobaciones estáticas de la migración del embudo (no demuestran la base: eso lo hace
 * `npm run test:rls` contra Supabase local). Fijan las decisiones de privacidad y abuso.
 */
const sql = readFileSync(path.resolve(import.meta.dirname, "../../../supabase/migrations/20261022000100_conversion_funnel.sql"), "utf8");
const code = sql.replace(/^--.*$/gm, "");
const funnelTable = /create table public\.funnel_events \(([\s\S]*?)\n\);/.exec(code)?.[1] ?? "";
const recordFunction = /create function public\.record_funnel_event[\s\S]*?\n\$\$;/.exec(code)?.[0] ?? "";

describe("migración del embudo de conversión (estática)", () => {
  it("el embudo no guarda la cuenta: sin user_id ni auth.uid() en el registro de eventos", () => {
    expect(funnelTable).not.toHaveLength(0);
    expect(funnelTable).not.toContain("user_id");
    expect(recordFunction).not.toContain("conversion_actor");
    expect(recordFunction).not.toContain("auth.uid");
  });

  it("el registro anónimo tiene tope por visitante y tope global", () => {
    expect(recordFunction).toContain("visitor_id = p_visitor_id");
    expect(recordFunction).toMatch(/recent >= 60/);
    expect(recordFunction).toMatch(/recent >= 300/);
  });

  it("los topes se serializan con un lock de asesor fail-fast antes de contar e insertar", () => {
    const lock = recordFunction.indexOf("pg_try_advisory_xact_lock(7001, 1)");
    expect(lock).toBeGreaterThan(-1);
    expect(recordFunction).toMatch(/if not pg_try_advisory_xact_lock\(7001, 1\) then return; end if;/);
    expect(lock).toBeLessThan(recordFunction.indexOf("select count(*)"));
    expect(lock).toBeLessThan(recordFunction.indexOf("insert into public.funnel_events"));
  });

  it("el embudo se describe como seudónimo, no anónimo", () => {
    expect(sql).not.toMatch(/Sin datos personales|no hay datos que unan/);
    expect(sql).toMatch(/seudónimo, no anonimato absoluto|seudónimo, no anónimo/);
  });

  it("la retención borra por lotes sin bloquear llamadas concurrentes (for update skip locked)", () => {
    expect(recordFunction).toMatch(/delete from public\.funnel_events where id in \(\s*select id from public\.funnel_events where occurred_at < clock_timestamp\(\) - interval '90 days' order by occurred_at limit 20 for update skip locked\)/);
  });

  it("las tablas no son accesibles a roles de API y tienen RLS", () => {
    for (const table of ["funnel_events", "subscription_requests"]) {
      expect(code).toContain(`alter table public.${table} enable row level security`);
      expect(code).toMatch(new RegExp(`revoke all on public\\.${table} from public, anon, authenticated, service_role`));
    }
  });

  it("anon solo ejecuta record_funnel_event; request_subscription es solo de sesión", () => {
    expect(code).toMatch(/grant execute on function public\.record_funnel_event\([^)]*\) to anon, authenticated/);
    expect(code).toMatch(/grant execute on function public\.request_subscription\([^)]*\) to authenticated;/);
    expect(code).not.toMatch(/request_subscription\([^)]*\) to [^;]*anon/);
  });

  it("la repetición de la clave de idempotencia devuelve el plan guardado", () => {
    expect(code).toMatch(/select plan into stored from public\.subscription_requests where user_id = actor and idempotency_key = p_idempotency_key/);
  });
});
