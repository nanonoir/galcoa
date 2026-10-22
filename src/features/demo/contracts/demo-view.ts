import type { ReactNode } from "react";

/**
 * Vista de la demo pública (docs/exec-plans/active/conversion-funnel.md, D1).
 * Todo es de ejemplo y local al navegador: la presentación solo recibe datos y
 * callbacks; el container ejecuta las reglas reales y calcula la huella.
 */

export type DemoStep = 1 | 2 | 3 | 4;

/** Comprobante que acompaña al mensaje en el escenario de ejemplo. */
export type DemoRemito = "coincide" | "diferencia" | "sin_remito";

export type DemoColor = "verde" | "amarillo" | "rojo";

export interface DemoDocumentView {
  comercio: string;
  producto: string;
  cantidad: string;
  unidad: string;
  hora: string;
}

export interface DemoVerdictView {
  color: DemoColor;
  /** Explicaciones ya redactadas de cada hallazgo (regla → texto). */
  reasons: string[];
  /** Si se puede seguir hacia la confirmación y el sello. */
  sealable: boolean;
}

export interface DemoViewState {
  step: DemoStep;
  /** Cantidad que el visitante declara en el mensaje (texto del input). */
  quantity: string;
  quantityError: string | null;
  remito: DemoRemito;
  message: string;
  remitoText: string | null;
  document: DemoDocumentView | null;
  verdict: DemoVerdictView | null;
  merchantConfirmed: boolean;
  hash: string | null;
  sealing: boolean;
  error: string | null;
}

export interface DemoViewProps {
  state: DemoViewState;
  signupHref: string;
  pricingHref: string;
  /** QR de ejemplo ya dibujado por el container (la presentación no importa librerías de QR). */
  qr?: ReactNode;
  onQuantityChange: (value: string) => void;
  onRemitoChange: (value: DemoRemito) => void;
  onBuild: () => void;
  onBackToStory: () => void;
  onRequestConfirmation: () => void;
  onMerchantConfirm: () => void;
  onSeal: () => void;
  onRestart: () => void;
  onCtaClick: (source: string) => void;
}
