import { LoginContainer } from "@/features/auth/containers/auth-containers";

import { AuthLinks, AuthNotice } from "../auth-ui";

export default async function AccesoPage({ searchParams }: PageProps<"/acceso">) {
  const { aviso } = await searchParams;
  return (
    <>
      <AuthNotice aviso={aviso} />
      <LoginContainer />
      <AuthLinks
        links={[
          { href: "/registro", label: "Crear una cuenta" },
          { href: "/recuperar", label: "Olvidé mi contraseña" },
        ]}
      />
    </>
  );
}
