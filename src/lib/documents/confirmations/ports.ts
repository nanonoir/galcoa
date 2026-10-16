import "server-only";

import type { ParticipantRole, ParticipantSelection } from "@/lib/contracts/review";

import type { AggregateResponse } from "./aggregate";

/**
 * Puertos de MVP-075: lectura del estado de una revisión para el autor y
 * contador de abuso de los endpoints públicos. El adaptador (proyección
 * transaccional y contador durable en Postgres, sin Redis ni colas) depende
 * de MVP-025 y de la migración aditiva de F4; no hay fallback productivo.
 */

export type RevisionState = {
  revisionId: string;
  snapshotId: string;
  documentId: string;
  selection: ParticipantSelection;
  superseded: boolean;
  responses: (AggregateResponse & { role: ParticipantRole; respondedAt: string })[];
};

export type AggregateStore = {
  /** `null` si la revisión no es del propietario o no existe (indistinguibles). */
  getRevisionState(ownerId: string, revisionId: string): Promise<RevisionState | null>;
};

export type RateLimitKind = "read" | "write";

export type RateLimitStore = {
  /**
   * Suma uno al contador de la ventana fija y devuelve el total, de forma
   * atómica. Solo guarda hashes de origen y ventanas recientes: ni token ni IP
   * en claro.
   */
  hit(input: { kind: RateLimitKind; originHash: string; windowStart: number }): Promise<{ count: number }>;
};
