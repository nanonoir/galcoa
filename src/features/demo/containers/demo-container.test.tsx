import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoContainer, DEMO_SIGNUP_HREF } from "./demo-container";

/** Términos que la UI nunca usa para lo que produce el sistema (PRD §5, §11). */
const FORBIDDEN = /certificad|validad[oa] regulatoriamente|garantizad[oa] verdader|firma digital|identidad verificada/i;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const sentEvents = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)).event as string);

describe("DemoContainer (demo pública, conversion-funnel.md D1)", () => {
  it("camino verde: controla, confirma como comprador, calcula la huella y ofrece crear la cuenta", async () => {
    const user = userEvent.setup();
    const { container } = render(<DemoContainer />);
    expect(screen.getByText(/la entrega de ejemplo no se guarda ni se registra en Hedera/)).toBeInTheDocument();
    expect(screen.queryByText(/nada se guarda/)).not.toBeInTheDocument();
    expect(screen.getByText(/identificador de navegador seudónimo.*No rastrear/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Armar y controlar el documento" }));
    expect(await screen.findByText("Coincide: los datos son iguales al comprobante")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear mi cuenta" })).toHaveAttribute("href", DEMO_SIGNUP_HREF);

    await user.click(screen.getByRole("button", { name: "Pedir confirmación al comprador" }));
    await user.click(screen.getByRole("button", { name: "Confirmar la entrega como comprador" }));
    await user.click(screen.getByRole("button", { name: "Calcular la huella del documento" }));

    const hash = await screen.findByText(/^[0-9a-f]{64}$/);
    expect(hash).toBeInTheDocument();
    expect(screen.getByText(/no se registra nada en Hedera/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Crear mi cuenta" }).at(-1)).toHaveAttribute("href", DEMO_SIGNUP_HREF);
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);

    await waitFor(() => expect(sentEvents()).toEqual(expect.arrayContaining(["demo_started", "demo_verdict_shown", "demo_completed"])));
    // Ninguna petición de producto: solo eventos anónimos del embudo.
    for (const [url] of fetchMock.mock.calls) expect(url).toBe("/api/funnel");
  });

  it("regla 200/198: rojo, sin camino a confirmar ni sellar; corregir vuelve al relato", async () => {
    const user = userEvent.setup();
    render(<DemoContainer />);
    await user.click(screen.getByRole("radio", { name: /Remito con diferencia/ }));
    expect(screen.getByText(/198 cajas/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Armar y controlar el documento" }));

    expect(await screen.findByText("Requiere revisión: no se puede sellar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pedir confirmación al comprador" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Corregir la entrega" }));
    expect(screen.getByRole("button", { name: "Armar y controlar el documento" })).toBeInTheDocument();
  });

  it("cantidad inválida: mensaje claro y no avanza", async () => {
    const user = userEvent.setup();
    render(<DemoContainer />);
    const input = screen.getByLabelText("¿Cuántas cajas entregaste?");
    await user.clear(input);
    await user.type(input, "1.000");
    expect(screen.getByText(/Ingresá una cantidad entera/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Armar y controlar el documento" })).toBeDisabled();
  });

  it("sin remito: amarillo (declarado) y se puede seguir", async () => {
    const user = userEvent.setup();
    render(<DemoContainer />);
    await user.click(screen.getByRole("radio", { name: /Sin remito/ }));
    await user.click(screen.getByRole("button", { name: "Armar y controlar el documento" }));
    expect(await screen.findByText("Declarado: sin comprobante que lo respalde")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pedir confirmación al comprador" })).toBeInTheDocument();
  });

  it("con «Do Not Track» no envía eventos", async () => {
    Object.defineProperty(window.navigator, "doNotTrack", { value: "1", configurable: true });
    render(<DemoContainer />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(window.navigator, "doNotTrack", { value: null, configurable: true });
  });
});
