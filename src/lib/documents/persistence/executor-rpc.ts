import "server-only";

import { Pool, type PoolConfig } from "pg";

import type { DocumentRpc } from "./store";
import { alcRpcCommands } from "../alc/rpc-commands";
import { contrastRpcCommands } from "../contrast/rpc-commands";
import { evidenceRpcCommands } from "../evidence/rpc-commands";
import { finalizationRpcCommands } from "../finalization/rpc-commands";
import { sealingRpcCommands } from "../sealing/rpc-commands";
import { turnRpcCommands } from "../turns/rpc-commands";

const commands = {
  ...alcRpcCommands,
  ...evidenceRpcCommands,
  ...turnRpcCommands,
  ...contrastRpcCommands,
  ...finalizationRpcCommands,
  ...sealingRpcCommands,
  append_agent_message: ["p_actor_id", "p_document_id", "p_content", "p_declared_event_date", "p_key", "p_correlation_id"],
  append_document_audit: ["p_actor_id", "p_document_id", "p_type", "p_resource_id", "p_outcome", "p_correlation_id", "p_key"],
} as const;

function configuration(raw: string): PoolConfig {
  const url = new URL(raw);
  const user = decodeURIComponent(url.username);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !/^galcoa_exec_login(?:\.[a-z0-9]+)?$/.test(user) || url.hash) throw new Error();
  // No URL options: pg can otherwise replace SSL configuration or inject options.
  if (url.search) throw new Error();
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
    if (user.includes(".") && user !== `galcoa_exec_login.${ref}`) throw new Error();
    const direct = url.hostname === `db.${ref}.supabase.co` && user === "galcoa_exec_login";
    const pooler = url.hostname.endsWith(".pooler.supabase.com") && user === `galcoa_exec_login.${ref}`;
    if (!direct && !pooler) throw new Error();
  }
  return {
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: true, ...(process.env.GALCOA_EXECUTOR_DATABASE_CA ? { ca: process.env.GALCOA_EXECUTOR_DATABASE_CA } : {}) },
    max: 2, connectionTimeoutMillis: 3000, query_timeout: 5000,
    idleTimeoutMillis: 1000, allowExitOnIdle: true,
  };
}

/** Owner aislado de recursos; close solo dispone SU pool, nunca el de otro owner. */
export function createExecutorRpcFactory() {
  let pool: Pool | undefined;
  let poolConfiguration: string | undefined;
  let closed = false;
  function getPool(raw: string) {
    if (closed) throw new Error();
    const config = configuration(raw);
    const key = JSON.stringify(config);
    // Rotación requiere reiniciar el owner/proceso; nunca acumular pools/configs.
    if (poolConfiguration && poolConfiguration !== key) throw new Error();
    if (!pool) {
      pool = new Pool(config);
      poolConfiguration = key;
      pool.on("error", () => { /* No raw provider errors or credentials in logs. */ });
    }
    return pool;
  }
  /** Cada wrapper retiene solo su actor; ningún consumidor recibe el pool. */
  function forUser(verifiedUserId: string): DocumentRpc | undefined {
    const raw = process.env.GALCOA_EXECUTOR_DATABASE_URL;
    if (!raw) return undefined;
    return {
      async rpc(name, args) {
        try {
          if (!verifiedUserId || !Object.hasOwn(commands, name)) throw new Error();
          const command = (Object.keys(commands) as (keyof typeof commands)[]).find((key) => key === name)!;
          const keys = commands[command];
          if (!args || Object.keys(args).length !== keys.length ||
              keys.some((key) => !Object.hasOwn(args, key) || args[key] === undefined) ||
              args.p_actor_id !== verifiedUserId) throw new Error();
          const pool = getPool(raw);
          const text = `select public.${command}(${keys.map((key, i) => `${key} => $${i + 1}`).join(", ")}) as result`;
          const result = await pool.query(text, keys.map((key) => args[key]));
          return { data: result.rows[0]?.result, error: null };
        } catch (error: unknown) {
          const code = typeof error === "object" && error !== null && "code" in error &&
            typeof error.code === "string" && ["42501", "22023", "23505", "57014"].includes(error.code)
            ? error.code : "EXECUTOR_UNAVAILABLE";
          return { data: null, error: { code } };
        }
      },
    };
  }
  return {
    forUser,
    async close() {
      if (closed) return;
      closed = true;
      await pool?.end();
    },
  };
}

// Un owner privado por proceso; importar/build no lee entorno ni conecta.
const processExecutor = createExecutorRpcFactory();
export const createExecutorRpc = processExecutor.forUser;
