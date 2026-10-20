import { Badge } from "@/components/ui/badge";
import type { AlcShared, Rectification } from "@/lib/contracts/review";

/**
 * Semáforo ALC del snapshot v2 (F-1, F-5). Es independiente de `DEMO_HIDE_WARNINGS`: no son las advertencias heredadas.
 * Solo formatea lo recibido. «Declarado» no es «confirmado»: una afirmación del chat sin original conservado no se
 * presenta como respaldada.
 */

const colorLabels: Record<AlcShared["color"], string> = { verde: "Verde", amarillo: "Amarillo", rojo: "Rojo" };

const colorSummary: Record<AlcShared["color"], string> = {
  verde: "Los datos materiales coinciden con originales conservados.",
  amarillo: "Hay datos solo declarados: ningún original conservado los respalda ni los contradice.",
  rojo: "Hay una contradicción, una ambigüedad o una fuente ilegible. Esta revisión no se puede sellar.",
};

const claimLabels: Record<AlcShared["claims"][number]["status"], string> = {
  declarado: "Declarado",
  confirmado: "Coincide con un original conservado",
  contradicho: "Contradicho por una fuente",
  ambiguo: "Ambiguo",
};

const ruleLabels: Record<AlcShared["findings"][number]["ruleId"], string> = {
  "ALC-CONTRADICCION": "Contradicción entre fuentes",
  "ALC-NO-LECTURA": "Fuente ilegible",
  "ALC-AMBIGUEDAD": "Dato ambiguo o sin cobertura completa",
  "ALC-DATO-DECLARADO": "Dato declarado sin original que lo respalde",
  "ALC-FUENTES-COINCIDENTES": "Fuentes coincidentes",
  "ALC-PARTICIPANTES": "Participantes fuera de lo permitido",
  "ALC-CONFIRMACIONES": "Faltan confirmaciones",
};

export function AlcTrafficLight({ alc, rectifications }: { alc: AlcShared; rectifications: readonly Rectification[] }) {
  return (
    <section aria-labelledby="snapshot-alc-title" className="flex min-w-0 flex-col gap-2">
      <h3 id="snapshot-alc-title" className="text-base font-semibold">
        Contraste de fuentes
      </h3>
      <p>
        <Badge variant={alc.color === "rojo" ? "destructive" : "outline"} data-alc-color={alc.color} className="h-auto whitespace-normal">
          Semáforo {colorLabels[alc.color]}
        </Badge>
      </p>
      <p className="text-sm break-words">{colorSummary[alc.color]}</p>
      <p className="text-xs text-muted-foreground">Compara lo declarado con los originales conservados; no verifica que los hechos sean ciertos.</p>
      {alc.claims.length > 0 && (
        <ul aria-label="Datos materiales" className="flex flex-col gap-1 text-sm">
          {alc.claims.map((claim) => (
            <li key={claim.id} className="break-words border p-2">
              <span className="font-medium">
                {claim.subject} / {claim.field}:
              </span>{" "}
              {claim.value}
              {claim.unit ? ` ${claim.unit}` : ""} <span className="text-muted-foreground">({claimLabels[claim.status]})</span>
            </li>
          ))}
        </ul>
      )}
      {alc.findings.length > 0 && (
        <ul aria-label="Motivos del semáforo" className="list-disc pl-5 text-sm">
          {alc.findings.map((finding, index) => (
            <li key={`${finding.ruleId}-${finding.claimId ?? "g"}-${index}`} className="break-words">
              {ruleLabels[finding.ruleId]}
              {finding.sources.length > 0 ? ` (fuentes: ${finding.sources.join(", ")})` : ""}
            </li>
          ))}
        </ul>
      )}
      {rectifications.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">Rectificaciones</p>
          <ul className="list-disc pl-5">
            {rectifications.map((r) => (
              <li key={r.claimId} className="break-words">
                {r.previousValue} {"->"} {r.correctedValue}. Motivo: {r.reason}. Se conserva el registro original.
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
