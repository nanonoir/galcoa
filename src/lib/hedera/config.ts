import "server-only";

/**
 * Configuración de Hedera (MVP-090; PRD §9, INV-06; manifest-hcs §3).
 * **Solo Testnet.** Se lee al usar, nunca al importar ni en `build`. Una red
 * distinta, ausente o mal escrita se rechaza sin fallback. Los errores no
 * incluyen valores ni la clave del operador.
 */

export const HEDERA_NETWORK_ENV = "HEDERA_NETWORK";
export const HEDERA_OPERATOR_ID_ENV = "HEDERA_OPERATOR_ID";
export const HEDERA_OPERATOR_KEY_ENV = "HEDERA_OPERATOR_KEY";
export const HEDERA_TOPIC_ID_ENV = "HEDERA_TOPIC_ID";

/** Origen Mirror confiable del diseño: no lo elige el navegador ni un dato persistido. */
export const TESTNET_MIRROR_ORIGIN = "https://testnet.mirrornode.hedera.com";

/** Plazos aprobados el 2026-10-16 (manifest-hcs §8): envío y recibo 20 s; cada consulta Mirror 10 s. */
export const HEDERA_TIMEOUTS = { submitMs: 20_000, mirrorQueryMs: 10_000 } as const;

export type EnvReader = (name: string) => string | undefined;
const readProcessEnv: EnvReader = (name) => process.env[name];

export type HederaConfig = {
  network: "testnet";
  operatorId: string;
  operatorKey: string;
  topicId: string;
  mirrorOrigin: typeof TESTNET_MIRROR_ORIGIN;
};

export class HederaConfigError extends Error {
  readonly stage = "hcs";
  readonly retryable = false;
  constructor(readonly code: "HEDERA_CONFIG_MISSING" | "HEDERA_NETWORK_NOT_ALLOWED") {
    super(code === "HEDERA_NETWORK_NOT_ALLOWED" ? "Solo se admite Hedera Testnet." : "Falta configuración de Hedera.");
    this.name = "HederaConfigError";
  }
}

const ENTITY_ID = /^0\.0\.\d+$/;

export function readHederaConfig(readEnv: EnvReader = readProcessEnv): HederaConfig {
  const read = (name: string) => readEnv(name)?.trim() || undefined;
  const network = read(HEDERA_NETWORK_ENV);
  if (network !== undefined && network !== "testnet") throw new HederaConfigError("HEDERA_NETWORK_NOT_ALLOWED");
  const operatorId = read(HEDERA_OPERATOR_ID_ENV);
  const operatorKey = read(HEDERA_OPERATOR_KEY_ENV);
  const topicId = read(HEDERA_TOPIC_ID_ENV);
  if (!network || !operatorId || !operatorKey || !topicId || !ENTITY_ID.test(operatorId) || !ENTITY_ID.test(topicId)) {
    throw new HederaConfigError("HEDERA_CONFIG_MISSING");
  }
  return { network: "testnet", operatorId, operatorKey, topicId, mirrorOrigin: TESTNET_MIRROR_ORIGIN };
}
