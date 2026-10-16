"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LoginForm } from "@/features/auth/components/login-form";
import { NewPasswordForm } from "@/features/auth/components/new-password-form";
import { RecoveryRequestForm } from "@/features/auth/components/recovery-request-form";
import { RegisterForm } from "@/features/auth/components/register-form";
import type { LoginValues, NewPasswordValues, RecoveryRequestValues, RegisterValues } from "@/lib/contracts/auth-forms";

import { useAuthForm } from "./use-auth-form";

/** Containers de los cuatro formularios de acceso (MVP-031). La presentación es la de MVP-115. */

export function LoginContainer() {
  const { state, submit } = useAuthForm<LoginValues>("/api/auth/login");
  return <LoginForm state={state} onSubmit={submit} />;
}

export function RegisterContainer() {
  const { state, submit } = useAuthForm<RegisterValues>("/api/auth/register");
  return <RegisterForm state={state} onSubmit={submit} />;
}

export function RecoveryRequestContainer() {
  const { state, submit } = useAuthForm<RecoveryRequestValues>("/api/auth/recovery");
  return <RecoveryRequestForm state={state} onSubmit={submit} />;
}

export function NewPasswordContainer() {
  const { state, submit } = useAuthForm<NewPasswordValues>("/api/auth/password");
  return <NewPasswordForm state={state} onSubmit={submit} />;
}

/** Botón de cierre de sesión para las páginas privadas (las monta MVP-116). */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin" });
    } finally {
      router.replace("/acceso");
      router.refresh();
    }
  }
  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => void logout()}>
      Cerrar sesión
    </Button>
  );
}
