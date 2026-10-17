import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareQr } from "./share-qr";

afterEach(() => vi.unstubAllGlobals());

describe("ShareQr", () => {
  it("dibuja un SVG local con etiqueta accesible, sin usar la red", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<ShareQr url="https://galcoa.example/confirm/tok-1" label="Código QR del enlace de comprador" />);

    const qr = screen.getByRole("img", { name: "Código QR del enlace de comprador" });
    expect(qr.tagName.toLowerCase()).toBe("svg");
    expect(container.querySelector("svg path")).not.toBeNull();
    expect(container.querySelector("img, iframe")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no filtra el enlace como texto del SVG (solo se codifica en el dibujo)", () => {
    const { container } = render(<ShareQr url="https://galcoa.example/confirm/tok-1" label="QR" />);
    expect(container.innerHTML).not.toContain("tok-1");
  });
});
