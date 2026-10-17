import { execFileSync } from "node:child_process";

/**
 * Consultas de solo lectura a la base local (contenedor de `supabase/config.toml`) para
 * comprobar lo persistido por el producto real. Los ids interpolados vienen de la siembra.
 */
const DB_CONTAINER = "supabase_db_galcoa";
const DOCKER = process.platform === "win32" ? "docker.exe" : "docker";

export function sql(query: string): string[][] {
  const out = execFileSync(DOCKER, ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-F", "|", "-v", "ON_ERROR_STOP=1"], {
    input: query,
    encoding: "utf8",
    timeout: 30_000,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return out.split(/\r?\n/).filter(Boolean).map((line) => line.split("|"));
}

export const count = (query: string): number => Number(sql(query)[0]?.[0]);
export const value = (query: string): string => sql(query)[0]?.[0] ?? "";
