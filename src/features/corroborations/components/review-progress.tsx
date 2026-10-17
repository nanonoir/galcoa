import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConfirmationStatus, HcsStatus } from "@/lib/contracts/document";
import type { ParticipantRole } from "@/lib/contracts/review";

/**
 * Avance de la revisión (MVP-077; REQ-12, INV-14, INV-17): tres indicadores
 * independientes (confirmaciones, finalización, sello), cada uno atribuido a la
 * revisión/versión a la que se refiere. Un sello pendiente no equivale a «no
 * finalizado» ni a «registrado». Las acciones las decide el servidor.
 */

export type ParticipantProgress = "pendiente" | "confirmada" | "rechazada";

export interface ReviewProgressProps {
  /** Texto visible de la revisión («Revisión 2»); no se muestran ids técnicos. */
  revisionLabel: string;
  confirmationStatus: ConfirmationStatus;
  participants: { role: ParticipantRole; progress: ParticipantProgress }[];
  /** `null` mientras no se finalizó; `no_disponible` si el origen de datos no trae el número. */
  finalizedVersionNumber: number | null | "no_disponible";
  hcsStatus: HcsStatus;
  refreshing: boolean;
  onRefresh: () => void;
}

const roleLabels: Record<ParticipantRole, string> = { autor: "Autor", intermediario: "Intermediario", comprador: "Comprador" };

const confirmationLabels: Record<ConfirmationStatus, string> = {
  pendiente: "Faltan confirmaciones",
  parcial: "Confirmaciones parciales",
  completa: "Todos confirmaron",
  rechazada: "Un participante rechazó: abrí otra revisión para continuar",
  sustituida: "Sustituida por una revisión más nueva; no hereda confirmaciones",
};

const progressLabels: Record<ParticipantProgress, string> = { pendiente: "Pendiente", confirmada: "Confirmó", rechazada: "Rechazó" };

const sealLabels: Record<HcsStatus, string> = {
  registrado: "Sello registrado",
  pendiente: "Sello pendiente",
  no_iniciado: "Sello pendiente: todavía no se inició",
  fallido: "Sello pendiente: el último intento no se completó",
};

export function ReviewProgress({ revisionLabel, confirmationStatus, participants, finalizedVersionNumber, hcsStatus, refreshing, onRefresh }: ReviewProgressProps) {
  return (
    <section aria-labelledby="review-progress-title" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="review-progress-title" className="text-lg font-semibold">
          Avance de la {revisionLabel.toLowerCase()}
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw aria-hidden="true" data-icon="inline-start" />
          {refreshing ? "Actualizando…" : "Actualizar avance"}
        </Button>
      </header>

      <dl className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-3">
        <div className="panel flex min-w-0 flex-col gap-2 p-3">
          <dt className="tech-label">Confirmaciones · {revisionLabel}</dt>
          <dd className="flex flex-col gap-2 text-sm">
            <span>{confirmationLabels[confirmationStatus]}</span>
            <ul className="flex flex-col gap-1">
              {participants.map((p) => (
                <li key={p.role} className="flex items-center justify-between gap-2">
                  <span>{roleLabels[p.role]}</span>
                  <Badge variant={p.progress === "confirmada" ? "secondary" : "outline"}>{progressLabels[p.progress]}</Badge>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="panel flex min-w-0 flex-col gap-2 p-3">
          <dt className="tech-label">Finalización</dt>
          <dd className="text-sm">{finalizedVersionNumber === null
              ? "Todavía no finalizada"
              : finalizedVersionNumber === "no_disponible"
                ? "Número de versión finalizada no disponible en esta pantalla"
                : `Versión ${finalizedVersionNumber} finalizada`}</dd>
        </div>
        <div className="panel flex min-w-0 flex-col gap-2 p-3">
          <dt className="tech-label">Sello HCS</dt>
          <dd className="text-sm">
            <Badge variant={hcsStatus === "registrado" ? "secondary" : "outline"} className="h-auto max-w-full text-left break-words whitespace-normal">
              {sealLabels[hcsStatus]}
            </Badge>
          </dd>
        </div>
      </dl>
      <p role="status" aria-live="polite" className="sr-only">
        {refreshing ? "Actualizando el avance" : ""}
      </p>
    </section>
  );
}
