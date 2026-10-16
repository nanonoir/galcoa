import { RegisterContainer } from "@/features/auth/containers/auth-containers";

import { AuthLinks } from "../auth-ui";

export default function RegistroPage() {
  return (
    <>
      <RegisterContainer />
      <AuthLinks links={[{ href: "/acceso", label: "Ya tengo una cuenta" }]} />
    </>
  );
}
