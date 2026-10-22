"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { z } from "zod";

import { AuthFormStateSchema, type AuthFormState } from "@/lib/contracts/auth-forms";

/**
 * Container común de los formularios de acceso (MVP-031): envía los valores a
 * un Route Handler de `/api/auth/*` y traduce la respuesta al estado de la
 * presentación. No contiene lógica de Auth ni valida políticas: el servidor es
 * la autoridad. Un fallo de red es un error recuperable, nunca un éxito.
 */

const ResponseSchema = z.object({ state: AuthFormStateSchema, redirectTo: z.string().optional() });

const NETWORK_ERROR = "No se pudo conectar con el servidor. Intenta nuevamente.";
const networkError: AuthFormState = { status: "error", message: NETWORK_ERROR, fieldErrors: [] };

/** Solo rutas internas absolutas; cualquier otra cosa se ignora. */
export function internalPath(value: string | undefined): string | null {
  return value && /^\/(?![/\\])/.test(value) ? value : null;
}

export function useAuthForm<TValues>(
  endpoint: string,
  /** Aviso opcional tras un éxito confirmado por el servidor (p. ej. medir el registro). No cambia el destino. */
  onSuccess?: () => void,
): { state: AuthFormState; submit: (values: TValues) => void } {
  const router = useRouter();
  const [state, setState] = useState<AuthFormState>({ status: "idle" });

  const submit = useCallback(
    (values: TValues) => {
      setState({ status: "submitting" });
      void (async () => {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(values),
          });
          const parsed = ResponseSchema.safeParse(await response.json());
          if (!parsed.success) return setState(networkError);
          setState(parsed.data.state);
          const target = internalPath(parsed.data.redirectTo);
          if (parsed.data.state.status === "success") onSuccess?.();
          if (parsed.data.state.status === "success" && target) {
            router.replace(target);
            // Descarta el caché del router: las páginas se vuelven a verificar con las cookies nuevas.
            router.refresh();
          }
        } catch {
          setState(networkError);
        }
      })();
    },
    [endpoint, router, onSuccess],
  );

  return { state, submit };
}
