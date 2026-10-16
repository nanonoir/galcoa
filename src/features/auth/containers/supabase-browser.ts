"use client";

import { createBrowserClient } from "@supabase/ssr";
import { DirectUploadPermitSchema } from "../contracts/evidence-upload";

/** Carga estándar con la sesión cookie existente; sin token de upload firmado. */
export async function uploadReservedEvidence(permission: unknown, file: File): Promise<void> {
  const permit = DirectUploadPermitSchema.parse(permission);
  if (file.size !== permit.maxBytes || file.type !== permit.contentType) throw new Error("Archivo incompatible con la reserva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Carga no disponible");
  const client = createBrowserClient(url, key);
  const { data, error: authError } = await client.auth.getUser();
  if (authError || !data.user) throw new Error("Sesión no disponible");
  const { error } = await client.storage.from(permit.bucket).upload(permit.objectPath, file, {
    upsert: false, contentType: permit.contentType,
  });
  if (error) throw new Error("No se pudo cargar el archivo");
}
