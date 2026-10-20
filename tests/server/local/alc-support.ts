import { createHash, randomUUID } from "node:crypto";

import { ALC_OUTCOME, ALC_READING, ALC_RULES_VERSION, ALC_SOURCE_KIND, type AlcSource } from "@/lib/contracts/alc";
import { buildShared, type AlcEvaluateInput, type AlcEvaluation } from "@/lib/documents/alc/service";
import { canonicalHash } from "@/lib/documents/manifest/jcs";
import { failure } from "@/lib/documents/result";
import { evaluateAlc } from "@/lib/rules/alc";

import { createInvitationService } from "@/lib/documents/invitations/service";
import { createSupabaseInvitationStore } from "@/lib/documents/invitations/supabase";

import { anonClient, psql, type LocalStack, type TestUser } from "../rls/harness";

/**
 * Evaluación ALC para las pruebas contra Postgres local (requieren Docker; no se ejecutan sin el stack).
 * El inventario sale de `private.alc_inventory` y la evaluación se persiste con `save_alc_evaluation` como
 * `galcoa_executor`: las mismas rutas de producción, con hechos ficticios deterministas en lugar de la IA.
 */

/**
 * La selección nueva siempre incluye al comprador: tras confirmar el autor, el comprador responde por su invitación
 * (cliente anónimo, como en producción) para dejar la revisión completa.
 */
export async function buyerConfirms(
  owner: TestUser,
  stack: LocalStack,
  revision: { revisionId: string; snapshotId: string; snapshotHash: string },
  decision: "confirmar" | "rechazar" = "confirmar",
) {
  const issued = await createInvitationService({
    session: { currentUserId: async () => owner.id },
    invitations: createSupabaseInvitationStore({ verifiedUserId: owner.id, rpc: owner.client }),
  }).issue({ revisionId: revision.revisionId, role: "comprador", idempotencyKey: `issue-${randomUUID()}` });
  if (!issued.ok) throw new Error(`issue: ${issued.error.code}`);
  const pub = createInvitationService({
    session: { currentUserId: async () => null },
    invitations: createSupabaseInvitationStore({ verifiedUserId: null, rpc: anonClient(stack) }),
  });
  const base = {
    schemaVersion: 1 as const, actor: "tercero" as const, token: issued.value.token,
    revisionId: revision.revisionId, snapshotId: revision.snapshotId, snapshotHash: revision.snapshotHash,
    idempotencyKey: `respond-${randomUUID()}`, declaredName: "Juan Pérez",
  };
  const r = await pub.respond(decision === "confirmar"
    ? { ...base, decision, checkboxChecked: true }
    : { ...base, decision, checkboxChecked: false, rejectionRatified: true });
  if (!r.ok) throw new Error(`respond: ${r.error.code}`);
  return r.value;
}

export type LocalAlcColor = "verde" | "amarillo" | "rojo";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const q = (v: unknown) => `$q$${JSON.stringify(v)}$q$`;
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

export function localAlc(userId: string, color: LocalAlcColor = "verde") {
  return {
    async evaluate(input: AlcEvaluateInput): Promise<{ ok: true; value: AlcEvaluation } | { ok: false; error: ReturnType<typeof failure>["error"] }> {
      const correlationId = input.correlationId ?? "corr-alc-local";
      const inv = await psql(`select private.alc_inventory(${lit(input.documentId)});`, "supabase_admin");
      if (!inv.ok) return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      const inventory = JSON.parse(inv.rows[0].join("|")) as { messages: string[]; evidences: string[]; extractions: string[] };

      const sources: AlcSource[] = [];
      const backing: Record<string, { kind: "mensaje" | "evidencia"; id: string }> = {};
      const message = inventory.messages[0];
      const evidence = inventory.evidences[0];
      // Verde = el original coincide con el mensaje; amarillo = solo dato declarado (sin original); rojo = contradicción.
      const useEvidence = Boolean(evidence) && color !== "amarillo";
      if (message) {
        // Sin original que contradiga, el rojo se obtiene con un mensaje que difiere del valor de la afirmación.
        const text = color === "rojo" && !useEvidence ? "Se entregan 10 cajas" : "Se entregan 12 cajas";
        sources.push({ id: `m_${message}`, originalId: `m_${message}`, kind: ALC_SOURCE_KIND.MESSAGE, hash: sha(message), reading: ALC_READING.READABLE, text });
        backing[`m_${message}`] = { kind: "mensaje", id: message };
      }
      if (evidence && useEvidence) {
        sources.push({ id: `e_${evidence}`, originalId: `e_${evidence}`, kind: ALC_SOURCE_KIND.EVIDENCE, hash: sha(evidence), reading: ALC_READING.READABLE, text: color === "rojo" ? "Se entregan 10 cajas" : "Se entregan 12 cajas" });
        backing[`e_${evidence}`] = { kind: "evidencia", id: evidence };
      }
      // La cantidad lleva unidad: sin ella la regla la trata como ambigua (rojo) aunque todo coincida.
      const assertions = sources.map((s) => {
        const value = s.text.includes("10") ? "10" : "12";
        const quote = `${value} cajas`;
        const start = s.text.indexOf(quote);
        return { citation: { sourceId: s.id, start, end: start + quote.length, quote }, value, unit: "cajas" };
      });
      const evaluationInput = {
        documentId: input.documentId,
        draftRevision: input.draft.revision,
        selection: [...input.selection],
        inventoryComplete: true,
        contentCoverageComplete: true,
        sources,
        claims: [{ id: "c_local", subject: "cajas", field: "cantidad", value: "12", unit: "cajas", numeric: true, ambiguous: false, assertions }],
      };
      const result = evaluateAlc(evaluationInput);
      if (result.status !== ALC_OUTCOME.EVALUATED) return failure(result.code, "congelado", false, correlationId);
      const inputHash = canonicalHash(evaluationInput).hash;
      const { shared, aliasOf } = buildShared(result, evaluationInput.claims, inputHash, []);
      const sourceAliases = [...aliasOf].map(([id, alias]) => ({ alias, ...backing[id] }));
      const sql = `set role galcoa_executor;\nselect public.save_alc_evaluation(${lit(userId)}, ${lit(input.documentId)}, ${input.draft.revision}, `
        + `array[${input.selection.map(lit).join(",")}]::text[], ${lit(ALC_RULES_VERSION)}, ${q(evaluationInput)}::jsonb, ${lit(inputHash)}, ${lit(result.color)}, `
        + `${q(result)}::jsonb, ${q(shared)}::jsonb, '[]'::jsonb, ${q(sourceAliases)}::jsonb, ${q(inventory)}::jsonb, ${lit(correlationId)});`;
      const saved = await psql(sql, "supabase_admin");
      if (!saved.ok) return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      const body = JSON.parse(saved.rows[0].join("|")) as { status: string; evaluationId?: string };
      if (body.status !== "saved" || !body.evaluationId) return failure("TECHNICAL_FAILURE", "persistencia", false, correlationId);
      return { ok: true, value: { evaluationId: body.evaluationId, color: result.color, shared, rectifications: [], selection: [...input.selection], sourceAliases } };
    },
  };
}
