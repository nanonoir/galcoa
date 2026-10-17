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
    <Alert className="mx-auto w-full max-w-sm" data-testid="auth-notice">
      <AlertDescription>{NOTICES[key]}</AlertDescription>
    </Alert>
  );
}

export function AuthLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <nav aria-label="Otras opciones de acceso" className="mx-auto flex w-full max-w-sm flex-col gap-1 text-sm">
      {links.map(({ href, label }) => (
        <Link key={href} href={href} className="underline underline-offset-4">
          {label}
        </Link>
      ))}
    </nav>
  );
}
