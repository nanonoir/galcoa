import { readLocalStack, supabaseCli, waitForApi } from "./harness";

/**
 * Aplica TODAS las migraciones desde cero sobre la base local (`db reset`) antes
 * de la suite, de modo que la prueba cubre la reproducibilidad del esquema.
 * `RLS_SKIP_RESET=1` omite el reset (iteración rápida sobre una base ya migrada).
 */
export default async function setup(): Promise<void> {
  try {
    readLocalStack();
  } catch {
    throw new Error("Supabase local no está en marcha: ejecuta `npx supabase start` (requiere Docker) y reintenta.");
  }
  if (process.env.RLS_SKIP_RESET !== "1") supabaseCli(["db", "reset", "--local", "--no-seed"], 280_000);
  await waitForApi(readLocalStack());
}
