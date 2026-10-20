import "server-only";

/** Nombres y orden fijos; sin SQL libre. El ejecutor liga siempre p_actor_id. */
export const alcRpcCommands = {
  save_alc_evaluation: [
    "p_actor_id", "p_document_id", "p_draft_revision", "p_selection", "p_rules_version", "p_input", "p_input_hash",
    "p_color", "p_result", "p_shared", "p_rectifications", "p_source_aliases", "p_inventory", "p_correlation_id",
  ],
  get_alc_evaluation: ["p_actor_id", "p_document_id", "p_evaluation_id"],
} as const;
