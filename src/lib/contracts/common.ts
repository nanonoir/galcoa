import { z } from "zod";

/**
 * Primitivas compartidas de los contratos de dominio. Solo JSON: sin Date, File
 * ni Buffer. Sin React, SDK, entorno ni cálculo criptográfico: el contrato fija
 * la forma del hash, no su cómputo (lo hacen los consumidores, SH-03).
 */

export const IdSchema = z.string().min(1);

/** Instante del servidor: ISO 8601 en UTC (sufijo `Z`). */
export const InstantSchema = z.iso.datetime();

/** SHA-256 hexadecimal en minúsculas (64 caracteres). */
export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, "SHA-256 hexadecimal en minúsculas");

/** Versión de esquema de las estructuras persistidas o públicas nuevas (SH-02). */
export const SchemaVersionSchema = z.literal(1);

export type Sha256Hex = z.infer<typeof Sha256HexSchema>;
