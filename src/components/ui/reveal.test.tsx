import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Reveal } from "./reveal";

type ObserverInit = IntersectionObserverInit | undefined;

describe("Reveal", () => {
  const created: { options: ObserverInit }[] = [];

  beforeEach(() => {
    created.length = 0;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(_cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          created.push({ options });
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mockTop(top: number) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top } as DOMRect);
  }

  it("no oculta contenido que ya asoma por el borde inferior", () => {
    mockTop(window.innerHeight - 1);
    render(<Reveal data-testid="r">hola</Reveal>);
    expect(screen.getByTestId("r").dataset.reveal).toBeUndefined();
    expect(created).toHaveLength(0);
  });

  it("oculta lo que está debajo del viewport y observa con frontera 0 (sin margen negativo)", () => {
    mockTop(window.innerHeight + 200);
    render(<Reveal data-testid="r">hola</Reveal>);
    expect(screen.getByTestId("r").dataset.reveal).toBe("pending");
    expect(created).toHaveLength(1);
    expect(created[0].options?.rootMargin).toBe("0px");
  });

  it("sin IntersectionObserver el contenido queda visible", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("IntersectionObserver", undefined);
    mockTop(window.innerHeight + 200);
    render(<Reveal data-testid="r">hola</Reveal>);
    expect(screen.getByTestId("r").dataset.reveal).toBeUndefined();
  });
});
