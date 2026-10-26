import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PricingContainer, pricingSignupHref, SUBSCRIPTIONS_ENDPOINT } from "./pricing-container";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function stubFetch(subscription: Response) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => (url === SUBSCRIPTIONS_ENDPOINT ? subscription : new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PricingContainer (conversion-funnel.md, D5)", () => {
  it("visitante: muestra los tres planes y lleva al registro con el plan elegido", () => {
    stubFetch(json({}));
    render(<PricingContainer signedIn={false} suggestedPlan={null} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Inicial", "Crecimiento", "Pro"]);
    expect(screen.getByRole("link", { name: "Empezar con Pro" })).toHaveAttribute("href", pricingSignupHref("pro"));
    expect(pricingSignupHref("pro")).toBe("/registro?origen=precios&plan=pro");
  });

  it("con sesión: «Contratar» registra la solicitud real y lo confirma", async () => {
    const fetchMock = stubFetch(json({ status: "solicitada", plan: "crecimiento" }, 201));
    render(<PricingContainer signedIn suggestedPlan={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Contratar Crecimiento" }));

    expect(await screen.findByText("¡Listo! Registramos tu solicitud.")).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === SUBSCRIPTIONS_ENDPOINT);
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.plan).toBe("crecimiento");
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("fallo del servidor: error visible en el plan, nunca una contratación simulada", async () => {
    stubFetch(json({ error: { code: "SUBSCRIPTION_UNAVAILABLE", retryable: true } }, 503));
    render(<PricingContainer signedIn suggestedPlan={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Contratar Inicial" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos registrar la solicitud");
    expect(screen.queryByText(/Registramos tu solicitud/)).not.toBeInTheDocument();
  });

  it("sesión vencida: vuelve al acceso", async () => {
    stubFetch(json({ error: { code: "NO_SESSION" } }, 401));
    render(<PricingContainer signedIn suggestedPlan={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Contratar Pro" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/acceso"));
  });

  it("marca el plan sugerido", () => {
    stubFetch(json({}));
    render(<PricingContainer signedIn={false} suggestedPlan="pro" />);
    expect(screen.getByText("Elegido")).toBeInTheDocument();
  });
});
