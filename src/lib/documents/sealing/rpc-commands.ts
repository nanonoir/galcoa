import "server-only";

/** Nombres y orden fijos; sin SQL libre. El ejecutor liga siempre p_actor_id. */
export const sealingRpcCommands = {
  get_seal_version: ["p_actor_id", "p_version_id"],
  get_seal_state: ["p_actor_id", "p_version_id"],
  check_seal_eligibility: ["p_actor_id", "p_version_id", "p_correlation_id"],
  record_seal_intent: [
    "p_actor_id", "p_version_id", "p_payload", "p_payload_hash", "p_signed_bytes", "p_transaction_id", "p_valid_start",
    "p_valid_until", "p_topic_id", "p_network", "p_correlation_id",
  ],
  record_seal_outcome: ["p_actor_id", "p_attempt_id", "p_fencing", "p_outcome", "p_observation", "p_correlation_id"],
  record_seal_registration: [
    "p_actor_id", "p_attempt_id", "p_fencing", "p_payload_hash", "p_network", "p_topic_id", "p_transaction_id",
    "p_sequence_number", "p_consensus_timestamp", "p_correlation_id",
  ],
} as const;
