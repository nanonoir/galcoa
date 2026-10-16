import { z } from "zod";

/** Única ruta de objeto expuesta: permiso de carga autenticada del propietario. */
export const DirectUploadPermitSchema = z.strictObject({
  transport: z.literal("authenticated"), bucket: z.literal("evidences-private"),
  objectPath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  maxBytes: z.number().int().positive().max(10485760), expiresAt: z.string().datetime({ offset: true }),
});
