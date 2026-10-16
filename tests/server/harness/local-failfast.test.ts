import { describe, expect, it, vi } from "vitest";

vi.mock("../rls/harness", () => ({
  readLocalStack: vi.fn(() => {
    throw new Error("La pila local de Supabase no está en marcha");
  }),
  supabaseCli: vi.fn(),
  waitForApi: vi.fn(),
}));

import setup from "../rls/global-setup";
import { supabaseCli } from "../rls/harness";

describe("base local sin prerrequisitos", () => {
  it("el globalSetup falla explícitamente (no omite la suite) y no intenta migrar", async () => {
    await expect(setup()).rejects.toThrow(/Supabase local no está en marcha.*Docker/);
    expect(supabaseCli).not.toHaveBeenCalled();
  });
});
