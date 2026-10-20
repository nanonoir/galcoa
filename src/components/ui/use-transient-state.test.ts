import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTransientState } from "./use-transient-state";

describe("useTransientState", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("vuelve a reposo tras el plazo y un nuevo valor reinicia el temporizador", () => {
    const { result } = renderHook(() => useTransientState("idle" as "idle" | "copied", 2000));
    act(() => result.current[1]("copied"));
    expect(result.current[0]).toBe("copied");
    act(() => vi.advanceTimersByTime(1500));
    act(() => result.current[1]("copied"));
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current[0]).toBe("copied");
    act(() => vi.advanceTimersByTime(600));
    expect(result.current[0]).toBe("idle");
  });

  it("limpia el temporizador al desmontar", () => {
    const { result, unmount } = renderHook(() => useTransientState("idle" as "idle" | "copied"));
    act(() => result.current[1]("copied"));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
