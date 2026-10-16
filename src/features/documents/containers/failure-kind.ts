/**
 * Clasificación de un fallo del servicio de documentos para las páginas (MVP-116).
 * `NO_SESSION` (sesión vencida a mitad de la petición) se trata como acceso, no
 * como error técnico; ajeno e inexistente son lo mismo (`NOT_AVAILABLE`).
 */
export type FailureKind = "unauthenticated" | "not_found" | "technical";

export function failureKind(error: { code: string }): FailureKind {
  if (error.code === "NO_SESSION") return "unauthenticated";
  if (error.code === "NOT_AVAILABLE") return "not_found";
  return "technical";
}
