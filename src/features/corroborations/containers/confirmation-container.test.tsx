import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PublicInvitation } from "@/lib/contracts/public";

import { ConfirmationContainer } from "./confirmation-container";

// Datos ficticios; la red es un doble.
const TOKEN = "T".repeat(43);
const invitation: PublicInvitation = {
  schemaVersion: 1,
  revisionId: "rev-1",
  snapshotId: "snap-1",
  snapshotHash: "a".repeat(64),
  role: "comprador",
  selection: ["autor", "comprador"],
  operation: { title: "Acuerdo ficticio", body: "Se entregan 12 cajas de ejemplo.", corrections: [] },
  warnings: [],
  availability: "disponible",
  expiresAt: "2026-10-19T12:00:00.000Z",
};

const persisted = (decision: "confirmar" | "rechazar" = "confirmar") => ({
  schemaVersion: 1,
  responseId: "resp-1",
  revisionId: "rev-1",
  snapshotId: "snap-1",
  snapshotHash: "a".repeat(64),
  respondedAt: "2026-10-16T12:00:00.000Z",
  replayed: false,
  confirmationStatus: decision === "confirmar" ? "parcial" : "rechazada",
  actor: { role: "comprador", declaredName: "Juan Pérez" },
  outcome: decision === "confirmar" ? { decision, checkboxChecked: true } : { decision, checkboxChecked: false, rejectionRatified: true },
});

const json = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type FetchMock = ReturnType<typeof vi.fn>;

function setup(fetchImpl: FetchMock) {
  let n = 0;
  render(
    <ConfirmationContainer
      token={TOKEN}
      initial={{ status: "ready", invitation }}
      fetchImpl={fetchImpl as unknown as typeof fetch}
      newKey={() => `clave-intencion-${++n}`}
    />,
  );
  return userEvent.setup();
}

async function fill(user: ReturnType<typeof userEvent.setup>, name = "Juan Pérez", check = true) {
  await user.type(screen.getByLabelText("Nombre completo"), name);
  if (check) await user.click(screen.getByRole("checkbox"));
}

const sentBody = (fetchImpl: FetchMock, call = 0) => JSON.parse((fetchImpl.mock.calls[call][1] as RequestInit).body as string);

describe("ConfirmationContainer", () => {
  it("confirmar envía el comando por POST con el token en el cuerpo, no en la URL, y muestra solo el resultado persistido", async () => {
    const fetchImpl = vi.fn(async () => json(persisted()));
    const user = setup(fetchImpl);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText("Registramos tu confirmación");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/confirm/respond");
    expect(url).not.toContain(TOKEN);
    expect(init.method).toBe("POST");
    expect(sentBody(fetchImpl)).toEqual({
      schemaVersion: 1,
      actor: "tercero",
      token: TOKEN,
      revisionId: "rev-1",
      snapshotId: "snap-1",
      snapshotHash: "a".repeat(64),
      declaredName: "Juan Pérez",
      decision: "confirmar",
      checkboxChecked: true,
      idempotencyKey: "clave-intencion-1",
    });
  });

  it("no hay éxito optimista: mientras el servidor no responde, solo ‘Enviando…’", async () => {
    let release: (r: Response) => void = () => {};
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    const user = setup(fetchImpl);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("button", { name: "Enviando…" })).toBeDisabled();
    expect(screen.queryByText(/Registramos/)).not.toBeInTheDocument();
    release(json(persisted()));
    await screen.findByText("Registramos tu confirmación");
  });

  it("el rechazo envía casilla vacía y ratificación; cancelar el modal no hace ninguna petición", async () => {
    const fetchImpl = vi.fn(async () => json(persisted("rechazar")));
    const user = setup(fetchImpl);
    await fill(user, "Juan Pérez", false);
    await user.click(screen.getByRole("button", { name: "No coincide / Rechazar" }));
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(fetchImpl).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "No coincide / Rechazar" }));
    await user.click(await screen.findByRole("button", { name: "Sí, rechazar" }));
    await screen.findByText("Registramos que no coincide");
    expect(sentBody(fetchImpl)).toMatchObject({ decision: "rechazar", checkboxChecked: false, rejectionRatified: true, declaredName: "Juan Pérez" });
  });

  it("un fallo de red permite reintentar con la misma clave y no duplica", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(json(persisted()));
    const user = setup(fetchImpl);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos enviar tu respuesta");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Registramos tu confirmación");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sentBody(fetchImpl, 0).idempotencyKey).toBe(sentBody(fetchImpl, 1).idempotencyKey);
  });

  it("cambiar de intención (otro nombre) usa otra clave", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ error: { code: "TECHNICAL_FAILURE" } }, 503)).mockResolvedValueOnce(json(persisted()));
    const user = setup(fetchImpl);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByRole("alert");
    await user.type(screen.getByLabelText("Nombre completo"), " Segundo");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText("Registramos tu confirmación");
    expect(sentBody(fetchImpl, 0).idempotencyKey).toBe("clave-intencion-1");
    expect(sentBody(fetchImpl, 1).idempotencyKey).toBe("clave-intencion-2");
  });

  it.each([
    [409, "ALREADY_RESPONDED", "Este enlace ya fue usado"],
    [410, "INVITATION_EXPIRED", "Este enlace venció"],
    [410, "REVISION_SUPERSEDED", "Esta revisión fue reemplazada"],
    [404, "NOT_AVAILABLE", "Enlace no disponible"],
  ])("respuesta %s %s → pantalla de enlace no disponible", async (status, code, title) => {
    const fetchImpl = vi.fn(async () => json({ error: { code } }, status));
    const user = setup(fetchImpl);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByText(title);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("límite de abuso (429): mensaje claro y se puede reintentar", async () => {
    const fetchImpl = vi.fn(async () => json({ error: { code: "RATE_LIMITED" } }, 429));
    const user = setup(fetchImpl);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esperá un minuto");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });

  it("una respuesta que no cumple el contrato no se muestra como éxito", async () => {
    const fetchImpl = vi.fn(async () => json({ ok: true }, 201));
    const user = setup(fetchImpl);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText(/Registramos/)).not.toBeInTheDocument();
  });
});
