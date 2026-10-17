import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PublicVerificationSchema, type PublicVerification } from "@/lib/contracts/public";

import { MAX_PDF_BYTES, PublicVerifier, type PublicVerifierProps } from "./public-verifier";

const hash = (c: string) => c.repeat(64);

const proof = {
  envelope: { schemaVersion: 1, publicReference: "ref_abc", pdfHash: hash("a"), privateDetailHash: hash("b") },
  manifestHash: hash("c"),
  consensus: { topicId: "0.0.1234", network: "testnet", sequenceNumber: 42, consensusTimestamp: "2026-01-01T00:00:00.000Z" },
} as const;

function build(overrides: Record<string, unknown>): PublicVerification {
  return PublicVerificationSchema.parse({
    schemaVersion: 1,
    publicReference: "ref_abc",
    registrationStatus: "registrado",
    proof,
    fileCheck: { provided: false },
    ...overrides,
  });
}

function setup(verification: PublicVerification, props: Partial<PublicVerifierProps> = {}) {
  const onFileSelected = vi.fn();
  const view = render(<PublicVerifier verification={verification} onFileSelected={onFileSelected} {...props} />);
  return { ...view, onFileSelected, user: userEvent.setup({ applyAccept: false }) };
}

const pdf = (name = "a.pdf") => new File(["%PDF-1.7"], name, { type: "application/pdf" });
const input = () => screen.getByLabelText("Archivo PDF a comparar");

describe("PublicVerifier", () => {
  it("sin archivo muestra el registro y la prueba sin afirmar integridad", () => {
    setup(build({}));
    expect(screen.getByText("Registrado en Testnet")).toBeTruthy();
    expect(screen.getByText("0.0.1234")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
    expect(screen.getByText(/ningún archivo/)).toBeTruthy();
    expect(screen.queryByText(/coincide con el registro/)).toBeNull();
  });

  it("oculta la leyenda de «ningún archivo» cuando hay uno elegido aunque aún no haya resultado", async () => {
    const { user } = setup(build({}), { errorMessage: "Fallo de red" });
    expect(screen.getByText(/ningún archivo/)).toBeTruthy();
    await user.upload(input() as HTMLInputElement, pdf());
    expect(screen.queryByText(/ningún archivo/)).toBeNull();
  });

  it("sin prueba no muestra manifest, topic ni secuencia", () => {
    setup(build({ registrationStatus: "pendiente", proof: null }));
    expect(screen.getByText("Registro pendiente")).toBeTruthy();
    expect(screen.queryByText("Topic")).toBeNull();
    expect(screen.queryByRole("list", { name: "Prueba del registro" })).toBeNull();
    expect(screen.getByText(/no hay una prueba/)).toBeTruthy();
  });

  it.each([
    ["coincide", "El archivo coincide con el registro"],
    ["no_coincide", "El archivo no coincide con el registro"],
    ["no_verificable", "No se pudo verificar el archivo"],
  ])("muestra el resultado %s en una región live", (result, title) => {
    setup(build({ fileCheck: { provided: true, result } }));
    const live = screen.getByText(title).closest('[role="status"]');
    expect(live?.getAttribute("aria-live")).toBe("polite");
  });

  it("muestra verificando mientras el contenedor espera", () => {
    setup(build({}), { isVerifying: true });
    expect(screen.getByText(/Verificando el archivo/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Elegir PDF" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("entrega un PDF válido y permite quitarlo", async () => {
    const onClearFile = vi.fn();
    const { onFileSelected, user } = setup(build({}), { onClearFile });
    const file = pdf();
    await user.upload(input() as HTMLInputElement, file);
    expect(onFileSelected).toHaveBeenCalledWith(file);
    await user.click(screen.getByRole("button", { name: "Quitar archivo" }));
    expect(onClearFile).toHaveBeenCalledOnce();
    expect(screen.queryByText("a.pdf", { exact: false })).toBeNull();
  });

  it("rechaza archivos que no son PDF o superan 10 MiB sin llamar al callback", async () => {
    const { onFileSelected, user } = setup(build({}));
    await user.upload(input() as HTMLInputElement, new File(["x"], "a.txt", { type: "text/plain" }));
    expect(screen.getByRole("alert").textContent).toContain("debe ser un PDF");

    const big = pdf("big.pdf");
    Object.defineProperty(big, "size", { value: MAX_PDF_BYTES + 1 });
    await user.upload(input() as HTMLInputElement, big);
    expect(screen.getByRole("alert").textContent).toContain("10 MiB");
    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it("muestra el error del contenedor en una región de alerta", () => {
    setup(build({}), { errorMessage: "Sin conexión" });
    expect(screen.getByRole("alert").textContent).toContain("Sin conexión");
  });

  it("explica el alcance y evita el vocabulario prohibido", () => {
    const { container } = setup(build({ fileCheck: { provided: true, result: "coincide" } }));
    const text = container.textContent ?? "";
    expect(text).toMatch(/No acredita que los hechos/);
    expect(text).toMatch(/Testnet/);
    for (const banned of [/certificad/i, /validado regulatoriamente/i, /garantizado verdadero/i, /firma digital/i, /identidad verificada/i]) {
      expect(text).not.toMatch(banned);
    }
  });
});
