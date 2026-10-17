import "server-only";

/** Nombres y orden fijos; sin SQL libre. El ejecutor liga siempre p_actor_id. */
export const contrastRpcCommands = {
  persist_contrast_report: [
    "p_actor_id", "p_document_id", "p_draft_id", "p_draft_revision", "p_draft_content", "p_result", "p_findings",
    "p_inputs", "p_model_id", "p_prompt_version", "p_limitations", "p_correlation_id",
  ],
} as const;
