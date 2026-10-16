import "server-only";

/** Nombres y orden fijos; sin SQL libre. El ejecutor liga siempre p_actor_id. */
export const evidenceRpcCommands = {
  reserve_evidence: ["p_actor_id", "p_document_id", "p_kind", "p_mime_type", "p_byte_length", "p_sha256", "p_private_location", "p_declared_event_date", "p_key", "p_fingerprint"],
  get_evidence: ["p_actor_id", "p_document_id", "p_evidence_id"],
  list_evidences: ["p_actor_id", "p_document_id"],
  accept_evidence: ["p_actor_id", "p_evidence_id", "p_correlation_id"],
  discard_evidence_reservation: ["p_actor_id", "p_evidence_id"],
  append_evidence_extraction: ["p_actor_id", "p_document_id", "p_evidence_id", "p_method", "p_model", "p_prompt_version", "p_pages", "p_text", "p_limitations", "p_correlation_id"],
  list_evidence_extractions: ["p_actor_id", "p_document_id"],
} as const;
