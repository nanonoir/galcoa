import { requirePageUser } from "@/lib/supabase/auth";

/** Grupo privado (MVP-030): toda página debajo exige sesión verificada; nunca se prerenderiza ni se cachea. */
export const dynamic = "force-dynamic";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return children;
}
