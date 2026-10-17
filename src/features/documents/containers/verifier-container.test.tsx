import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PublicVerificationSchema } from "@/lib/contracts/public";

import { VerifierContainer } from "./verifier-container";

const hash = (c: string) => c.repeat(64);
const verification = (fileCheck: unknown, proof: unknown = null, registrationStatus = "pendiente") =>
  PublicVerificationSchema.parse({ schemaVersion: 1, publicReference: "ref_abc", registrationStatus, proof, fileCheck });
const proof = {
  envelope: { schemaVersion: 1, publicReference: "ref_abc", pdfHash: hash("a"), privateDetailHash: hash("b") },
  manifestHash: hash("c"),
  consensus: { topicId: "0.0.1234", network: "testnet", sequenceNumber: 42, consensusTimestamp: "2026-01-01T00:00:00.000Z" },
};
const initial = verification({ provided: false });
const pdf = new File(["%PDF-1.7"], "a.pdf", { type: "application/pdf" });
const input = () => screen.getByLabelText("Archivo PDF a comparar") as HTMLInputElement;

describe("VerifierContainer (MVP-101)", () => {
  it("sube el PDF por multipart al endpoint propio y muestra el resultado del servidor", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(verification({ provided: true, result: "coincide" }, proof, "registrado")),
    );
    render(<VerifierContainer reference="ref_abc" initial={initial} fetchImpl={fetchImpl as never} />);
    await userEvent.upload(input(), pdf);
    expect(await screen.findByText("El archivo coincide con el registro")).toBeTruthy();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/verify/ref_abc");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(screen.queryByText(/ningún archivo/)).toBeNull();
  });

  it.each([
    [413, "El archivo supera el máximo de 10 MiB."],
    [400, "El archivo debe ser un PDF."],
    [429, "Hiciste muchos intentos seguidos. Esperá un minuto y reintentá."],
    [503, "No pudimos verificar el archivo. Probá de nuevo en unos minutos."],
  ])("error %s: mensaje claro, sin inventar un resultado", async (status, message) => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { code: "X" } }, { status }));
    render(<VerifierContainer reference="ref_abc" initial={initial} fetchImpl={fetchImpl as never} />);
    await userEvent.upload(input(), pdf);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText(/coincide con el registro/)).toBeNull();
    // Hay archivo elegido: la leyenda de «sin archivo» no se muestra.
    expect(screen.queryByText(/ningún archivo/)).toBeNull();
  });

  it("una respuesta con forma inválida o un fallo de red no es un resultado", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ ok: true })).mockRejectedValueOnce(new TypeError("fetch failed"));
    render(<VerifierContainer reference="ref_abc" initial={initial} fetchImpl={fetchImpl as never} />);
    await userEvent.upload(input(), pdf);
    expect(await screen.findByText(/No pudimos verificar el archivo/)).toBeTruthy();
    await userEvent.upload(input(), new File(["%PDF-1.7"], "b.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/No pudimos verificar el archivo/)).toBeTruthy();
  });

  it("quitar el archivo vuelve al estado inicial", async () => {
    const fetchImpl = vi.fn(async () => Response.json(verification({ provided: true, result: "no_verificable" })));
    render(<VerifierContainer reference="ref_abc" initial={initial} fetchImpl={fetchImpl as never} />);
    await userEvent.upload(input(), pdf);
    expect(await screen.findByText("No se pudo verificar el archivo")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Quitar archivo" }));
    expect(screen.queryByText("No se pudo verificar el archivo")).toBeNull();
    expect(screen.getByText(/ningún archivo/)).toBeTruthy();
  });
});
