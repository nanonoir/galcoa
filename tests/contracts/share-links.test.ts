import { describe, expect, it } from "vitest";

import { buildMailtoUrl, buildShareText, buildWhatsAppUrl, SHARE_EMAIL_SUBJECT } from "@/features/corroborations/lib/share-links";

const LINK = "https://galcoa.example/confirm/abc123?x=1&y=2";

describe("share-links", () => {
  it("arma un texto genérico que incluye solo el enlace personal", () => {
    const text = buildShareText(LINK);
    expect(text).toContain(LINK);
    expect(text).toMatch(/^Te comparto una revisión de operación/);
  });

  it("wa.me codifica el texto completo, también & y ?", () => {
    const url = new URL(buildWhatsAppUrl(LINK));
    expect(url.origin + url.pathname).toBe("https://wa.me/");
    expect(url.searchParams.get("text")).toBe(buildShareText(LINK));
  });

  it("mailto lleva asunto y cuerpo codificados y sin destinatario", () => {
    const raw = buildMailtoUrl(LINK);
    expect(raw.startsWith("mailto:?")).toBe(true);
    const params = new URLSearchParams(raw.slice("mailto:?".length));
    expect(params.get("subject")).toBe(SHARE_EMAIL_SUBJECT);
    expect(params.get("body")).toBe(buildShareText(LINK));
  });

  it("no usa lenguaje prohibido por el PRD", () => {
    const all = `${buildShareText(LINK)} ${SHARE_EMAIL_SUBJECT}`.toLowerCase();
    for (const word of ["certificado", "validado regulatoriamente", "garantizado verdadero", "firma digital", "identidad verificada"]) {
      expect(all).not.toContain(word);
    }
  });

  it.each(["no es url", "javascript:alert(1)", "http://evil.example/x", "ftp://x.example/a"])("rechaza enlaces no compartibles: %s", (bad) => {
    expect(() => buildWhatsAppUrl(bad)).toThrow();
    expect(() => buildMailtoUrl(bad)).toThrow();
  });

  it("permite http solo en localhost", () => {
    expect(() => buildShareText("http://localhost:3000/confirm/t")).not.toThrow();
  });
});
