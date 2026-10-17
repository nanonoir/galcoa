import "server-only";

/** Nombres y orden fijos; sin SQL libre. El ejecutor liga siempre p_actor_id. */
export const finalizationRpcCommands = {
  get_finalization_render_input: ["p_actor_id", "p_operation_id", "p_fencing"],
  stage_finalization_pdf: ["p_actor_id", "p_operation_id", "p_fencing", "p_content", "p_correlation_id"],
  get_finalization_manifest_input: ["p_actor_id", "p_operation_id", "p_fencing"],
  prepare_finalization_manifest: ["p_actor_id", "p_operation_id", "p_fencing", "p_detail", "p_correlation_id"],
} as const;
