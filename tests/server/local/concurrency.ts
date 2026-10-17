import { psql, type SqlResult } from "../rls/harness";

/**
 * Concurrencia real del harness (MVP-120; SH-09). Reutiliza los helpers de MVP-024
 * (`tests/server/rls/harness.ts`): cada llamada abre su PROPIA conexión (un `psql` por
 * llamada en el contenedor de Postgres local, o un cliente Auth/API con sesión propia).
 * No usar `Promise.all` sobre un doble en memoria para simular contención.
 */

/** Lanza `count` tareas a la vez y devuelve todos los resultados (también los rechazos). */
export function runIndependent<T>(count: number, task: (index: number) => Promise<T>): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(Array.from({ length: count }, (_, index) => task(index)));
}

/**
 * Ejecuta el mismo script SQL en `count` conexiones independientes. Cada script debe
 * imprimir `select pg_backend_pid();` para que la aserción de independencia sea comprobable.
 */
export async function runSqlOnIndependentConnections(
  count: number,
  sql: string,
  databaseUser: Parameters<typeof psql>[1] = "postgres",
): Promise<SqlResult[]> {
  const settled = await runIndependent(count, () => psql(sql, databaseUser));
  return settled.map((item) => {
    if (item.status === "rejected") throw item.reason;
    return item.value;
  });
}

/** PID de backend impreso por el script (primera fila de una sola columna numérica). */
export function backendPid(result: SqlResult): number {
  const pid = result.rows.map((row) => Number(row[0])).find((value) => Number.isInteger(value) && value > 0);
  if (pid === undefined) throw new Error("El script no imprimió pg_backend_pid()");
  return pid;
}

/** Exige que todas las conexiones fueran backends de Postgres distintos. */
export function distinctBackends(results: readonly SqlResult[]): number {
  return new Set(results.map(backendPid)).size;
}

