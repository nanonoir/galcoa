"use client";

import { useRouter } from "next/navigation";

import { ChatActionsBar } from "@/features/chat/components/chat-actions-bar";

/**
 * El chat no confirma ni finaliza por su cuenta. La revisión permite elegir el
 * transportista y obtener las respuestas del proveedor y comprador sobre el snapshot.
 */
export function ChatActionsContainer({ documentId }: { documentId: string }) {
  const router = useRouter();
  const base = `/api/documents/${encodeURIComponent(documentId)}`;
  const reviewUrl = `/documents/${encodeURIComponent(documentId)}/review`;

  return (
    <ChatActionsBar
      previewUrl={`${base}/preview`}
      reviewUrl={reviewUrl}
      onShare={() => router.push(reviewUrl)}
      onConfirm={async () => false}
      confirmed={false}
      error={null}
    />
  );
}
