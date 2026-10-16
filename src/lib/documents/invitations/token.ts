import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Token privado de invitación (MVP-072; docs/specs/public-capabilities.md §8).
 *
 * 32 bytes de CSPRNG en base64url sin relleno (43 caracteres). En la base solo
 * se guarda el SHA-256; el texto plano se entrega una única vez y nunca se
 * registra. Un token con otra forma es «no disponible» sin consultar la base.
 */

export const INVITATION_TTL_SECONDS = 72 * 3600;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const generateInvitationToken = () => randomBytes(32).toString("base64url");

export const isWellFormedToken = (token: unknown): token is string => typeof token === "string" && TOKEN_PATTERN.test(token);

export const hashInvitationToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
