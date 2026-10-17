import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ParticipantSelection } from "@/lib/contracts/review";

import { ParticipantSelector } from "./participant-selector";
import { ReviewProgress } from "./review-progress";
import { ShareLinksPanel } from "./share-links-panel";

describe("ParticipantSelector", () => {
  it("el autor está siempre incluido y no se puede quitar", () => {
    render(<ParticipantSelector value={["autor"]} locked={false} onChange={vi.fn()} />);
    const author = screen.getByRole("checkbox", { name: /autor \(vos\)/i });
    expect(author).toBeChecked();
    expect(author).toBeDisabled();
  });

  it.each<[string[], ParticipantSelection, ParticipantSelection]>([
    [["Intermediario"], ["autor"], ["autor", "intermediario"]],
    [["Comprador"], ["autor"], ["autor", "comprador"]],
    [["Intermediario", "Comprador"], ["autor"], ["autor", "intermediario", "comprador"]],
  ])("elige %j y emite una de las cuatro combinaciones canónicas", async (clicks, start, expected) => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ParticipantSelector value={start} locked={false} onChange={onChange} />);
    let current = start;
    for (const name of clicks) {
      await user.click(screen.getByRole("checkbox", { name }));
      current = onChange.mock.lastCall![0] as ParticipantSelection;
      rerender(<ParticipantSelector value={current} locked={false} onChange={onChange} />);
    }
    expect(current).toEqual(expected);
  });

  it("deseleccionar vuelve a solo autor", async () => {
    const onChange = vi.fn();
    render(<ParticipantSelector value={["autor", "comprador"]} locked={false} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Comprador" }));
    expect(onChange).toHaveBeenCalledWith(["autor"]);
  });

  it("con la selección fija no permite cambios y lo explica", () => {
    render(<ParticipantSelector value={["autor", "intermediario"]} locked onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Intermediario" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Comprador" })).toBeDisabled();
    expect(screen.getByText(/no se heredan/i)).toBeInTheDocument();
  });

  it("la sugerencia de la IA solo informa", () => {
    render(<ParticipantSelector value={["autor"]} locked={false} suggestion={["autor", "comprador"]} onChange={vi.fn()} />);
    expect(screen.getByText(/sugerido por el asistente/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /^Comprador/ })).not.toBeChecked();
  });
});

describe("ReviewProgress", () => {
  const base = {
    revisionLabel: "Revisión 2",
    participants: [
      { role: "autor", progress: "confirmada" },
      { role: "comprador", progress: "pendiente" },
    ] as const,
    refreshing: false,
    onRefresh: vi.fn(),
  };

  it("muestra los tres indicadores por separado: sello pendiente no es no finalizado", () => {
    render(<ReviewProgress {...base} participants={[...base.participants]} confirmationStatus="completa" finalizedVersionNumber={2} hcsStatus="pendiente" />);
    expect(screen.getByText("Versión 2 finalizada")).toBeInTheDocument();
    expect(screen.getByText("Sello pendiente")).toBeInTheDocument();
    expect(screen.getByText("Todos confirmaron")).toBeInTheDocument();
  });

  it("sello fallido sigue siendo pendiente y la finalización no cambia", () => {
    render(<ReviewProgress {...base} participants={[...base.participants]} confirmationStatus="completa" finalizedVersionNumber={1} hcsStatus="fallido" />);
    expect(screen.getByText(/Sello pendiente: el último intento/)).toBeInTheDocument();
    expect(screen.getByText("Versión 1 finalizada")).toBeInTheDocument();
    expect(screen.queryByText("Sello registrado")).not.toBeInTheDocument();
  });

  it("si el origen no trae el número de versión lo dice en vez de afirmar que no está finalizada", () => {
    render(<ReviewProgress {...base} participants={[...base.participants]} confirmationStatus="completa" finalizedVersionNumber="no_disponible" hcsStatus="registrado" />);
    expect(screen.getByText(/número de versión finalizada no disponible/i)).toBeInTheDocument();
    expect(screen.queryByText(/todavía no finalizada/i)).not.toBeInTheDocument();
  });

  it("rechazo se comunica como respuesta de negocio con su siguiente paso", () => {
    render(<ReviewProgress {...base} participants={[{ role: "autor", progress: "confirmada" }, { role: "comprador", progress: "rechazada" }]} confirmationStatus="rechazada" finalizedVersionNumber={null} hcsStatus="no_iniciado" />);
    expect(screen.getByText(/abrí otra revisión/i)).toBeInTheDocument();
    expect(screen.getByText("Todavía no finalizada")).toBeInTheDocument();
  });

  it("actualizar llama al callback y se deshabilita mientras carga", async () => {
    const onRefresh = vi.fn();
    const { rerender } = render(<ReviewProgress {...base} participants={[...base.participants]} onRefresh={onRefresh} confirmationStatus="pendiente" finalizedVersionNumber={null} hcsStatus="no_iniciado" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Actualizar avance" }));
    expect(onRefresh).toHaveBeenCalledOnce();
    rerender(<ReviewProgress {...base} participants={[...base.participants]} refreshing confirmationStatus="pendiente" finalizedVersionNumber={null} hcsStatus="no_iniciado" />);
    expect(screen.getByRole("button", { name: /Actualizando/ })).toBeDisabled();
  });
});

describe("ShareLinksPanel", () => {
  const link = "https://galcoa.example/confirm/tok1";
  const item = { role: "comprador" as const, url: link, whatsappUrl: "https://wa.me/?text=x", mailtoUrl: "mailto:?subject=x" };

  it("un enlace por tercero con copiar, WhatsApp y correo", async () => {
    const onCopy = vi.fn();
    render(<ShareLinksPanel links={[item]} onCopy={onCopy} onReissue={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /copiar enlace de comprador/i }));
    expect(onCopy).toHaveBeenCalledWith(link);
    expect(await screen.findByText("Copiado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /whatsapp para comprador/i })).toHaveAttribute("href", item.whatsappUrl);
    expect(screen.getByRole("link", { name: /correo para comprador/i })).toHaveAttribute("href", item.mailtoUrl);
  });

  it("si copiar falla lo dice y no marca copiado", async () => {
    render(<ShareLinksPanel links={[item]} onCopy={() => Promise.reject(new Error("x"))} onReissue={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /copiar enlace/i }));
    expect(await screen.findByText(/No se pudo copiar/)).toBeInTheDocument();
    expect(screen.queryByText("Copiado")).not.toBeInTheDocument();
  });

  it("sin enlace en claro ofrece generar uno nuevo y no muestra compartir", async () => {
    const onReissue = vi.fn();
    render(<ShareLinksPanel links={[{ role: "intermediario", url: null, whatsappUrl: null, mailtoUrl: null }]} onCopy={vi.fn()} onReissue={onReissue} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /generar enlace nuevo para intermediario/i }));
    expect(onReissue).toHaveBeenCalledWith("intermediario");
  });

  it("el QR lo aporta el container con etiqueta accesible", () => {
    render(<ShareLinksPanel links={[item]} onCopy={vi.fn()} onReissue={vi.fn()} renderQr={(_url, label) => <div role="img" aria-label={label} />} />);
    expect(screen.getByRole("img", { name: /código qr del enlace de comprador/i })).toBeInTheDocument();
  });

  it("aclara que la aplicación no envía nada y no usa lenguaje prohibido", () => {
    const { container } = render(<ShareLinksPanel links={[item]} onCopy={vi.fn()} onReissue={vi.fn()} />);
    expect(within(container).getByText(/no manda correos ni mensajes/i)).toBeInTheDocument();
    const text = container.textContent!.toLowerCase();
    for (const w of ["certificado", "firma digital", "identidad verificada", "garantizado verdadero"]) expect(text).not.toContain(w);
  });

  it("sin terceros no hay enlaces", () => {
    render(<ShareLinksPanel links={[]} onCopy={vi.fn()} onReissue={vi.fn()} />);
    expect(screen.getByText(/no hay otros participantes/i)).toBeInTheDocument();
  });
});
