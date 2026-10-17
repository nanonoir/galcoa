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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
      <p className="eyebrow self-start">Mis documentos</p>
      <h1 className="page-title">Mis documentos</h1>
      <DashboardContainer initialState={toDashboardState(result)} />
    </main>
  );
}
