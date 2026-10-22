import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ActivationChecklist } from "@/lib/contracts/conversion";

import { ActivationChecklistCard } from "./activation-checklist";

const checklist = (done: number, nextDocumentId: string | null = null): ActivationChecklist => ({
  steps: (["creado", "verificado", "confirmado", "sellado"] as const).map((id, i) => ({ id, done: i < done })),
  nextDocumentId,
});
const props = { creating: false, error: null, pricingHref: "/precios", onCreate: vi.fn(), onContinue: vi.fn() };

describe("ActivationChecklistCard (conversion-funnel.md, D4)", () => {
  it("sin documentos: propone crear el primero", async () => {
    const onCreate = vi.fn();
    render(<ActivationChecklistCard {...props} checklist={checklist(0)} onCreate={onCreate} />);
    expect(screen.getByText("0 de 4 pasos")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Crear mi primer documento" }));
    expect(onCreate).toHaveBeenCalled();
  });

  it("a mitad de camino: marca el paso actual y sigue con el documento sugerido", async () => {
    const onContinue = vi.fn();
    render(<ActivationChecklistCard {...props} checklist={checklist(2, "doc-9")} onContinue={onContinue} />);
    expect(screen.getByText("2 de 4 pasos")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Pedí la confirmación");
    await userEvent.click(screen.getByRole("button", { name: "Seguir con mi documento" }));
    expect(onContinue).toHaveBeenCalledWith("doc-9");
  });

  it("completo: felicita e invita a ver los planes", () => {
    render(<ActivationChecklistCard {...props} checklist={checklist(4)} pricingHref="/precios?plan=pro" />);
    expect(screen.getByRole("heading", { name: "¡Sellaste tu primera entrega!" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver planes" })).toHaveAttribute("href", "/precios?plan=pro");
  });

  it("muestra el error de creación", () => {
    render(<ActivationChecklistCard {...props} checklist={checklist(0)} error="No se pudo crear el documento." />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo crear el documento.");
  });
});
