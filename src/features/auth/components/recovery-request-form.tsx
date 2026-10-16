"use client";

import { useEffect, useRef, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RecoveryRequestFormProps } from "@/features/auth/contracts/auth-forms";
import type { AuthField, AuthFormState } from "@/lib/contracts/auth-forms";

/**
 * Presentación de la solicitud de recuperación de acceso (MVP-115, REQ-01). No autentica ni aplica
 * política de contraseña: muestra el estado que recibe del container tal cual y
 * entrega los valores a `onSubmit` una sola vez por envío. Los campos no son
 * controlados para que la contraseña no quede en atributos del DOM ni en estado.
 */

const ID = "recovery-request-form";

interface FieldProps {
  form: string;
  name: AuthField;
  label: string;
  type: "email" | "password";
  autoComplete: string;
  state: AuthFormState;
  locked: boolean;
}

function Field({ form, name, label, type, autoComplete, state, locked }: FieldProps) {
  const id = `${form}-${name}`;
  const error = state.status === "error" ? state.fieldErrors.find((e) => e.field === name)?.message : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        readOnly={locked}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function RecoveryRequestForm({ state, onSubmit }: RecoveryRequestFormProps) {
  // Evita llamar dos veces a `onSubmit` por un doble clic antes de que llegue `submitting`.
  const sent = useRef(false);
  useEffect(() => {
    sent.current = false;
  }, [state]);

  const submitting = state.status === "submitting";
  const done = state.status === "success";
  const locked = submitting || done;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked || sent.current) return;
    sent.current = true;
    const data = new FormData(event.currentTarget);
    const read = (name: AuthField) => String(data.get(name) ?? "");
    onSubmit({ email: read("email") });
  }

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>
          <h2 id={`${ID}-title`} className="text-lg font-medium">
            Recuperar acceso
          </h2>
        </CardTitle>
        <CardDescription>Ingresa el correo de tu cuenta para solicitar la recuperación.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          aria-labelledby={`${ID}-title`}
          aria-busy={submitting}
          noValidate
          onSubmit={handleSubmit}
          onChange={() => {
            sent.current = false;
          }}
          className="flex flex-col gap-4"
        >
          {state.status === "error" && state.message !== null && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <Field form={ID} name="email" label="Correo electrónico" type="email" autoComplete="email" state={state} locked={locked} />

          <div role="status" aria-live="polite">
            {submitting && <span className="sr-only">Enviando…</span>}
            {done && (
              <Alert role="none">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}
          </div>

          {!done && (
            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Enviando…" : "Solicitar recuperación"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
