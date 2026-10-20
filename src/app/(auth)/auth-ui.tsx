import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";

const NOTICES = {
  confirmado: "Cuenta confirmada. Ya puedes iniciar sesión.",
  "contrasena-actualizada": "Contraseña actualizada. Inicia sesión con la nueva.",
  "enlace-invalido": "El enlace no es válido o venció. Solicita uno nuevo.",
} as const;

/** Aviso a partir del parámetro `aviso`: solo claves conocidas, nunca texto de la URL. */
export function AuthNotice({ aviso }: { aviso?: string | string[] }) {
  const key = typeof aviso === "string" && Object.hasOwn(NOTICES, aviso) ? (aviso as keyof typeof NOTICES) : null;
  if (!key) return null;
  return (
    <Alert className="w-full max-w-md" data-testid="auth-notice">
      <AlertDescription>{NOTICES[key]}</AlertDescription>
    </Alert>
  );
}

export function AuthLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <nav aria-label="Otras opciones de acceso" className="flex w-full max-w-md flex-col text-base">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="inline-flex min-h-11 items-center underline underline-offset-4 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
