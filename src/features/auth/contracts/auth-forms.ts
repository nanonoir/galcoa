import type {
  AuthFormState,
  LoginValues,
  NewPasswordValues,
  RecoveryRequestValues,
  RegisterValues,
} from "@/lib/contracts/auth-forms";

/** Props comunes: estado provisto por el container y un único `onSubmit` con los valores del formulario. */
export interface AuthFormProps<TValues> {
  state: AuthFormState;
  onSubmit: (values: TValues) => void;
}

export type LoginFormProps = AuthFormProps<LoginValues>;
export type RegisterFormProps = AuthFormProps<RegisterValues>;
export type RecoveryRequestFormProps = AuthFormProps<RecoveryRequestValues>;
export type NewPasswordFormProps = AuthFormProps<NewPasswordValues>;
