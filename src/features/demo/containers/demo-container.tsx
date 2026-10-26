"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";

import { track } from "@/features/conversion/containers/track";
import { DemoExperience } from "@/features/demo/components/demo-experience";
import type { DemoRemito, DemoStep, DemoViewState } from "@/features/demo/contracts/demo-view";

import { demoDocument, demoMessage, demoRemitoText, evaluateDemo, parseDemoQuantity, sha256Hex } from "./demo-scenario";

/**
 * Container de la demo pública (conversion-funnel.md, D1). No hace ninguna
 * petición de producto: corre el motor de reglas real en el navegador y calcula
 * la huella con `crypto.subtle`. Solo envía eventos anónimos del embudo.
 */

export const DEMO_SIGNUP_HREF = "/registro?origen=demo";
export const DEMO_PRICING_HREF = "/precios";
const QUANTITY_ERROR = "Ingresá una cantidad entera entre 1 y 9999, sin puntos ni comas.";
const TECHNICAL_ERROR = "No se pudo controlar el documento de ejemplo. Probá de nuevo.";

function initialState(quantity = "200", remito: DemoRemito = "coincide"): DemoViewState {
  return {
    step: 1,
    quantity,
    quantityError: null,
    remito,
    message: demoMessage(quantity),
    remitoText: demoRemitoText(quantity, remito),
    document: null,
    verdict: null,
    merchantConfirmed: false,
    hash: null,
    sealing: false,
    error: null,
  };
}

export function DemoContainer() {
  const [state, setState] = useState<DemoViewState>(() => initialState());
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track("demo_started");
  }, []);

  function goTo(step: DemoStep, patch: Partial<DemoViewState> = {}) {
    setState((s) => ({ ...s, ...patch, step, error: null }));
    track("demo_step_viewed", { step: `paso_${step}` });
  }

  function onQuantityChange(value: string) {
    const quantity = parseDemoQuantity(value);
    setState((s) => ({
      ...s,
      quantity: value,
      quantityError: quantity ? null : QUANTITY_ERROR,
      message: quantity ? demoMessage(quantity) : s.message,
      remitoText: quantity ? demoRemitoText(quantity, s.remito) : s.remitoText,
    }));
  }

  function onRemitoChange(remito: DemoRemito) {
    setState((s) => {
      const quantity = parseDemoQuantity(s.quantity) ?? "200";
      return { ...s, remito, remitoText: demoRemitoText(quantity, remito) };
    });
  }

  async function onBuild() {
    const quantity = parseDemoQuantity(state.quantity);
    if (!quantity) {
      setState((s) => ({ ...s, quantityError: QUANTITY_ERROR }));
      return;
    }
    const message = demoMessage(quantity);
    const remitoText = demoRemitoText(quantity, state.remito);
    try {
      const [messageHash, remitoHash] = await Promise.all([sha256Hex(message), remitoText ? sha256Hex(remitoText) : Promise.resolve(null)]);
      const verdict = evaluateDemo({ quantity, message, messageHash, remitoText, remitoHash });
      if (!verdict) throw new Error("technical");
      goTo(2, { message, remitoText, document: demoDocument(quantity), verdict, merchantConfirmed: false, hash: null });
      track("demo_verdict_shown", { step: verdict.color, source: state.remito });
    } catch {
      setState((s) => ({ ...s, error: TECHNICAL_ERROR }));
    }
  }

  async function onSeal() {
    if (!state.document || !state.verdict?.sealable || !state.merchantConfirmed) return;
    setState((s) => ({ ...s, sealing: true }));
    try {
      const canonical = JSON.stringify({ documento: state.document, mensaje: state.message, remito: state.remitoText, confirmado: true });
      const hash = await sha256Hex(canonical);
      setState((s) => ({ ...s, hash, sealing: false }));
      track("demo_completed", { step: state.verdict.color });
    } catch {
      setState((s) => ({ ...s, sealing: false, error: TECHNICAL_ERROR }));
    }
  }

  return (
    <DemoExperience
      state={state}
      signupHref={DEMO_SIGNUP_HREF}
      pricingHref={DEMO_PRICING_HREF}
      qr={
        <div className="w-fit border bg-white p-3">
          <QRCode value="GALCOA+ demo: confirmación de ejemplo, sin enlace real" size={140} level="M" role="img" aria-label="QR de ejemplo para el comercio" />
        </div>
      }
      onQuantityChange={onQuantityChange}
      onRemitoChange={onRemitoChange}
      onBuild={() => void onBuild()}
      onBackToStory={() => goTo(1, { verdict: null, document: null, hash: null, merchantConfirmed: false })}
      onRequestConfirmation={() => goTo(3)}
      onMerchantConfirm={() => goTo(4, { merchantConfirmed: true })}
      onSeal={() => void onSeal()}
      onRestart={() => {
        setState(initialState(parseDemoQuantity(state.quantity) ?? "200", state.remito));
        track("demo_step_viewed", { step: "reinicio" });
      }}
      onCtaClick={(source) => track("cta_clicked", { source })}
    />
  );
}
