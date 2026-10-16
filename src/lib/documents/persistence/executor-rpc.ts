import "server-only";

import { Pool, type PoolConfig } from "pg";

import type { DocumentRpc } from "./store";
import { evidenceRpcCommands } from "../evidence/rpc-commands";

const commands = {
  ...evidenceRpcCommands,
  append_agent_message: ["p_actor_id", "p_document_id", "p_content", "p_declared_event_date", "p_key", "p_correlation_id"],
  append_document_audit: ["p_actor_id", "p_document_id", "p_type", "p_resource_id", "p_outcome", "p_correlation_id", "p_key"],
} as const;

interface ExecutorRpc extends DocumentRpc {
  close(): Promise<void>;
}

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

/** Solo composición de servidor después de Auth; sin conexión al importar. */
export function createExecutorRpc(verifiedUserId: string): ExecutorRpc | undefined {
  const raw = process.env.GALCOA_EXECUTOR_DATABASE_URL;
  if (!raw) return undefined;
  let pool: Pool | undefined;
  return {
    async close() { await pool?.end(); },
    async rpc(name, args) {
      try {
        if (!verifiedUserId || !Object.hasOwn(commands, name)) throw new Error();
        const command = (Object.keys(commands) as (keyof typeof commands)[]).find((key) => key === name)!;
        const keys = commands[command];
        if (!args || Object.keys(args).length !== keys.length ||
            keys.some((key) => !Object.hasOwn(args, key) || args[key] === undefined) ||
            args.p_actor_id !== verifiedUserId) throw new Error();
        if (!pool) {
          pool = new Pool(configuration(raw));
          pool.on("error", () => { /* No raw provider errors or credentials in logs. */ });
        }
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
