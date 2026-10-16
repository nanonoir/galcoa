import { RecoveryRequestContainer } from "@/features/auth/containers/auth-containers";

import { AuthLinks, AuthNotice } from "../auth-ui";

export default async function RecuperarPage({ searchParams }: PageProps<"/recuperar">) {
  const { aviso } = await searchParams;
  return (
    <>
      <AuthNotice aviso={aviso} />
      <RecoveryRequestContainer />
      <AuthLinks links={[{ href: "/acceso", label: "Volver al acceso" }]} />
    </>
  );
}
