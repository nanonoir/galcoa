import { redirect } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { NewPasswordContainer } from "@/features/auth/containers/auth-containers";
import { getCurrentSession, type SessionCheck } from "@/lib/supabase/auth";
import { MESSAGES } from "@/lib/supabase/auth-flows";

import { AuthLinks } from "../auth-ui";

async function checkSession(check: () => Promise<SessionCheck>): Promise<SessionCheck> {
  try {
    return await check();
  } catch {
    // Configuración ausente o fallo del proveedor: impedimento técnico, no «sin sesión».
    return { status: "unavailable" };
  }
}

/** Solo con la sesión de recuperación creada por el enlace del correo; sin ella, se pide otro enlace. */
export default async function NuevaContrasenaPage() {
  const session = await checkSession(getCurrentSession);
  if (session.status === "anonymous") redirect("/recuperar?aviso=enlace-invalido");
  if (session.status === "unavailable") {
    return (
      <>
        <Alert variant="destructive" className="mx-auto w-full max-w-sm" data-testid="auth-unavailable">
          <AlertDescription>{MESSAGES.unavailable}</AlertDescription>
        </Alert>
        <AuthLinks links={[{ href: "/acceso", label: "Volver al acceso" }]} />
      </>
    );
  }
  return <NewPasswordContainer />;
}
