import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLockup } from "./brand-lockup";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("BrandLockup", () => {
  it("muestra GALCOA+ y el logo de Hedera como fondos CSS con nombre accesible, sin <img>", () => {
    const { container } = render(<BrandLockup />);
    expect(screen.getByText("GALCOA+")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Hedera" })).toBeInTheDocument();
    expect(container.querySelector("img, svg, canvas")).toBeNull();
  });

  it("usa los SVG reales de public/, sin placa ni fondo blanco, y no crece más que la cabecera de 64 px", () => {
    expect(css).toContain("url('/galcoa-on-navy.svg')");
    expect(css).toContain("url('/hedera-on-navy.svg')");
    expect(existsSync(resolve(process.cwd(), "public/galcoa-on-navy.svg"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "public/hedera-on-navy.svg"))).toBe(true);
    expect(css).not.toContain("hedera-plate");
    const heights = [...css.matchAll(/\.(?:galcoa-brand|hedera-logo)\s*\{[^}]*?height:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(heights.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...heights)).toBeLessThanOrEqual(48);
  });
});
