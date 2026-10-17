import "server-only";

/** Nombres y orden fijos; sin SQL libre. El ejecutor liga siempre p_actor_id. */
export const finalizationRpcCommands = {
  get_finalization_render_input: ["p_actor_id", "p_operation_id", "p_fencing"],
  stage_finalization_pdf: ["p_actor_id", "p_operation_id", "p_fencing", "p_content", "p_correlation_id"],
  get_finalization_manifest_input: ["p_actor_id", "p_operation_id", "p_fencing"],
  prepare_finalization_manifest: ["p_actor_id", "p_operation_id", "p_fencing", "p_detail", "p_correlation_id"],
  reserve_finalization_objects: ["p_actor_id", "p_operation_id", "p_fencing", "p_correlation_id"],
  get_finalization_staged_content: ["p_actor_id", "p_operation_id", "p_fencing", "p_kind"],
  publish_version: [
    "p_actor_id", "p_operation_id", "p_fencing", "p_pdf_sha256", "p_pdf_length", "p_manifest_sha256", "p_manifest_length", "p_correlation_id",
  ],
} as const;
