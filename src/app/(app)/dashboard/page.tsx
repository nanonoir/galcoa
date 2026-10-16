import { redirect } from "next/navigation";

import { DashboardContainer } from "@/features/dashboard/containers/dashboard-container";
import { toDashboardState } from "@/features/dashboard/containers/dashboard-state";
import { failureKind } from "@/features/documents/containers/failure-kind";
import { LOGIN_PATH } from "@/lib/supabase/auth";

import { documentServiceForRequest } from "../_lib/documents";

export const metadata = { title: "Mis documentos · GALCOA+" };

export default async function DashboardPage() {
  const documents = await documentServiceForRequest();
  const result = await documents.listDocuments();
  if (!result.ok && failureKind(result.error) === "unauthenticated") redirect(LOGIN_PATH);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8">
      <h1 className="sr-only">Mis documentos</h1>
      <DashboardContainer initialState={toDashboardState(result)} />
    </main>
  );
}
