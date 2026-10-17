import "server-only";

/**
 * Registro técnico del turno de chat (MVP-052; SH-01, SH-05). Un turno por
 * mensaje de usuario (`clientMessageId`), con intentos numerados y claim con
 * vencimiento. La persistencia es `DurableChatStore` (`./persistence`).
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
