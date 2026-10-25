import { describe, expect, it, vi } from "vitest";

import { handleFunnelEvent, handleSubscriptionRequest, MAX_BODY_BYTES, type ConversionHttpDeps, type ConversionRpc } from "@/lib/conversion/http";
import type { SessionCheck } from "@/lib/supabase/auth";

const visitorId = "0f8b6c4e-3a0d-4b9e-9c3e-2f1a7d5b8c90";
const key = "7d1e0f3a-6b2c-4c8d-9e1f-0a2b3c4d5e6f";
const authenticated: SessionCheck = { status: "authenticated", user: { id: "aaf3163d-8ec5-411d-a7ac-9219f47fb9b1", email: null } };

function setup(result: Awaited<ReturnType<ConversionRpc>> | Error = { data: null, error: null }, session: SessionCheck = authenticated) {
  const call = vi.fn<ConversionRpc>(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const deps: ConversionHttpDeps = { rpc: async () => call, session: async () => session };
  return { call, deps };
}
const post = (path: string, body: unknown) =>
  new Request(`https://galcoa.test${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /api/funnel (puerto doble, no demuestra Supabase)", () => {
  const event = { event: "demo_started", visitorId, step: null, source: null, plan: null };

  it("evento válido: 204 y llama a record_funnel_event con los campos validados", async () => {
    const { call, deps } = setup();
    const response = await handleFunnelEvent(post("/api/funnel", event), deps);
    expect(response.status).toBe(204);
    expect(call).toHaveBeenCalledWith("record_funnel_event", { p_visitor_id: visitorId, p_event: "demo_started", p_step: null, p_source: null, p_plan: null });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("evento fuera de la lista, JSON roto o cuerpo grande: 400 sin llamar a la base", async () => {
    for (const body of [{ ...event, event: "x" }, "{no-json", JSON.stringify({ ...event, source: "a".repeat(MAX_BODY_BYTES) })]) {
      const { call, deps } = setup();
      expect((await handleFunnelEvent(post("/api/funnel", body), deps)).status).toBe(400);
      expect(call).not.toHaveBeenCalled();
    }
  });

  it("si la base falla la medición se pierde, pero la respuesta sigue siendo 204", async () => {
    const { deps } = setup(new Error("sin configuración"));
    expect((await handleFunnelEvent(post("/api/funnel", event), deps)).status).toBe(204);
  });

  it("Do Not Track y Global Privacy Control: 204 sin llamar a la base", async () => {
    const optOuts: Record<string, string>[] = [{ dnt: "1" }, { "sec-gpc": "1" }];
    for (const header of optOuts) {
      const { call, deps } = setup();
      const request = new Request("https://galcoa.test/api/funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...header },
        body: JSON.stringify(event),
      });
      expect((await handleFunnelEvent(request, deps)).status).toBe(204);
      expect(call).not.toHaveBeenCalled();
    }
  });

  it("origen cruzado o tipo de contenido que no es JSON: 400 sin llamar a la base", async () => {
    const variants: Record<string, string>[] = [{ "Content-Type": "text/plain" }, { "Content-Type": "application/json", "sec-fetch-site": "cross-site" }];
    for (const headers of variants) {
      const { call, deps } = setup();
      const request = new Request("https://galcoa.test/api/funnel", { method: "POST", headers, body: JSON.stringify(event) });
      expect((await handleFunnelEvent(request, deps)).status).toBe(400);
      expect(call).not.toHaveBeenCalled();
    }
  });

  it("cuerpo por trozos que supera el tope sin declarar tamaño: 400 y se corta la lectura", async () => {
    const chunk = new TextEncoder().encode("x".repeat(MAX_BODY_BYTES));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const { call, deps } = setup();
    const request = new Request("https://galcoa.test/api/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    expect((await handleFunnelEvent(request, deps)).status).toBe(400);
    expect(call).not.toHaveBeenCalled();
  });
});

describe("POST /api/subscriptions (puerto doble, no demuestra Supabase)", () => {
  const body = { plan: "crecimiento", idempotencyKey: key };

  it("sin sesión 401; Auth caído 503; sin llamar a la base", async () => {
    for (const [session, status] of [[{ status: "anonymous" }, 401], [{ status: "unavailable" }, 503]] as const) {
      const { call, deps } = setup(undefined, session);
      expect((await handleSubscriptionRequest(post("/api/subscriptions", body), deps)).status).toBe(status);
      expect(call).not.toHaveBeenCalled();
    }
  });

  it("origen cruzado o contenido que no es JSON: 400 sin llamar a la base", async () => {
    const variants: Record<string, string>[] = [{ "Content-Type": "text/plain" }, { "Content-Type": "application/json", "sec-fetch-site": "cross-site" }];
    for (const headers of variants) {
      const { call, deps } = setup();
      const request = new Request("https://galcoa.test/api/subscriptions", { method: "POST", headers, body: JSON.stringify(body) });
      expect((await handleSubscriptionRequest(request, deps)).status).toBe(400);
      expect(call).not.toHaveBeenCalled();
    }
  });

  it("plan desconocido: 400", async () => {
    const { deps } = setup();
    expect((await handleSubscriptionRequest(post("/api/subscriptions", { ...body, plan: "gratis" }), deps)).status).toBe(400);
  });

  it("solicitud nueva 201 y repetida 200, con el resultado validado", async () => {
    const created = setup({ data: { status: "solicitada", plan: "crecimiento" }, error: null });
    const first = await handleSubscriptionRequest(post("/api/subscriptions", body), created.deps);
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ status: "solicitada", plan: "crecimiento" });
    expect(created.call).toHaveBeenCalledWith("request_subscription", { p_plan: "crecimiento", p_idempotency_key: key });

    const repeated = setup({ data: { status: "ya_solicitada", plan: "crecimiento" }, error: null });
    expect((await handleSubscriptionRequest(post("/api/subscriptions", body), repeated.deps)).status).toBe(200);
  });

  it("error de la base o respuesta inesperada: 503 reintentable, nunca un éxito inventado", async () => {
    for (const result of [{ data: null, error: { message: "boom" } }, { data: { status: "activa" }, error: null }, new Error("caída")]) {
      const { deps } = setup(result);
      const response = await handleSubscriptionRequest(post("/api/subscriptions", body), deps);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: { code: "SUBSCRIPTION_UNAVAILABLE", retryable: true } });
    }
  });
});
