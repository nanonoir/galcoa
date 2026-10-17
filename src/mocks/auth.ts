import {
  AuthFormKindSchema,
  AuthFormStateSchema,
  type AuthFormKind,
  type AuthFormState,
} from "@/lib/contracts/auth-forms";

/** Escenarios ficticios de los cuatro formularios de acceso (MVP-115). */

export interface AuthFormScenario {
  id: string;
  form: AuthFormKind;
  label: string;
  state: AuthFormState;
}

const genericError = "No se pudo completar la operación. Revisa los datos e intenta nuevamente.";

const scenarios: AuthFormScenario[] = [
  { id: "login-idle", form: "login", label: "Login: reposo", state: { status: "idle" } },
  {
    id: "login-field-errors",
    form: "login",
    label: "Login: campos inválidos",
    state: {
      status: "error",
      message: null,
      fieldErrors: [
        { field: "email", message: "Ingresa un correo válido." },
        { field: "password", message: "Ingresa tu contraseña." },
      ],
    },
  },
  { id: "login-submitting", form: "login", label: "Login: enviando", state: { status: "submitting" } },
  {
    id: "login-error",
    form: "login",
    label: "Login: error seguro",
    state: { status: "error", message: "Correo o contraseña incorrectos.", fieldErrors: [] },
  },
  { id: "register-idle", form: "register", label: "Registro: reposo", state: { status: "idle" } },
  {
    id: "register-field-errors",
    form: "register",
    label: "Registro: campos inválidos",
    state: {
      status: "error",
      message: null,
      fieldErrors: [
        { field: "email", message: "Ingresa un correo válido." },
        { field: "confirmPassword", message: "Las contraseñas no coinciden." },
      ],
    },
  },
  { id: "register-submitting", form: "register", label: "Registro: enviando", state: { status: "submitting" } },
  {
    id: "register-error",
    form: "register",
    label: "Registro: error seguro",
    state: { status: "error", message: genericError, fieldErrors: [] },
  },
  {
    id: "register-success",
    form: "register",
    label: "Registro: resultado informado",
    state: { status: "success", message: "Si los datos son válidos, recibirás un correo para continuar." },
  },
  { id: "recovery-idle", form: "recovery_request", label: "Recuperación: reposo", state: { status: "idle" } },
  {
    id: "recovery-field-errors",
    form: "recovery_request",
    label: "Recuperación: campo inválido",
    state: { status: "error", message: null, fieldErrors: [{ field: "email", message: "Ingresa un correo válido." }] },
  },
  { id: "recovery-submitting", form: "recovery_request", label: "Recuperación: enviando", state: { status: "submitting" } },
  {
    id: "recovery-success",
    form: "recovery_request",
    label: "Recuperación: resultado informado",
    state: { status: "success", message: "Si el correo corresponde a una cuenta, te enviaremos instrucciones." },
  },
  { id: "new-password-idle", form: "new_password", label: "Nueva contraseña: reposo", state: { status: "idle" } },
  {
    id: "new-password-field-errors",
    form: "new_password",
    label: "Nueva contraseña: campos inválidos",
    state: {
      status: "error",
      message: null,
      fieldErrors: [{ field: "confirmPassword", message: "Las contraseñas no coinciden." }],
    },
  },
  { id: "new-password-submitting", form: "new_password", label: "Nueva contraseña: enviando", state: { status: "submitting" } },
  {
    id: "new-password-error",
    form: "new_password",
    label: "Nueva contraseña: enlace vencido",
    state: { status: "error", message: "El enlace venció. Solicita uno nuevo.", fieldErrors: [] },
  },
  {
    id: "new-password-success",
    form: "new_password",
    label: "Nueva contraseña: resultado informado",
    state: { status: "success", message: "Tu contraseña fue actualizada." },
  },
];

export const authFormScenarios: AuthFormScenario[] = scenarios.map((s) => ({
  ...s,
  form: AuthFormKindSchema.parse(s.form),
  state: AuthFormStateSchema.parse(s.state),
}));
