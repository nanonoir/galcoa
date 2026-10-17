import { createHash, randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  createTestUser, expectRejected, newId, psql, psqlOk, readLocalStack, seedDocument, SQLSTATE,
  type SeededDocument,
} from "./harness";

/**
 * Constraints, FK compuestas, unicidad e inmutabilidad probadas contra Postgres
 * real. Las guardas aplican también al superusuario de esta conexión (los
 * triggers no se desactivan); un superusuario podría deshabilitarlos: la
 * protección es contra roles de aplicación (data-transactions §6).
 */

const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
let doc: SeededDocument;
let other: SeededDocument;

beforeAll(async () => {
  const stack = readLocalStack();
  const [a, b] = await Promise.all([createTestUser(stack, "integridad-a"), createTestUser(stack, "integridad-b")]);
  doc = await seedDocument(a.id, { withVersion: true });
  other = await seedDocument(b.id, { withVersion: true });
});

type NextRevision = { revisionId: string; snapshotId: string; responseId: string; operationId: string; versionId: string; hash: string; reference: string };

/** Revisión solo-autor completa con su respuesta y su operación reservada (sin publicar). */
async function seedRevision(
  target: SeededDocument, sequence: number, versionNumber: number, previous: string | null,
): Promise<NextRevision> {
  const ids = { revisionId: newId(), snapshotId: newId(), participantId: newId(), responseId: newId(), operationId: newId(), versionId: newId() };
  const bytes = Buffer.from(JSON.stringify({ operation: { title: `rev ${ids.revisionId}` } }));
  const hash = sha(bytes);
  const reference = `ref-${randomUUID()}`;
  await psqlOk(`
begin;
insert into public.document_revisions (id, document_id, sequence, snapshot_id, snapshot_hash, selection, frozen_from_draft_revision)
  values ('${ids.revisionId}', '${target.documentId}', ${sequence}, '${ids.snapshotId}', '${hash}', array['autor'], 0);
insert into public.revision_snapshots (id, document_id, revision_id, schema_version, canonical_bytes, snapshot_hash, content)
  values ('${ids.snapshotId}', '${target.documentId}', '${ids.revisionId}', 1, '\\x${bytes.toString("hex")}', '${hash}', convert_from('\\x${bytes.toString("hex")}'::bytea, 'UTF8')::jsonb);
insert into public.revision_participants (id, document_id, revision_id, snapshot_id, snapshot_hash, role, user_id)
  values ('${ids.participantId}', '${target.documentId}', '${ids.revisionId}', '${ids.snapshotId}', '${hash}', 'autor', '${target.ownerId}');
insert into public.corroboration_responses (id, document_id, revision_id, snapshot_id, snapshot_hash, participant_id, role, decision, checkbox_checked, ratified_rejection)
  values ('${ids.responseId}', '${target.documentId}', '${ids.revisionId}', '${ids.snapshotId}', '${hash}', '${ids.participantId}', 'autor', 'confirmada', true, false);
insert into public.finalization_operations (id, document_id, revision_id, snapshot_id, snapshot_hash, reserved_version_id, version_number, previous_version_id, renderer, public_reference, nonce, lease_expires_at)
  values ('${ids.operationId}', '${target.documentId}', '${ids.revisionId}', '${ids.snapshotId}', '${hash}', '${ids.versionId}', ${versionNumber}, ${previous ? `'${previous}'` : "null"}, 'r1', '${reference}', '\\x${randomUUID().replace(/-/g, "")}', now() + interval '60 seconds');
commit;`);
  return { revisionId: ids.revisionId, snapshotId: ids.snapshotId, responseId: ids.responseId, operationId: ids.operationId, versionId: ids.versionId, hash, reference };
}

const versionSql = (target: SeededDocument, r: NextRevision, number: number, previous: string | null) => `
insert into public.document_versions (id, document_id, operation_id, revision_id, snapshot_id, snapshot_hash, version_number, previous_version_id, public_reference, schema_version, envelope, manifest_hash)
  values ('${r.versionId}', '${target.documentId}', '${r.operationId}', '${r.revisionId}', '${r.snapshotId}', '${r.hash}', ${number}, ${previous ? `'${previous}'` : "null"}, '${r.reference}', 1, '{}', '${sha("m")}');`;

describe("solo-agregar e inmutabilidad (MVP-023)", () => {
  it.each([
    ["audit_events", "update public.audit_events set outcome = 'error'"],
    ["audit_events", "delete from public.audit_events"],
    ["audit_events", "truncate public.audit_events"],
    ["messages", "update public.messages set content = 'otro'"],
    ["messages", "delete from public.messages"],
    ["document_versions", "update public.document_versions set public_reference = 'otra'"],
    ["document_versions", "delete from public.document_versions"],
    ["document_versions", "truncate public.document_versions cascade"],
    ["revision_snapshots", "update public.revision_snapshots set schema_version = 2"],
    ["corroboration_responses", "update public.corroboration_responses set decision = 'rechazada'"],
    ["corroboration_responses", "delete from public.corroboration_responses"],
    ["verification_reports", "update public.verification_reports set model = 'otro'"],
    ["evidence_extractions", "delete from public.evidence_extractions"],
    ["version_receipts", "delete from public.version_receipts"],
    ["version_artifacts", "update public.version_artifacts set sha256 = repeat('0', 64)"],
    ["hedera_registrations", "update public.hedera_registrations set sequence_number = 2"],
    ["hedera_registrations", "delete from public.hedera_registrations"],
    ["revision_participants", "delete from public.revision_participants"],
    ["snapshot_sources", "update public.snapshot_sources set alias = 'otro'"],
    ["message_events", "delete from public.message_events"],
    ["report_sources", "delete from public.report_sources"],
  ])("%s: `%s` se rechaza", async (_table, statement) => {
    await expectRejected(`${statement};`, SQLSTATE.restrict);
  });

  it("idempotency_records: el resultado persistido no se reescribe", async () => {
    await expectRejected(`update public.idempotency_records set result = '{"ok":false}';`, SQLSTATE.restrict);
  });

  it("documents: propietario inmutable, contadores solo crecen y no se borra con historia", async () => {
    await expectRejected(`update public.documents set owner_id = '${other.ownerId}' where id = '${doc.documentId}';`, SQLSTATE.restrict);
    await expectRejected(`update public.documents set revision_seq = 0 where id = '${doc.documentId}';`, SQLSTATE.restrict);
    await expectRejected(`delete from public.documents where id = '${doc.documentId}';`, SQLSTATE.foreignKey);
  });

  it("document_revisions: selección y snapshot inmutables; terminal no cambia; no se borra", async () => {
    await expectRejected(`update public.document_revisions set selection = array['autor','intermediario'] where id = '${doc.revisionId}';`, SQLSTATE.restrict);
    await expectRejected(`update public.document_revisions set snapshot_hash = repeat('a', 64) where id = '${doc.revisionId}';`, SQLSTATE.restrict);
    await expectRejected(`delete from public.document_revisions where id = '${doc.revisionId}';`, SQLSTATE.restrict);
    await psqlOk(`update public.document_revisions set lifecycle = 'sustituida', confirmation_status = 'sustituida' where id = '${other.revisionId}';`);
    await expectRejected(`update public.document_revisions set lifecycle = 'activa' where id = '${other.revisionId}';`, SQLSTATE.restrict);
    await expectRejected(`update public.document_revisions set confirmation_status = 'completa' where id = '${other.revisionId}';`, SQLSTATE.restrict);
  });

  it("evidences: un original aceptado es inmutable; reservado → aceptado una sola vez", async () => {
    await expectRejected(`update public.evidences set sha256 = repeat('b', 64) where id = '${doc.evidenceId}';`, SQLSTATE.restrict);
    await psqlOk(`update public.evidences set upload_state = 'accepted', accepted_at = now() where id = '${doc.evidenceId}';`);
    await expectRejected(`update public.evidences set upload_state = 'reserved', accepted_at = null where id = '${doc.evidenceId}';`, SQLSTATE.restrict);
    await expectRejected(`delete from public.evidences where id = '${doc.evidenceId}';`, SQLSTATE.restrict);
  });

  it("drafts: draft_revision solo crece", async () => {
    await psqlOk(`update public.drafts set draft_revision = 1 where id = '${doc.draftId}';`);
    await expectRejected(`update public.drafts set draft_revision = 1 where id = '${doc.draftId}';`, SQLSTATE.restrict);
  });

  it("artifact_staging: bytes inmutables y hash derivado de los bytes", async () => {
    await expectRejected(`update public.artifact_staging set kind = 'manifest' where operation_id = '${doc.operationId}';`, SQLSTATE.restrict);
    await expectRejected(
      `insert into public.artifact_staging (operation_id, kind, content, sha256, byte_length) values ('${doc.operationId}', 'manifest', '\\x6162', repeat('c', 64), 2);`,
      SQLSTATE.check,
    );
    await expectRejected(
      `insert into public.artifact_staging (operation_id, kind, content, sha256, byte_length) values ('${doc.operationId}', 'pdf', '\\x6162', '${sha(Buffer.from("ab"))}', 2);`,
      SQLSTATE.unique,
    );
  });
});

describe("unicidad", () => {
  it("una sola respuesta por participante y revisión, y por solicitud", async () => {
    const dup = `insert into public.corroboration_responses (document_id, revision_id, snapshot_id, snapshot_hash, participant_id, role, request_id, decision, checkbox_checked, ratified_rejection, declared_name)
      values ('${doc.documentId}', '${doc.revisionId}', '${doc.snapshotId}', '${doc.snapshotHash}', '${doc.buyerParticipantId}', 'comprador', ${"null"}, 'rechazada', false, true, 'Otro');`;
    // Sin solicitud, un tercero no es válido (check) y, con ella, la unicidad lo detiene.
    await expectRejected(dup, SQLSTATE.check);
    await expectRejected(dup.replace("null", `'${doc.requestId}'`), SQLSTATE.unique);
  });

  it("una sola operación y una sola versión por revisión", async () => {
    const r = await seedRevision(doc, 2, 2, doc.versionId);
    await expectRejected(
      `insert into public.finalization_operations (document_id, revision_id, snapshot_id, snapshot_hash, reserved_version_id, version_number, renderer, public_reference, nonce, lease_expires_at)
        values ('${doc.documentId}', '${r.revisionId}', '${r.snapshotId}', '${r.hash}', '${newId()}', 7, 'r', 'ref-${newId()}', '\\x${randomUUID().replace(/-/g, "")}', now());`,
      SQLSTATE.unique,
    );
    await expectRejected(versionSql(doc, { ...r, versionId: newId() }, 2, doc.versionId), SQLSTATE.foreignKey);
    await psqlOk(versionSql(doc, r, 2, doc.versionId));
    await expectRejected(versionSql(doc, r, 3, doc.versionId), SQLSTATE.unique);
  });

  it("cadena de versiones: sucesor único, primer elemento único y antecedente menor", async () => {
    // Otra revisión que intenta colgar de v1 (que ya tiene sucesor v2) o declararse primera.
    const sibling = await seedRevision(doc, 3, 3, doc.versionId);
    await expectRejected(versionSql(doc, sibling, 3, doc.versionId), SQLSTATE.unique);
    const asFirst = await seedRevision(doc, 4, 4, null);
    await expectRejected(versionSql(doc, asFirst, 4, null), SQLSTATE.unique);
    // El antecedente declarado debe ser el reservado por la operación.
    const mismatch = await seedRevision(doc, 5, 5, doc.versionId);
    await expectRejected(versionSql(doc, mismatch, 5, null), SQLSTATE.check);
  });

  it("claves de idempotencia: la misma (actor, recurso, acción, clave) no se repite", async () => {
    const row = (fp: string) => `insert into public.idempotency_records (actor_scope, resource_id, action, key, fingerprint, result)
      values ('user:${doc.ownerId}', '${doc.revisionId}', 'confirm_author', 'clave-fija-0001', '${fp}', '{}');`;
    await psqlOk(row(sha("a")));
    await expectRejected(row(sha("a")), SQLSTATE.unique);
    await expectRejected(row(sha("b")), SQLSTATE.unique);
    await expectRejected(row("no-es-hex"), SQLSTATE.check);
  });

  it("solicitudes: una generación vigente por participante; revocar habilita la siguiente", async () => {
    const insert = (generation: number) => `insert into public.corroboration_requests (document_id, revision_id, snapshot_id, snapshot_hash, participant_id, role, token_hash, generation, expires_at)
      values ('${other.documentId}', '${other.revisionId}', '${other.snapshotId}', '${other.snapshotHash}', '${other.buyerParticipantId}', 'comprador', '${sha(newId())}', ${generation}, now() + interval '1 day');`;
    await expectRejected(insert(2), SQLSTATE.unique);
    await psqlOk(`update public.corroboration_requests set revoked_at = now() where id = '${other.requestId}';`);
    await psqlOk(insert(2));
    await expectRejected(`update public.corroboration_requests set revoked_at = null where id = '${other.requestId}';`, SQLSTATE.restrict);
    await expectRejected(`update public.corroboration_requests set token_hash = repeat('d', 64) where id = '${other.requestId}';`, SQLSTATE.restrict);
    await expectRejected(`delete from public.corroboration_requests where id = '${other.requestId}';`, SQLSTATE.restrict);
  });
});

describe("FK compuestas: no se mezcla documento / revisión / snapshot / participante", () => {
  it("participante con documento, hash o snapshot de otra revisión", async () => {
    const insert = (documentId: string, revisionId: string, snapshotId: string, hash: string) => `begin;
      insert into public.revision_participants (document_id, revision_id, snapshot_id, snapshot_hash, role)
      values ('${documentId}', '${revisionId}', '${snapshotId}', '${hash}', 'intermediario'); commit;`;
    await expectRejected(insert(other.documentId, doc.revisionId, doc.snapshotId, doc.snapshotHash), SQLSTATE.foreignKey);
    await expectRejected(insert(doc.documentId, doc.revisionId, doc.snapshotId, sha("otro")), SQLSTATE.foreignKey);
    await expectRejected(insert(doc.documentId, doc.revisionId, other.snapshotId, doc.snapshotHash), SQLSTATE.foreignKey);
  });

  it("solicitud o respuesta con el participante de otra revisión/documento", async () => {
    await expectRejected(
      `insert into public.corroboration_requests (document_id, revision_id, snapshot_id, snapshot_hash, participant_id, role, token_hash, generation, expires_at, revoked_at)
       values ('${other.documentId}', '${other.revisionId}', '${other.snapshotId}', '${other.snapshotHash}', '${doc.buyerParticipantId}', 'comprador', '${sha(newId())}', 9, now(), now());`,
      SQLSTATE.foreignKey,
    );
    await expectRejected(
      `insert into public.corroboration_responses (document_id, revision_id, snapshot_id, snapshot_hash, participant_id, role, decision, checkbox_checked, ratified_rejection)
       values ('${other.documentId}', '${other.revisionId}', '${other.snapshotId}', '${other.snapshotHash}', '${doc.authorParticipantId}', 'autor', 'confirmada', true, false);`,
      SQLSTATE.foreignKey,
    );
  });

  it("versión con revisión, snapshot o reserva de otro documento", async () => {
    const r = await seedRevision(other, 2, 2, other.versionId);
    // La operación reservada es de otro documento: el antecedente reservado no coincide.
    await expectRejected(versionSql(doc, r, 2, null), SQLSTATE.check);
    await expectRejected(versionSql(other, { ...r, snapshotId: doc.snapshotId }, 2, other.versionId), SQLSTATE.foreignKey);
    await expectRejected(versionSql(other, { ...r, hash: doc.snapshotHash }, 2, other.versionId), SQLSTATE.foreignKey);
    await expectRejected(versionSql(other, { ...r, versionId: newId() }, 2, other.versionId), SQLSTATE.foreignKey);
  });

  it("constancia solo de una respuesta confirmada de su misma revisión", async () => {
    const stray = await seedRevision(doc, 40, 40, doc.versionId);
    await expectRejected(
      `insert into public.version_receipts (version_id, response_id, revision_id) values ('${doc.versionId}', '${stray.responseId}', '${doc.revisionId}');`,
      SQLSTATE.foreignKey,
    );
  });

  it("el puntero activo del documento debe ser una revisión del mismo documento (al commit)", async () => {
    await expectRejected(`begin; update public.documents set active_revision_id = '${other.revisionId}' where id = '${doc.documentId}'; commit;`, SQLSTATE.foreignKey);
    await expectRejected(`begin; update public.documents set last_version_id = '${other.versionId}' where id = '${doc.documentId}'; commit;`, SQLSTATE.foreignKey);
  });

  it("fuentes de snapshot y reportes solo apuntan a mensajes/evidencias del mismo documento", async () => {
    await expectRejected(
      `insert into public.snapshot_sources (document_id, snapshot_id, revision_id, snapshot_hash, alias, message_id)
       values ('${doc.documentId}', '${doc.snapshotId}', '${doc.revisionId}', '${doc.snapshotHash}', 'Fuente B', '${other.messageId}');`,
      SQLSTATE.foreignKey,
    );
    await expectRejected(`insert into public.report_sources (document_id, report_id, message_id) values ('${doc.documentId}', '${other.reportId}', '${doc.messageId}');`, SQLSTATE.foreignKey);
  });
});

describe("revisión, snapshot y selección (restricciones al commit)", () => {
  const revision = (selection: string, ids = { rev: newId(), snap: newId() }, hash = sha("x")) => ({
    ids, hash,
    sql: `insert into public.document_revisions (id, document_id, sequence, snapshot_id, snapshot_hash, selection, frozen_from_draft_revision)
      values ('${ids.rev}', '${doc.documentId}', 50, '${ids.snap}', '${hash}', ${selection}, 0);`,
  });

  it("solo las cuatro selecciones canónicas con autor", async () => {
    for (const selection of ["array['comprador']", "array['comprador','autor']", "array['autor','autor']", "array['autor','tercero']", "array[]::text[]"]) {
      await expectRejected(revision(selection).sql, SQLSTATE.check);
    }
  });

  it("una revisión no queda huérfana de snapshot ni de participantes al commit", async () => {
    await expectRejected(`begin; ${revision("array['autor']").sql} commit;`, SQLSTATE.foreignKey);
  });

  it("los participantes deben coincidir exactamente con la selección", async () => {
    const r = revision("array['autor','comprador']");
    const bytes = Buffer.from('{"a":1}');
    const hash = sha(bytes);
    const full = revision("array['autor','comprador']", r.ids, hash);
    const base = `begin; ${full.sql}
      insert into public.revision_snapshots (id, document_id, revision_id, schema_version, canonical_bytes, snapshot_hash, content)
        values ('${r.ids.snap}', '${doc.documentId}', '${r.ids.rev}', 1, '\\x${bytes.toString("hex")}', '${hash}', '{"a":1}');`;
    const author = `insert into public.revision_participants (document_id, revision_id, snapshot_id, snapshot_hash, role, user_id)
        values ('${doc.documentId}', '${r.ids.rev}', '${r.ids.snap}', '${hash}', 'autor', '${doc.ownerId}');`;
    await expectRejected(`${base} ${author} commit;`, SQLSTATE.check); // falta el comprador
    await expectRejected(
      `${base} ${author}
       insert into public.revision_participants (document_id, revision_id, snapshot_id, snapshot_hash, role)
         values ('${doc.documentId}', '${r.ids.rev}', '${r.ids.snap}', '${hash}', 'intermediario'); commit;`,
      SQLSTATE.check, // rol que no está en la selección
    );
  });

  it("el autor enlaza al propietario del documento, no a otro usuario", async () => {
    const ids = { rev: newId(), snap: newId() };
    const bytes = Buffer.from('{"c":3}');
    const hash = sha(bytes);
    await expectRejected(
      `begin;
       insert into public.document_revisions (id, document_id, sequence, snapshot_id, snapshot_hash, selection, frozen_from_draft_revision)
         values ('${ids.rev}', '${doc.documentId}', 60, '${ids.snap}', '${hash}', array['autor'], 0);
       insert into public.revision_snapshots (id, document_id, revision_id, schema_version, canonical_bytes, snapshot_hash, content)
         values ('${ids.snap}', '${doc.documentId}', '${ids.rev}', 1, '\\x${bytes.toString("hex")}', '${hash}', '{"c":3}');
       insert into public.revision_participants (document_id, revision_id, snapshot_id, snapshot_hash, role, user_id)
         values ('${doc.documentId}', '${ids.rev}', '${ids.snap}', '${hash}', 'autor', '${other.ownerId}');
       commit;`,
      SQLSTATE.foreignKey,
    );
  });

  it("snapshot: bytes, hash y JSON deben concordar", async () => {
    const bytes = Buffer.from('{"b":2}');
    const insert = (hash: string, json: string) => `insert into public.revision_snapshots (id, document_id, revision_id, schema_version, canonical_bytes, snapshot_hash, content)
      values ('${newId()}', '${doc.documentId}', '${doc.revisionId}', 1, '\\x${bytes.toString("hex")}', '${hash}', '${json}');`;
    await expectRejected(insert(sha("otro"), '{"b":2}'), SQLSTATE.check);
    await expectRejected(insert(sha(bytes), '{"b":3}'), SQLSTATE.check);
  });
});

describe("respuestas: coherencia de campos (INV-13)", () => {
  const response = (decision: string, checkbox: boolean, ratified: boolean, name: string | null, requestId: string | null = null) => `
    insert into public.corroboration_responses (document_id, revision_id, snapshot_id, snapshot_hash, participant_id, role, request_id, decision, checkbox_checked, ratified_rejection, declared_name)
    values ('${other.documentId}', '${other.revisionId}', '${other.snapshotId}', '${other.snapshotHash}', '${other.buyerParticipantId}', 'comprador', ${requestId ? `'${requestId}'` : "null"}, '${decision}', ${checkbox}, ${ratified}, ${name ? `'${name}'` : "null"});`;

  it("confirmar exige casilla marcada sin ratificación; rechazar, casilla vacía y ratificada", async () => {
    await expectRejected(response("confirmada", false, false, "Ana"), SQLSTATE.check);
    await expectRejected(response("confirmada", true, true, "Ana"), SQLSTATE.check);
    await expectRejected(response("rechazada", true, true, "Ana"), SQLSTATE.check);
    await expectRejected(response("rechazada", false, false, "Ana"), SQLSTATE.check);
  });

  it("el tercero declara su nombre (también al rechazar) y no puede ser vacío", async () => {
    await expectRejected(response("rechazada", false, true, null), SQLSTATE.check);
    await expectRejected(response("confirmada", true, false, "   "), SQLSTATE.check);
    await expectRejected(response("confirmada", true, false, "x".repeat(201)), SQLSTATE.check);
  });
});

describe("finalización durable y fencing", () => {
  it("las fases avanzan de a una y no retroceden; publicada es terminal", async () => {
    const op = await seedRevision(doc, 30, 30, doc.versionId);
    await expectRejected(`update public.finalization_operations set phase = 'manifest_ready' where id = '${op.operationId}';`, SQLSTATE.restrict);
    await psqlOk(`update public.finalization_operations set phase = 'pdf_staged' where id = '${op.operationId}';`);
    await expectRejected(`update public.finalization_operations set phase = 'reserved' where id = '${op.operationId}';`, SQLSTATE.restrict);
    await expectRejected(`update public.finalization_operations set phase = 'published' where id = '${op.operationId}';`, SQLSTATE.restrict);
    await expectRejected(`update public.finalization_operations set phase = 'published' where id = '${doc.operationId}';`, SQLSTATE.restrict);
  });

  it("el fencing solo crece, reanudar tras abandono exige uno nuevo, y las entradas no cambian", async () => {
    const op = await seedRevision(doc, 31, 31, doc.versionId);
    await psqlOk(`update public.finalization_operations set fencing = 2 where id = '${op.operationId}';`);
    await expectRejected(`update public.finalization_operations set fencing = 1 where id = '${op.operationId}';`, SQLSTATE.restrict);
    await psqlOk(`update public.finalization_operations set status = 'abandoned' where id = '${op.operationId}';`);
    await expectRejected(`update public.finalization_operations set status = 'active' where id = '${op.operationId}';`, SQLSTATE.restrict);
    await psqlOk(`update public.finalization_operations set status = 'active', fencing = 3 where id = '${op.operationId}';`);
    await expectRejected(`update public.finalization_operations set public_reference = 'nueva' where id = '${op.operationId}';`, SQLSTATE.restrict);
    await expectRejected(`update public.finalization_operations set revision_id = '${doc.revisionId}' where id = '${op.operationId}';`, SQLSTATE.restrict);
    await expectRejected(`delete from public.finalization_operations where id = '${op.operationId}';`, SQLSTATE.restrict);
  });

  it("las reservas de objeto: una por operación/artefacto/fencing; ruta y fencing inmutables", async () => {
    await expectRejected(
      `insert into public.artifact_reservations (operation_id, document_id, kind, fencing, object_path, expires_at)
       values ('${doc.operationId}', '${doc.documentId}', 'pdf', 1, '${doc.documentId}/otra/${newId()}', now());`,
      SQLSTATE.unique,
    );
    await expectRejected(`update public.artifact_reservations set object_path = 'otra' where operation_id = '${doc.operationId}';`, SQLSTATE.restrict);
    await expectRejected(`update public.artifact_reservations set fencing = 9 where operation_id = '${doc.operationId}';`, SQLSTATE.restrict);
  });
});

describe("sello HCS separado de la versión", () => {
  const attempt = (versionId: string, payload: string) => `insert into public.hedera_attempts (version_id, payload, payload_hash)
    values ('${versionId}', convert_to('${payload}', 'UTF8'), '${sha(payload)}');`;

  it("un solo intento activo por versión; los terminales no cambian", async () => {
    await psqlOk(attempt(other.versionId, "intento-1"));
    await expectRejected(attempt(other.versionId, "intento-2"), SQLSTATE.unique);
    await expectRejected(`update public.hedera_attempts set payload_hash = repeat('e', 64) where id = '${other.attemptId}';`, SQLSTATE.restrict);
    await expectRejected(`update public.hedera_attempts set outcome = 'pendiente' where id = '${other.attemptId}';`, SQLSTATE.restrict);
    await expectRejected(`delete from public.hedera_attempts where id = '${other.attemptId}';`, SQLSTATE.restrict);
  });

  it("el hash del payload se deriva de los bytes", async () => {
    await expectRejected(
      `insert into public.hedera_attempts (version_id, payload, payload_hash) values ('${doc.versionId}', '\\x6162', repeat('f', 64));`,
      SQLSTATE.check,
    );
  });

  it("un solo registro probado por versión, solo Testnet, ligado al intento y su hash", async () => {
    const registration = (network: string, payloadHash: string) => `insert into public.hedera_registrations (version_id, attempt_id, payload_hash, network, topic_id, transaction_id, sequence_number, consensus_timestamp)
      values ('${doc.versionId}', '${doc.attemptId}', '${payloadHash}', '${network}', '0.0.1', '0.0.1@2.2', 2, now());`;
    await expectRejected(registration("testnet", sha("x")), SQLSTATE.unique); // ya registrada (uniq. por versión)
    await expectRejected(registration("mainnet", sha("x")), SQLSTATE.check);
  });

  it("la versión finalizada existe sin sello: no hay columna de sello en document_versions", async () => {
    expect(
      await psqlOk(`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'document_versions' and (column_name ilike '%hcs%' or column_name ilike '%hedera%');`),
    ).toEqual([["0"]]);
    const result = await psql(`select count(*) from public.hedera_registrations where version_id = '${doc.versionId}';`);
    expect(result.rows).toEqual([["1"]]);
  });
});
