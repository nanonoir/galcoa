import "server-only";

import type { Message } from "@/lib/contracts/core";

import type { AuditContext } from "../ports";

/**
 * Persistencia de la operación técnica del turno de chat (MVP-052; SH-01,
 * SH-05). Un turno por mensaje de usuario (`clientMessageId`), con intentos
 * numerados y claim con vencimiento: como mucho un intento activo y una
 * respuesta completada. El adaptador (RPC atómicas sobre la operación de
 * turno de MVP-022/023) depende de MVP-025 y de la migración aditiva de F4.
 */

export type TurnState = "en_curso" | "completado" | "fallido" | "cancelado";

export type TurnRecord = {
  turnId: string;
  documentId: string;
  clientMessageId: string;
  /** Intento vigente (1, 2…). */
  attempt: number;
  state: TurnState;
  userMessageId: string | null;
  agentMessageId: string | null;
  /** Vencimiento del claim del intento en curso (tiempo del servidor de base). */
  leaseExpiresAt: string | null;
};

/** Intento reclamado: fencing explícito en cada operación posterior (sin identidad global). */
export type TurnClaimRef = { turnId: string; attempt: number };

export type ClaimTurnResult =
  /** Turno nuevo o nuevo intento tras fallo, cancelación o claim vencido. */
  | { status: "claimed"; turn: TurnRecord; retried: boolean }
  /** Hay un intento vigente: no se duplica. */
  | { status: "in_progress"; turn: TurnRecord }
  /** Ya tiene su respuesta: se devuelve la existente. */
  | { status: "completed"; turn: TurnRecord; agentMessage: Message }
  | { status: "idempotency_conflict" }
  | { status: "not_available" };

export type TurnStore = {
  claimTurn(input: {
    ownerId: string;
    documentId: string;
    clientMessageId: string;
    fingerprint: string;
    leaseSeconds: number;
    audit: AuditContext;
  }): Promise<ClaimTurnResult>;
  /** Vincula el mensaje original del usuario (persistido antes de la IA). */
  attachUserMessage(input: { ownerId: string; turnId: string; userMessageId: string }): Promise<void>;
  /**
   * Agrega la respuesta oficial del agente y cierra el turno en la misma
   * transacción, solo si `attempt` sigue siendo el vigente y en curso.
   */
  completeTurn(input: {
    ownerId: string;
    turnId: string;
    attempt: number;
    agentContent: string;
    /** Referencias a artefactos (borrador y propuesta), nunca su contenido. */
    artifacts: { draftId: string; draftRevision: number; proposalId: string };
    audit: AuditContext;
  }): Promise<{ status: "completed"; agentMessage: Message } | { status: "stale" }>;
  /** Cierra el intento como fallido o cancelado; sin efecto si ya no es el vigente. */
  closeAttempt(input: {
    ownerId: string;
    turnId: string;
    attempt: number;
    state: "fallido" | "cancelado";
    errorCode: string;
    audit: AuditContext;
  }): Promise<void>;
};
