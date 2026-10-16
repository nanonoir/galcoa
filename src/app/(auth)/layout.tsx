/** Grupo público de acceso (MVP-031): sesión por cookies, nunca prerenderizado ni cacheado. */
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">{children}</main>;
}
