import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatContainer } from "./chat-container";

// El interruptor de la demo se apaga aquí para cubrir la presentación de advertencias; el encendido está en *.demo.test.tsx.
vi.mock("@/lib/contracts/demo-mode", () => ({ DEMO_HIDE_WARNINGS: false }));

const upload = vi.hoisted(() => vi.fn());
vi.mock("@/features/auth/containers/supabase-browser", () => ({ uploadReservedEvidence: upload }));
const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const DOC = "dc6e5bb1-c726-45bb-a048-97810495992b";
const techError = (code: string, stage: string, retryable: boolean) => ({ error: { code, stage, retryable, correlationId: "corr-1" } });
const ok = (result: unknown) => Response.json({ schemaVersion: 1, outcome: "completed", result });
const reserved = () => ok({ evidence: { evidenceId: "ev1" }, upload: { transport: "authenticated" } });
const pdf = () => new File(["%PDF-1.4"], "acta.pdf", { type: "application/pdf" });

let routes: Record<string, () => Response>;
const calls: { url: string; body?: unknown }[] = [];
let ids = 0;

beforeEach(() => {
  ids = 0;
  upload.mockReset().mockResolvedValue(undefined);
  routes = {
    "/evidences": reserved,
    "/evidences/ev1/complete": () => ok({ evidenceId: "ev1" }),
    "/evidences/ev1/extraction": () => ok({ extractionId: "x1" }),
    "/contrast": () => Response.json({ result: { result: "con_advertencias", findings: [{ message: "Fecha dudosa", severity: "warning" }] } }),
  };
  vi.stubGlobal("crypto", { randomUUID: () => `uuid-${++ids}`, subtle: globalThis.crypto.subtle });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (url.endsWith("/messages")) return Response.json({ result: [] });
    if (url.endsWith("/chat")) {
      const line = (e: object) => `${JSON.stringify(e)}\n`;
      return new Response(line({ type: "draft", draftId: "d1", draftRevision: 1, title: "Entrega" }) + line({ type: "done" }));
    }
    const route = Object.keys(routes).find((r) => url.endsWith(`${DOC}${r}`) || (r === "/contrast" && url.endsWith(r)));
    return route ? routes[route]!() : new Response(null, { status: 404 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

const attach = (...files: File[]) => userEvent.upload(screen.getByTestId("chat-file-input"), files);
const hits = (suffix: string) => calls.filter((c) => c.url.endsWith(suffix));

describe("ChatContainer adjuntos (MVP-054; red y Storage simulados, no es integración real)", () => {
  it("reserva, sube, completa y extrae; sin borrador no contrasta", async () => {
    render(<ChatContainer documentId={DOC} />);
    await attach(pdf());
    expect(await screen.findByText("Texto extraído")).toBeInTheDocument();
    const reserve = hits("/evidences")[0]!.body as Record<string, unknown>;
    expect(reserve).toMatchObject({ mimeType: "application/pdf", byteLength: 8, declaredEventDate: { kind: "unknown" } });
    expect(reserve.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(upload).toHaveBeenCalledOnce();
    expect(hits("/contrast")).toHaveLength(0);
  });

  it("rechaza tipo no admitido sin red", async () => {
    render(<ChatContainer documentId={DOC} />);
    await attach(new File(["x"], "nota.txt", { type: "text/plain" }));
    expect(await screen.findByText("Motivo: EVIDENCE_UNSUPPORTED_TYPE")).toBeInTheDocument();
    expect(hits("/evidences")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Reintentar carga/ })).not.toBeInTheDocument();
  });

  it("fallo de Storage ofrece reintento y no repite la reserva con la misma clave", async () => {
    upload.mockRejectedValueOnce(new Error("x"));
    render(<ChatContainer documentId={DOC} />);
    await attach(pdf());
    await userEvent.click(await screen.findByRole("button", { name: /Reintentar carga de acta.pdf/ }));
    expect(await screen.findByText("Texto extraído")).toBeInTheDocument();
    expect(hits("/evidences")).toHaveLength(1);
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("rechazo del servidor (422) es definitivo y no ofrece reintento", async () => {
    routes["/evidences/ev1/complete"] = () => Response.json(techError("EVIDENCE_CORRUPT", "validacion", false), { status: 422 });
    render(<ChatContainer documentId={DOC} />);
    await attach(pdf());
    expect(await screen.findByText("Motivo: EVIDENCE_CORRUPT")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reintentar carga/ })).not.toBeInTheDocument();
  });

  it("extracción fallida es reintentable y no vuelve a subir ni a completar", async () => {
    let attempt = 0;
    routes["/evidences/ev1/extraction"] = () => (++attempt === 1 ? Response.json(techError("AI_PROVIDER_ERROR", "ia", true), { status: 503 }) : ok({ extractionId: "x1" }));
    render(<ChatContainer documentId={DOC} />);
    await attach(pdf());
    await userEvent.click(await screen.findByRole("button", { name: /Reintentar carga de acta.pdf/ }));
    expect(await screen.findByText("Texto extraído")).toBeInTheDocument();
    expect(upload).toHaveBeenCalledOnce();
    expect(hits("/complete")).toHaveLength(1);
    expect(hits("/extraction")).toHaveLength(2);
  });

  it("extracción no reintentable queda como cargado sin extracción, sin éxito inventado", async () => {
    routes["/evidences/ev1/extraction"] = () => Response.json(techError("AI_NOT_CONFIGURED", "ia", false), { status: 500 });
    render(<ChatContainer documentId={DOC} />);
    await attach(pdf());
    expect(await screen.findByText("Cargado sin extracción")).toBeInTheDocument();
    expect(screen.queryByText("Texto extraído")).not.toBeInTheDocument();
  });

  it("tras extraer con un borrador vigente dispara el contraste; su fallo no bloquea", async () => {
    render(<ChatContainer documentId={DOC} />);
    await userEvent.type(screen.getByLabelText("Mensaje"), "Entregué 3 cajas");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByText(/Advertencia: Fecha dudosa/);
    const before = hits("/contrast").length;
    routes["/contrast"] = () => Response.json(techError("AI_PROVIDER_ERROR", "ia", true), { status: 503 });
    await attach(pdf());
    await waitFor(() => expect(hits("/contrast")).toHaveLength(before + 1));
    expect(await screen.findByText("Texto extraído")).toBeInTheDocument();
    expect(await screen.findByText("Control de consistencia no disponible")).toBeInTheDocument();
  });
});
