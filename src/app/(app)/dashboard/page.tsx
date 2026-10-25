import { redirect } from "next/navigation";

import { ActivationContainer } from "@/features/conversion/containers/activation-container";
import { toActivationChecklist } from "@/features/conversion/containers/activation";
import { DashboardContainer } from "@/features/dashboard/containers/dashboard-container";
import { toDashboardState } from "@/features/dashboard/containers/dashboard-state";
import { failureKind } from "@/features/documents/containers/failure-kind";
import { getCurrentSession, LOGIN_PATH } from "@/lib/supabase/auth";

import { documentServiceForRequest } from "../_lib/documents";

export const metadata = { title: "Mis documentos · GALCOA+" };

export default async function DashboardPage() {
  const documents = await documentServiceForRequest();
  const result = await documents.listDocuments();
  if (!result.ok && failureKind(result.error) === "unauthenticated") redirect(LOGIN_PATH);
  // Guía de activación (conversion-funnel.md, D4): solo con la lista real; si falla, el panel muestra su error.
  const session = result.ok ? await getCurrentSession().catch(() => null) : null;
  const userKey = session?.status === "authenticated" ? session.user.id : null;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <h1 className="page-title">Mis documentos</h1>
      {result.ok && userKey ? <ActivationContainer checklist={toActivationChecklist(result.value)} userKey={userKey} /> : null}
      <DashboardContainer initialState={toDashboardState(result)} guideShown={result.ok && Boolean(userKey)} />
    </main>
  );
}
