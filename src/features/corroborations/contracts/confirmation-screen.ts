import type { ConfirmationResult } from "@/lib/contracts/confirmation";
import type { PublicInvitation } from "@/lib/contracts/public";

/**
 * Contrato de presentación de la pantalla pública de confirmación (MVP-076).
 * La presentación solo recibe estado y callbacks: la red, las claves de
 * idempotencia y la autoridad son del container y del servidor.
 */

export type UnavailableReason = "ya_respondida" | "caducada" | "sustituida" | "no_disponible";

export type ConfirmationViewState =
  /** Invitación vigente: la persona puede leer y responder. */
  | { status: "ready"; invitation: PublicInvitation }
  /** Respuesta enviada y todavía sin resultado persistido. */
  | { status: "submitting"; invitation: PublicInvitation }
  /** El envío falló (red, límite o servicio): se puede reintentar con la misma clave. */
  | { status: "submit_error"; invitation: PublicInvitation; message: string }
  /** Resultado persistido por el servidor. */
  | { status: "done"; result: ConfirmationResult }
  /** El enlace ya no admite respuesta. */
  | { status: "unavailable"; reason: UnavailableReason }
  /** Error técnico al cargar (no es una advertencia del documento). */
  | { status: "technical_error"; message: string };

export type ConfirmPayload = { declaredName: string };
export type RejectPayload = { declaredName: string; ratified: true };

export interface ConfirmationScreenProps {
  state: ConfirmationViewState;
  onConfirm: (payload: ConfirmPayload) => void;
  onReject: (payload: RejectPayload) => void;
  onRetry: () => void;
}
