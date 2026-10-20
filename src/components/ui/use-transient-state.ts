import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Estado que vuelve solo a reposo (p. ej. «Copiado» → «Copiar»). Un nuevo valor
 * reinicia el temporizador y el desmontaje lo limpia, así no queda ningún
 * `setState` pendiente sobre un componente que ya no existe.
 */
export function useTransientState<T>(rest: T, ms = 2000) {
  const [value, setValue] = useState<T>(rest);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const set = useCallback(
    (next: T, holdMs = ms) => {
      clearTimeout(timer.current);
      setValue(next);
      if (next !== rest) timer.current = setTimeout(() => setValue(rest), holdMs);
    },
    [rest, ms],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return [value, set] as const;
}
