import { redirect } from "next/navigation";

import { NewPasswordContainer } from "@/features/auth/containers/auth-containers";
import { getCurrentSession, SessionUnavailableError } from "@/lib/supabase/auth";

/** Solo con la sesión de recuperación creada por el enlace del correo; sin ella, se pide otro enlace. */
export default async function NuevaContrasenaPage() {
  const session = await getCurrentSession();
  if (session.status === "unavailable") throw new SessionUnavailableError();
  if (session.status === "anonymous") redirect("/recuperar?aviso=enlace-invalido");
  return <NewPasswordContainer />;
}
