"use client";

import { useCallback, useRef, useState } from "react";

import { ConfirmationScreen } from "@/features/corroborations/components/confirmation-screen";
import type { ConfirmationViewState, ConfirmPayload, RejectPayload } from "@/features/corroborations/contracts/confirmation-screen";
import { ConfirmationResultSchema } from "@/lib/contracts/confirmation";
import type { PublicInvitation } from "@/lib/contracts/public";

/**
 * Container de la pantalla pública de confirmación (MVP-076). Posee la red y
 * la clave de idempotencia; la presentación no hace `fetch`. La clave nace al
 * iniciar una **intención** (decisión + nombre) y se reutiliza en reintentos y
 * dobles clics de esa misma intención; otra intención usa otra clave. No hay
 * éxito optimista: «done» solo se muestra con el resultado persistido por el
 * servidor, validado con el esquema del contrato. El token viaja en el cuerpo
 * del POST, nunca en la URL ni en un encabezado.
 */

type Intent = { signature: string; key: string; body: Record<string, unknown> };

export type ConfirmationContainerProps = {
  token: string;
  initial: ConfirmationViewState;
  /** Inyectable en pruebas; por defecto el `fetch` del navegador. */
  fetchImpl?: typeof fetch;
  /** Inyectable en pruebas; por defecto `crypto.randomUUID`. */
  newKey?: () => string;
};

const RESPOND_PATH = "/api/confirm/respond";

const RETRY_MESSAGE = "No pudimos enviar tu respuesta. Tu elección sigue acá: reintentá sin volver a completar nada.";

export function ConfirmationContainer({ token, initial, fetchImpl, newKey }: ConfirmationContainerProps) {
  const [state, setState] = useState<ConfirmationViewState>(initial);
  const invitation = useRef<PublicInvitation | null>(initial.status === "ready" ? initial.invitation : null);
  const intent = useRef<Intent | null>(null);
  const inFlight = useRef(false);

  const send = useCallback(
    async (current: Intent) => {
      const inv = invitation.current;
      if (!inv || inFlight.current) return;
      inFlight.current = true;
      setState({ status: "submitting", invitation: inv });
      const fail = (message: string) => setState({ status: "submit_error", invitation: inv, message });
      try {
        const response = await (fetchImpl ?? fetch)(RESPOND_PATH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...current.body, idempotencyKey: current.key }),
          cache: "no-store",
          referrerPolicy: "no-referrer",
        });
        const payload: unknown = await response.json().catch(() => null);
        if (response.ok) {
          const parsed = ConfirmationResultSchema.safeParse(payload);
          if (parsed.success) return setState({ status: "done", result: parsed.data });
          return fail(RETRY_MESSAGE);
        }
        const code = (payload as { error?: { code?: string } } | null)?.error?.code;
        if (code === "ALREADY_RESPONDED") return setState({ status: "unavailable", reason: "ya_respondida" });
        if (code === "INVITATION_EXPIRED") return setState({ status: "unavailable", reason: "caducada" });
        if (code === "REVISION_SUPERSEDED") return setState({ status: "unavailable", reason: "sustituida" });
        if (response.status === 404) return setState({ status: "unavailable", reason: "no_disponible" });
        if (response.status === 429) return fail("Hiciste muchos intentos seguidos. Esperá un minuto y reintentá.");
        return fail(RETRY_MESSAGE);
      } catch {
        fail(RETRY_MESSAGE);
      } finally {
        inFlight.current = false;
      }
    },
    [fetchImpl],
  );

  const begin = useCallback(
    (decision: "confirmar" | "rechazar", declaredName: string) => {
      const inv = invitation.current;
      if (!inv) return;
      const signature = `${decision}|${declaredName}`;
      // La clave se conserva mientras la intención sea la misma (reintentos y doble clic).
      const key = intent.current?.signature === signature ? intent.current.key : (newKey ?? (() => crypto.randomUUID()))();
      const body = {
        schemaVersion: 1,
        actor: "tercero",
        token,
        revisionId: inv.revisionId,
        snapshotId: inv.snapshotId,
        snapshotHash: inv.snapshotHash,
        declaredName,
        ...(decision === "confirmar"
          ? { decision, checkboxChecked: true }
          : { decision, checkboxChecked: false, rejectionRatified: true }),
      };
      intent.current = { signature, key, body };
      void send(intent.current);
    },
    [newKey, send, token],
  );

  const onConfirm = useCallback(({ declaredName }: ConfirmPayload) => begin("confirmar", declaredName), [begin]);
  const onReject = useCallback(({ declaredName }: RejectPayload) => begin("rechazar", declaredName), [begin]);
  const onRetry = useCallback(() => {
    if (intent.current) return void send(intent.current);
    // Falla de carga inicial: se pide la página de nuevo (la lectura no consume nada).
    window.location.reload();
  }, [send]);

  return <ConfirmationScreen state={state} onConfirm={onConfirm} onReject={onReject} onRetry={onRetry} />;
}
