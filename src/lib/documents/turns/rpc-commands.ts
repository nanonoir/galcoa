import "server-only";

/** Nombres y orden fijos; sin SQL libre. El ejecutor liga siempre p_actor_id. */
export const turnRpcCommands = {
  claim_chat_turn: ["p_actor_id", "p_document_id", "p_client_message_id", "p_fingerprint", "p_lease_seconds", "p_correlation_id"],
  attach_chat_turn_message: ["p_actor_id", "p_turn_id", "p_attempt", "p_user_message_id"],
  close_chat_turn: ["p_actor_id", "p_turn_id", "p_attempt", "p_state", "p_error_code", "p_correlation_id"],
  stage_chat_turn_proposal: [
    "p_actor_id", "p_turn_id", "p_attempt", "p_expected_draft_revision", "p_content", "p_proposal", "p_inputs",
    "p_model_id", "p_prompt_version", "p_limitations", "p_correlation_id",
  ],
  complete_chat_turn: ["p_actor_id", "p_turn_id", "p_attempt", "p_agent_content", "p_correlation_id"],
} as const;
