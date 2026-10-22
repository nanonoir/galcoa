"use client";

import { AlertTriangle, CheckCircle2, FileText, Info, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConfirmationScreenProps, ConfirmationViewState, UnavailableReason } from "@/features/corroborations/contracts/confirmation-screen";
import { DEMO_HIDE_WARNINGS } from "@/lib/contracts/demo-mode";
import type { PublicInvitation } from "@/lib/contracts/public";
import type { ParticipantRole, SharedWarning } from "@/lib/contracts/review";
import { AlcTrafficLight } from "@/features/documents/components/alc-traffic-light";

/**
 * Pantalla pública de confirmación (MVP-076; PRD §10, INV-12/13/14). Sin login.
 *
 * Solo presenta el estado que recibe y entrega la decisión a los callbacks una
 * vez por envío. La casilla nace **vacía** y el navegador no la restaura
 * (`autoComplete="off"`). «Confirmar» exige casilla marcada y nombre; «No
 * coincide / Rechazar» exige casilla vacía y nombre, y abre un modal que
 * pide ratificar: cancelar o Escape no envían nada. Ninguna advertencia,
 * aun crítica, deshabilita nada. El nombre es autodeclarado: no se presenta
 * como identidad verificada ni como firma.
 */

const roleLabels: Record<ParticipantRole, string> = {
  autor: "Proveedor",
  intermediario: "Transportista",
  comprador: "Comprador",
};

/** Cómo se nombra al invitado en el encabezado: el proveedor le pide confirmar una entrega. */
const invitedRoleLabels: Record<PublicInvitation["role"], string> = {
  intermediario: "transportista",
  comprador: "comprador",
};

const severityLabels: Record<SharedWarning["severity"], string> = { warning: "Advertencia", critical: "Crítica" };

const unavailableCopy: Record<UnavailableReason, { title: string; body: string }> = {
  ya_respondida: { title: "Este enlace ya fue usado", body: "Ya se registró una respuesta con este enlace. No se puede responder de nuevo." },
  caducada: { title: "Este enlace venció", body: "El enlace ya no admite respuestas. Pedile a quien lo compartió que te envíe uno nuevo." },
  sustituida: {
    title: "Esta revisión fue reemplazada",
    body: "La operación cambió y este enlace dejó de valer. Pedile a quien lo compartió el enlace de la revisión nueva.",
  },
  no_disponible: { title: "Enlace no disponible", body: "No pudimos mostrar esta operación. Revisá el enlace o pedí que te envíen uno nuevo." },
};

const MAX_NAME_CODEPOINTS = 200;

function validName(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 && Array.from(trimmed).length <= MAX_NAME_CODEPOINTS;
}

function formatInstant(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "long", timeStyle: "short" });
}

function WarningItem({ warning }: { warning: SharedWarning }) {
  const critical = warning.severity === "critical";
  return (
    <li className={critical ? "flex gap-2 border border-destructive/40 bg-destructive/5 p-3" : "flex gap-2 border border-border bg-muted/40 p-3"}>
      {critical ? (
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
      ) : (
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="flex min-w-0 flex-col gap-2">
        <p className="break-words">
          <strong>{severityLabels[warning.severity]}:</strong> {warning.message}
        </p>
        {warning.sources.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs">
            {warning.sources.map((source, index) => (
              <li key={`${source.alias}-${index}`} className="break-words text-muted-foreground">
                <span className="font-medium text-foreground">{source.alias}:</span> {source.description}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function OperationSummary({ invitation }: { invitation: PublicInvitation }) {
  const { operation, warnings, selection, role, expiresAt } = invitation;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h2 className="flex items-start gap-2 text-base font-semibold break-words">
              <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">{operation.title}</span>
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <span className="font-medium">Vas a responder como:</span> {roleLabels[role]}
          </p>
          <p className="text-muted-foreground">Participantes de esta revisión: {selection.map((r) => roleLabels[r]).join(", ")}.</p>
          <p className="text-muted-foreground">Este enlace es personal y vence el {formatInstant(expiresAt)}.</p>
        </CardContent>
      </Card>

      <section aria-labelledby="confirmation-operation-title" className="flex min-w-0 flex-col gap-2">
        <h3 id="confirmation-operation-title" className="text-base font-semibold">
          Operación
        </h3>
        <p className="border border-border p-3 text-base break-words whitespace-pre-line">{operation.body}</p>
        {operation.corrections.length > 0 && (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium">Correcciones aplicadas</p>
            <ul className="list-disc pl-5">
              {operation.corrections.map((correction, index) => (
                <li key={`${correction}-${index}`} className="break-words">
                  {correction}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {invitation.schemaVersion === 2 && <AlcTrafficLight alc={invitation.alc} rectifications={invitation.rectifications} />}

      {!DEMO_HIDE_WARNINGS && (
        <section aria-labelledby="confirmation-warnings-title" className="flex min-w-0 flex-col gap-2">
          <h3 id="confirmation-warnings-title" className="text-base font-semibold">
            Advertencias
          </h3>
          {warnings.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">Son informativas: no impiden confirmar ni rechazar.</p>
              <ul className="flex flex-col gap-2 text-sm">
                {warnings.map((warning) => (
                  <WarningItem key={warning.id} warning={warning} />
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Esta operación no tiene advertencias registradas.</p>
          )}
        </section>
      )}
    </div>
  );
}

function ResponseForm({
  busy,
  error,
  onConfirm,
  onReject,
  onRetry,
}: Pick<ConfirmationScreenProps, "onConfirm" | "onReject" | "onRetry"> & { busy: boolean; error?: string }) {
  const uid = useId();
  const nameId = `${uid}-name`;
  const checkId = `${uid}-check`;
  const hintId = `${uid}-hint`;
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const sent = useRef(false);

  // Un envío por intención: se libera cuando vuelve un error (se puede reintentar) o cambia el estado.
  useEffect(() => {
    if (!busy) sent.current = false;
  }, [busy, error]);

  const nameOk = validName(name);
  const canConfirm = checked && nameOk && !busy;
  const canReject = !checked && nameOk && !busy;
  const trimmed = name.trim();

  function confirm() {
    if (!canConfirm || sent.current) return;
    sent.current = true;
    onConfirm({ declaredName: trimmed });
  }

  function ratify() {
    setModalOpen(false);
    if (!canReject || sent.current) return;
    sent.current = true;
    onReject({ declaredName: trimmed, ratified: true });
  }

  const hint = !nameOk
    ? "Escribí tu nombre completo para poder confirmar o rechazar."
    : checked
      ? "Para rechazar, desmarcá la casilla."
      : "Marcá la casilla solo si la operación coincide con lo que conocés.";

  return (
    <form
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        confirm();
      }}
      aria-label="Tu respuesta"
      className="flex min-w-0 flex-col gap-4"
    >
      <h3 className="text-base font-semibold">Tu respuesta</h3>

      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>Nombre completo</Label>
        <Input
          id={nameId}
          name="declaredName"
          autoComplete="off"
          value={name}
          readOnly={busy}
          maxLength={400}
          onChange={(event) => setName(event.target.value)}
          aria-describedby={hintId}
        />
        <p className="text-xs text-muted-foreground">Es un nombre que declarás vos; no se comprueba contra ningún documento.</p>
      </div>

      <div className="flex items-start gap-2">
        <input
          id={checkId}
          name="coincide"
          type="checkbox"
          autoComplete="off"
          checked={checked}
          disabled={busy}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-0.5 size-6 shrink-0 accent-success"
        />
        <Label htmlFor={checkId} className="items-start leading-snug font-normal">
          Leí la operación y coincide con lo que conozco.
        </Label>
      </div>

      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}
      </p>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>No se pudo enviar tu respuesta</AlertTitle>
          <AlertDescription>
            <p className="break-words">{error}</p>
            <Button type="button" variant="outline" className="mt-2" onClick={() => onRetry()}>
              <RotateCcw aria-hidden="true" data-icon="inline-start" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 min-[400px]:flex-row">
        <Button type="submit" disabled={!canConfirm} className="h-11 min-[400px]:flex-1">
          {busy ? "Enviando…" : "Confirmar"}
        </Button>
        <Button type="button" variant="destructive" disabled={!canReject} onClick={() => setModalOpen(true)} className="h-11 min-[400px]:flex-1">
          No coincide / Rechazar
        </Button>
      </div>

      <AlertDialog open={modalOpen} onOpenChange={setModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rechazar esta operación?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a registrar que la operación no coincide con lo que conocés, con el nombre «{trimmed}». Esta respuesta no se puede cambiar con este enlace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={ratify}>
              Sí, rechazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function DoneCard({ state }: { state: Extract<ConfirmationViewState, { status: "done" }> }) {
  const { result } = state;
  const confirmed = result.outcome.decision === "confirmar";
  return (
    <div role="status" aria-live="polite" className="panel flex flex-col gap-3 p-4">
      <p className="flex items-center gap-2 text-base font-semibold">
        <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        {confirmed ? "Registramos tu confirmación" : "Registramos que no coincide"}
      </p>
      <p className="text-sm break-words">
        {confirmed ? "Confirmado mediante enlace" : "Rechazado mediante enlace"} por <strong>{result.actor.declaredName ?? ""}</strong>, el {formatInstant(result.respondedAt)}.
      </p>
      <p className="text-sm break-words">
        {confirmed
          ? "Cuando estén todas, el proveedor genera el PDF final y registra su huella."
          : "El proveedor tiene que corregir y pedirte una nueva confirmación."}
      </p>
      <p className="text-xs text-muted-foreground">
        El nombre es el que declaraste; no se verificó contra ningún documento. Ya podés cerrar esta página.
      </p>
    </div>
  );
}

export function ConfirmationScreen({ state, onConfirm, onReject, onRetry }: ConfirmationScreenProps) {
  const invitation = state.status === "ready" || state.status === "submitting" || state.status === "submit_error" ? state.invitation : null;

  return (
    <section aria-labelledby="confirmation-title" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h1 id="confirmation-title" className="page-title">
          Revisión de una operación
        </h1>
        {invitation && (
          <p className="text-sm text-muted-foreground">
            El proveedor te pide que confirmes esta entrega como <strong>{invitedRoleLabels[invitation.role]}</strong>. No hace falta cuenta. Solo podés confirmar o decir que no coincide; no podés editarla.
          </p>
        )}
      </header>

      {state.status === "unavailable" && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>{unavailableCopy[state.reason].title}</AlertTitle>
          <AlertDescription>{unavailableCopy[state.reason].body}</AlertDescription>
        </Alert>
      )}

      {state.status === "technical_error" && (
        <Alert variant="destructive" role="alert">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>No se pudo cargar la operación</AlertTitle>
          <AlertDescription>
            <p className="break-words">{state.message}</p>
            <Button type="button" variant="outline" className="mt-2" onClick={() => onRetry()}>
              <RotateCcw aria-hidden="true" data-icon="inline-start" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.status === "done" && <DoneCard state={state} />}

      {invitation && (
        <>
          <OperationSummary invitation={invitation} />
          <ResponseForm
            busy={state.status === "submitting"}
            error={state.status === "submit_error" ? state.message : undefined}
            onConfirm={onConfirm}
            onReject={onReject}
            onRetry={onRetry}
          />
        </>
      )}
    </section>
  );
}
