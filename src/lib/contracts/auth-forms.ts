import { z } from "zod";

/**
 * Contratos de presentación de los formularios de acceso (MVP-115; PRD REQ-01).
 * Solo forma: las reglas de contraseña y la autenticación real son de MVP-031.
 * El error global llega ya redactado por el container y no debe revelar si una
 * cuenta existe.
 */

export const AuthFormKindSchema = z.enum(["login", "register", "recovery_request", "new_password"]);

export const AuthFieldSchema = z.enum(["email", "password", "confirmPassword"]);

export const AuthFieldErrorSchema = z.strictObject({
  field: AuthFieldSchema,
  message: z.string().min(1),
});

export const AuthFormStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("idle") }),
  z.strictObject({ status: z.literal("submitting") }),
  z
    .strictObject({
      status: z.literal("error"),
      /** Mensaje global ya redactado; `null` si solo hay errores por campo. */
      message: z.string().min(1).nullable(),
      fieldErrors: z.array(AuthFieldErrorSchema),
    })
    .refine((s) => s.message !== null || s.fieldErrors.length > 0, {
      message: "El error trae un mensaje global o al menos un error de campo",
      path: ["message"],
    }),
  z.strictObject({ status: z.literal("success"), message: z.string().min(1) }),
]);

export const LoginValuesSchema = z.strictObject({ email: z.string(), password: z.string() });
export const RegisterValuesSchema = z.strictObject({
  email: z.string(),
  password: z.string(),
  confirmPassword: z.string(),
});
export const RecoveryRequestValuesSchema = z.strictObject({ email: z.string() });
export const NewPasswordValuesSchema = z.strictObject({
  password: z.string(),
  confirmPassword: z.string(),
});

export type AuthFormKind = z.infer<typeof AuthFormKindSchema>;
export type AuthField = z.infer<typeof AuthFieldSchema>;
export type AuthFieldError = z.infer<typeof AuthFieldErrorSchema>;
export type AuthFormState = z.infer<typeof AuthFormStateSchema>;
export type LoginValues = z.infer<typeof LoginValuesSchema>;
export type RegisterValues = z.infer<typeof RegisterValuesSchema>;
export type RecoveryRequestValues = z.infer<typeof RecoveryRequestValuesSchema>;
export type NewPasswordValues = z.infer<typeof NewPasswordValuesSchema>;
