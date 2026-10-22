import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ParticipantSelector } from "./participant-selector";
import { ReviewProgress } from "./review-progress";
import { ShareLinksPanel } from "./share-links-panel";

describe("ParticipantSelector", () => {
  it("proveedor y comprador están siempre incluidos y no se pueden quitar", () => {
    render(<ParticipantSelector value={["autor", "comprador"]} locked={false} onChange={vi.fn()} />);
    for (const name of [/^Proveedor/, /^Comprador/]) {
      const box = screen.getByRole("checkbox", { name });
      expect(box).toBeChecked();
      expect(box).toBeDisabled();
    }
  });

  it("el transportista es opcional y emite una de las dos selecciones válidas", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ParticipantSelector value={["autor", "comprador"]} locked={false} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: /^Transportista/ }));
    expect(onChange).toHaveBeenLastCalledWith(["autor", "intermediario", "comprador"]);
    rerender(<ParticipantSelector value={["autor", "intermediario", "comprador"]} locked={false} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox", { name: /^Transportista/ }));
    expect(onChange).toHaveBeenLastCalledWith(["autor", "comprador"]);
  });

  it("con la selección fija no permite cambios y lo explica", () => {
    render(<ParticipantSelector value={["autor", "intermediario", "comprador"]} locked onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: /^Transportista/ })).toBeDisabled();
    expect(screen.getByText(/no se heredan/i)).toBeInTheDocument();
  });

  it("la sugerencia de la IA solo informa", () => {
    render(<ParticipantSelector value={["autor", "comprador"]} locked={false} suggestion={["autor", "intermediario", "comprador"]} onChange={vi.fn()} />);
    expect(screen.getByText(/sugerido por el asistente/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /^Transportista/ })).not.toBeChecked();
  });

  it("antes de congelar explica qué se congela; con la selección fija ya no lo repite", () => {
    const { rerender } = render(<ParticipantSelector value={["autor", "comprador"]} locked={false} onChange={vi.fn()} />);
    expect(screen.getByText(/Vas a congelar esta versión\. El comprador va a ver exactamente esto\./)).toBeInTheDocument();
    rerender(<ParticipantSelector value={["autor", "comprador"]} locked onChange={vi.fn()} />);
    expect(screen.queryByText(/Vas a congelar esta versión/)).not.toBeInTheDocument();
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

  it("vocabulario único: «Registro en Hedera» y glosario plegado «¿Qué significa?»", () => {
    const { container } = render(<ReviewProgress {...base} participants={[...base.participants]} confirmationStatus="pendiente" finalizedVersionNumber={null} hcsStatus="no_iniciado" />);
    expect(screen.getByText("Registro en Hedera (independiente de la finalización)")).toBeInTheDocument();
    const glossary = container.querySelector("details");
    expect(glossary).not.toBeNull();
    expect(within(glossary as HTMLElement).getByText("¿Qué significa?")).toBeInTheDocument();
    expect(glossary).toHaveTextContent("Rojo: hay una diferencia o algo ilegible, y así no se finaliza.");
    const outside = container.cloneNode(true) as HTMLElement;
    outside.querySelectorAll("details").forEach((d) => d.remove());
    expect(outside.textContent).not.toMatch(/sello hcs|hash|snapshot|topic|contraste/i);
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
    await userEvent.setup().click(screen.getByRole("button", { name: /generar enlace nuevo para transportista/i }));
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

  it("después de congelar dice qué hacer: confirmar como proveedor y mandar el enlace", () => {
    render(<ShareLinksPanel links={[item]} onCopy={vi.fn()} onReissue={vi.fn()} />);
    expect(screen.getByText(/Confirmá vos como proveedor y mandale el enlace al comprador por WhatsApp, correo o QR\./)).toBeInTheDocument();
  });

  it("sin terceros no hay enlaces", () => {
    render(<ShareLinksPanel links={[]} onCopy={vi.fn()} onReissue={vi.fn()} />);
    expect(screen.getByText(/no hay otros participantes/i)).toBeInTheDocument();
  });
});
