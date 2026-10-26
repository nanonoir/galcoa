import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackOnce, visitorId } from "./track";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window.navigator, "doNotTrack", { value: null, configurable: true });
  window.localStorage.clear();
});

describe("trackOnce", () => {
  it("con «Do Not Track» no persiste la marca, no envía y elimina el identificador previo", () => {
    visitorId();
    expect(window.localStorage.getItem("galcoa.visitor")).not.toBeNull();
    Object.defineProperty(window.navigator, "doNotTrack", { value: "1", configurable: true });
    trackOnce("paso", "landing_viewed");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("galcoa.once.paso")).toBeNull();
    expect(window.localStorage.getItem("galcoa.visitor")).toBeNull();
  });

  it("sin «Do Not Track» envía una vez y guarda la marca", () => {
    trackOnce("paso", "landing_viewed");
    trackOnce("paso", "landing_viewed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("galcoa.once.paso")).toBe("1");
  });
});
