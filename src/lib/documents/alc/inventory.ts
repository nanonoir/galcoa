import "server-only";

import { createHash } from "node:crypto";

import { ALC_READING, ALC_SOURCE_KIND, type AlcSource } from "@/lib/contracts/alc";

/**
 * Inventario de fuentes del ALC (F-1). Lo arma el servidor con **todo** lo que el documento tiene: mensajes del autor,
 * originales aceptados y extracciones. Un original aceptado sin extracción figura igual (lectura `pendiente`): no se
 * omite en silencio. La base recalcula este mismo inventario (`private.alc_inventory`) y lo compara.
 */

export type InventoryInput = {
  messages: readonly { id: string; content: string }[];
  /** Solo originales aceptados. */
  evidences: readonly { evidenceId: string; sha256: string }[];
  extractions: readonly { extractionId: string; evidenceId: string; text: string; extractedAt: string }[];
};

export type SourceBacking = { kind: "mensaje" | "evidencia"; id: string };

export type AlcInventory = {
  /** Objeto idéntico al de `private.alc_inventory` (ids ordenados). */
  inventory: { messages: string[]; evidences: string[]; extractions: string[] };
  sources: AlcSource[];
  /** Fuente persistida real de cada id de fuente del ALC (para `snapshot_sources`). */
  backing: Record<string, SourceBacking>;
};

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const ascending = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const messageSourceId = (id: string) => `m_${id}`;
export const extractionSourceId = (id: string) => `x_${id}`;
export const evidenceSourceId = (id: string) => `e_${id}`;

export function buildInventory(input: InventoryInput): AlcInventory {
  const sources: AlcSource[] = [];
  const backing: Record<string, SourceBacking> = {};
  const evidenceHash = new Map(input.evidences.map((e) => [e.evidenceId, e.sha256]));

  for (const message of input.messages) {
    const id = messageSourceId(message.id);
    sources.push({ id, originalId: id, kind: ALC_SOURCE_KIND.MESSAGE, hash: sha256(message.content), reading: ALC_READING.READABLE, text: message.content });
    backing[id] = { kind: "mensaje", id: message.id };
  }

  // Una extracción por original: la más reciente. Las anteriores siguen en el inventario de ids.
  const latest = new Map<string, InventoryInput["extractions"][number]>();
  for (const extraction of input.extractions) {
    const current = latest.get(extraction.evidenceId);
    if (!current || extraction.extractedAt > current.extractedAt) latest.set(extraction.evidenceId, extraction);
  }
  for (const extraction of latest.values()) {
    const hash = evidenceHash.get(extraction.evidenceId);
    if (!hash) throw new Error("Extracción sin original aceptado");
    const id = extractionSourceId(extraction.extractionId);
    sources.push({
      id,
      originalId: evidenceSourceId(extraction.evidenceId),
      kind: ALC_SOURCE_KIND.EVIDENCE,
      hash,
      reading: extraction.text.trim() ? ALC_READING.READABLE : ALC_READING.UNREADABLE,
      text: extraction.text,
    });
    backing[id] = { kind: "evidencia", id: extraction.evidenceId };
  }
  for (const evidence of input.evidences) {
    if (latest.has(evidence.evidenceId)) continue;
    const id = evidenceSourceId(evidence.evidenceId);
    sources.push({ id, originalId: id, kind: ALC_SOURCE_KIND.EVIDENCE, hash: evidence.sha256, reading: ALC_READING.PENDING, text: "" });
    backing[id] = { kind: "evidencia", id: evidence.evidenceId };
  }

  return {
    inventory: {
      messages: input.messages.map((m) => m.id).sort(ascending),
      evidences: input.evidences.map((e) => e.evidenceId).sort(ascending),
      extractions: input.extractions.map((x) => x.extractionId).sort(ascending),
    },
    sources: sources.sort((a, b) => ascending(a.id, b.id)),
    backing,
  };
}
