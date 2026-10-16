import { describe, expect, it } from "vitest";

import { ConfirmationCommandSchema, ConfirmationResultSchema } from "@/lib/contracts/confirmation";
import {
  DeclaredEventDateSchema,
  DocumentRecordSchema,
  DraftSchema,
  EvidenceSchema,
  MessageSchema,
} from "@/lib/contracts/core";
import {
  PublicInvitationSchema,
  PublicVerificationSchema,
} from "@/lib/contracts/public";
import {
  ParticipantSelectionSchema,
  RevisionSchema,
  SharedWarningSchema,
  SnapshotSchema,
} from "@/lib/contracts/review";
import { technicalEnvelope } from "@/lib/contracts/technical";
import { DocumentVersionSchema, HcsSealSchema } from "@/lib/contracts/version";

const H = (c: string) => c.repeat(64);
const T = "2026-03-10T12:00:00.000Z";

const operation = { title: "Entrega", body: "Se entregaron cajas.", corrections: [] };
const warning = {
  id: "w1",
  message: "Fuente A indica 12 cajas; Fuente B indica 10",
  severity: "critical" as const,
  sources: [
    { alias: "Fuente A", description: "remito aportado: 12 cajas" },
    { alias: "Fuente B", description: "declaración: 10 cajas" },
  ],
};
const selection = ["autor", "comprador"] as const;

const snapshot = {
  schemaVersion: 1,
  snapshotId: "s1",
  revisionId: "r1",
  documentId: "d1",
  content: { operation, warnings: [warning], selection },
  snapshotHash: H("a"),
  frozenAt: T,
};

const target = {
  schemaVersion: 1,
  revisionId: "r1",
  snapshotId: "s1",
  snapshotHash: H("a"),
  idempotencyKey: "key-12345678",
};
const authorConfirm = { ...target, actor: "autor", documentId: "d1", decision: "confirmar", checkboxChecked: true };
const thirdConfirm = {
  ...target,
  actor: "tercero",
  token: "tok",
  declaredName: "Ana Pérez",
  decision: "confirmar",
  checkboxChecked: true,
};
const thirdReject = {
  ...thirdConfirm,
  decision: "rechazar",
  checkboxChecked: false,
  rejectionRatified: true,
};

const invitation = {
  schemaVersion: 1,
  revisionId: "r1",
  snapshotId: "s1",
  snapshotHash: H("a"),
  role: "comprador",
  selection,
  operation,
  warnings: [warning],
  availability: "disponible",
  expiresAt: T,
};

const consensus = { topicId: "0.0.1", network: "testnet", sequenceNumber: 3, consensusTimestamp: T };

describe("MVP-020 núcleo", () => {
  it("fecha declarada: desconocida explícita y declarada válidas", () => {
    expect(DeclaredEventDateSchema.safeParse({ kind: "unknown" }).success).toBe(true);
    expect(
      DeclaredEventDateSchema.safeParse({
        kind: "declared", originalText: "el martes", precision: "day", timeZone: null, instant: null,
      }).success,
    ).toBe(true);
    expect(
      DeclaredEventDateSchema.safeParse({
        kind: "declared", originalText: "10/3 14:00 ART", precision: "datetime", timeZone: "-03:00", instant: T,
      }).success,
    ).toBe(true);
  });

  it.each([
    ["instante sin zona", { kind: "declared", originalText: "x", precision: "datetime", timeZone: null, instant: T }],
    ["instante con precisión de día", { kind: "declared", originalText: "x", precision: "day", timeZone: "-03:00", instant: T }],
    ["texto vacío", { kind: "declared", originalText: "", precision: "day", timeZone: null, instant: null }],
    ["fecha de carga como sustituto", { kind: "unknown", uploadedAt: T }],
    ["sin kind", {}],
  ])("fecha declarada rechaza %s", (_n, value) => {
    expect(DeclaredEventDateSchema.safeParse(value).success).toBe(false);
  });

  const message = {
    messageId: "m1", documentId: "d1", sender: "autor", content: "hola",
    declaredEventDate: { kind: "unknown" }, uploadedAt: T,
  };

  it("mensaje conserva fecha declarada y de carga como campos distintos", () => {
    const parsed = MessageSchema.parse(message);
    expect(parsed.declaredEventDate).toEqual({ kind: "unknown" });
    expect(parsed.uploadedAt).toBe(T);
    expect(MessageSchema.safeParse({ ...message, uploadedAt: undefined }).success).toBe(false);
    expect(MessageSchema.safeParse({ ...message, uploadedAt: new Date() }).success).toBe(false);
    expect(MessageSchema.safeParse({ ...message, declaredEventDate: undefined }).success).toBe(false);
  });

  const evidence = {
    evidenceId: "e1", documentId: "d1", messageId: "m1", kind: "pdf", mimeType: "application/pdf",
    byteLength: 10, sha256: H("b"), privateLocation: "private/e1.pdf",
    declaredEventDate: { kind: "unknown" }, uploadedAt: T,
    extractions: [{ extractionId: "x1", method: "gemini", page: 1, text: "12 cajas", extractedAt: T }],
  };

  it("evidencia con hash, ubicación privada y extracciones", () => {
    expect(EvidenceSchema.safeParse(evidence).success).toBe(true);
  });

  it.each([
    ["hash inválido", { sha256: "abc" }],
    ["hash en mayúsculas", { sha256: H("A") }],
    ["sin ubicación privada", { privateLocation: "" }],
    ["tipo desconocido", { kind: "audio" }],
    ["bytes negativos", { byteLength: -1 }],
    ["campo extra", { extra: 1 }],
  ])("evidencia rechaza %s", (_n, patch) => {
    expect(EvidenceSchema.safeParse({ ...evidence, ...patch }).success).toBe(false);
  });

  it("borrador exige contador de concurrencia entero no negativo", () => {
    const draft = { draftId: "dr1", documentId: "d1", draftRevision: 0, content: operation, updatedAt: T };
    expect(DraftSchema.safeParse(draft).success).toBe(true);
    expect(DraftSchema.safeParse({ ...draft, draftRevision: -1 }).success).toBe(false);
    expect(DraftSchema.safeParse({ ...draft, draftRevision: 1.5 }).success).toBe(false);
    expect(DraftSchema.safeParse({ ...draft, draftRevision: undefined }).success).toBe(false);
  });

  it("registro de documento reutiliza los enums de estado y permite revisión nula", () => {
    const rec = {
      documentId: "d1", ownerId: "u1", title: "t", documentStatus: "borrador", controlStatus: "sin_evaluar",
      confirmationStatus: null, hcsStatus: "no_iniciado", activeRevisionId: null, createdAt: T, updatedAt: T,
    };
    expect(DocumentRecordSchema.safeParse(rec).success).toBe(true);
    for (const patch of [{ documentStatus: "aprobado" }, { hcsStatus: "ok" }, { controlStatus: "x" }, { confirmationStatus: "ok" }]) {
      expect(DocumentRecordSchema.safeParse({ ...rec, ...patch }).success).toBe(false);
    }
  });
});

describe("MVP-021 selección", () => {
  it.each([
    [["autor"]],
    [["autor", "intermediario"]],
    [["autor", "comprador"]],
    [["autor", "intermediario", "comprador"]],
  ])("acepta %j", (value) => {
    expect(ParticipantSelectionSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ["vacía", []],
    ["sin autor", ["comprador"]],
    ["sin autor, dos terceros", ["intermediario", "comprador"]],
    ["orden no canónico", ["autor", "comprador", "intermediario"]],
    ["autor no primero", ["comprador", "autor"]],
    ["duplicados", ["autor", "autor"]],
    ["rol desconocido", ["autor", "testigo"]],
  ])("rechaza selección %s", (_n, value) => {
    expect(ParticipantSelectionSchema.safeParse(value).success).toBe(false);
  });
});

describe("MVP-021 revisión y snapshot", () => {
  it("snapshot válido; revisión y snapshot son identidades distintas", () => {
    const parsed = SnapshotSchema.parse(snapshot);
    expect(parsed.revisionId).not.toBe(parsed.snapshotId);
  });

  it.each([
    ["sin hash", { snapshotHash: undefined }],
    ["hash corto", { snapshotHash: "abc" }],
    ["schemaVersion distinta", { schemaVersion: 2 }],
    ["sin schemaVersion", { schemaVersion: undefined }],
    ["selección inválida", { content: { ...snapshot.content, selection: ["comprador"] } }],
    ["campo extra", { extra: true }],
    ["id vacío", { snapshotId: "" }],
  ])("snapshot rechaza %s", (_n, patch) => {
    expect(SnapshotSchema.safeParse({ ...snapshot, ...patch }).success).toBe(false);
  });

  it("la advertencia crítica compartible no bloquea y usa alias, no ids privados", () => {
    expect(SharedWarningSchema.safeParse(warning).success).toBe(true);
    // `sources` como ids planos (contrato privado) no es compartible.
    expect(SharedWarningSchema.safeParse({ ...warning, sources: ["msg-1"] }).success).toBe(false);
    expect(SharedWarningSchema.safeParse({ ...warning, sources: [{ alias: "A", description: "x", id: "m1" }] }).success).toBe(false);
  });

  it("revisión referencia snapshot y estados independientes", () => {
    const revision = {
      schemaVersion: 1, revisionId: "r1", documentId: "d1", snapshotId: "s1", snapshotHash: H("a"),
      selection, frozenFromDraftRevision: 2, supersedesRevisionId: null,
      documentStatus: "esperando_confirmaciones", controlStatus: "contradiccion_critica",
      confirmationStatus: "pendiente", createdAt: T,
    };
    expect(RevisionSchema.safeParse(revision).success).toBe(true);
    expect(RevisionSchema.safeParse({ ...revision, confirmationStatus: null }).success).toBe(false);
  });
});

describe("MVP-021 confirmación", () => {
  it("acepta confirmar (autor y tercero) y rechazar ratificado", () => {
    expect(ConfirmationCommandSchema.safeParse(authorConfirm).success).toBe(true);
    expect(ConfirmationCommandSchema.safeParse(thirdConfirm).success).toBe(true);
    expect(ConfirmationCommandSchema.safeParse(thirdReject).success).toBe(true);
    expect(
      ConfirmationCommandSchema.safeParse({
        ...authorConfirm, decision: "rechazar", checkboxChecked: false, rejectionRatified: true,
      }).success,
    ).toBe(true);
  });

  it.each([
    ["confirmar con casilla desmarcada", { ...thirdConfirm, checkboxChecked: false }],
    ["rechazar con casilla marcada", { ...thirdReject, checkboxChecked: true }],
    ["rechazar sin ratificación", { ...thirdReject, rejectionRatified: undefined }],
    ["rechazar con ratificación falsa", { ...thirdReject, rejectionRatified: false }],
    ["confirmar con ratificación", { ...thirdConfirm, rejectionRatified: true }],
    ["tercero sin nombre al confirmar", { ...thirdConfirm, declaredName: undefined }],
    ["tercero con nombre en blanco", { ...thirdConfirm, declaredName: "   " }],
    ["tercero sin nombre al rechazar", { ...thirdReject, declaredName: undefined }],
    ["tercero sin token", { ...thirdConfirm, token: undefined }],
    ["sin hash de snapshot", { ...thirdConfirm, snapshotHash: undefined }],
    ["sin revisión", { ...thirdConfirm, revisionId: undefined }],
    ["clave de idempotencia corta", { ...thirdConfirm, idempotencyKey: "x" }],
    ["decisión desconocida", { ...thirdConfirm, decision: "aprobar" }],
    ["autor con nombre/token extra", { ...authorConfirm, token: "t" }],
    ["autor sin documento", { ...authorConfirm, documentId: undefined }],
  ])("comando rechaza %s", (_n, value) => {
    expect(ConfirmationCommandSchema.safeParse(value).success).toBe(false);
  });

  const result = {
    schemaVersion: 1, responseId: "p1", revisionId: "r1", snapshotId: "s1", snapshotHash: H("a"),
    respondedAt: T, replayed: false, confirmationStatus: "parcial",
    actor: { role: "comprador", declaredName: "Ana Pérez" },
    outcome: { decision: "confirmar", checkboxChecked: true },
  };

  it("resultado idempotente conserva revisión, snapshot, hash y decisión", () => {
    expect(ConfirmationResultSchema.safeParse(result).success).toBe(true);
    expect(ConfirmationResultSchema.safeParse({ ...result, replayed: true }).success).toBe(true);
    expect(
      ConfirmationResultSchema.safeParse({
        ...result,
        confirmationStatus: "rechazada",
        outcome: { decision: "rechazar", checkboxChecked: false, rejectionRatified: true },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["tercero sin nombre", { actor: { role: "comprador", declaredName: null } }],
    ["autor con nombre", { actor: { role: "autor", declaredName: "X" } }],
    ["rechazo sin ratificar", { outcome: { decision: "rechazar", checkboxChecked: false } }],
    ["sin snapshot", { snapshotId: undefined }],
    ["estado de confirmación nulo", { confirmationStatus: null }],
  ])("resultado rechaza %s", (_n, patch) => {
    expect(ConfirmationResultSchema.safeParse({ ...result, ...patch }).success).toBe(false);
  });
});

describe("MVP-021 versión y sello HCS", () => {
  const artifact = { location: "private/v1.pdf", sha256: H("c"), byteLength: 100 };
  const version = {
    schemaVersion: 1, versionId: "v1", previousVersionId: null, documentId: "d1", revisionId: "r1",
    snapshotId: "s1", snapshotHash: H("a"),
    receipts: [{ responseId: "p1", role: "autor", declaredName: null, respondedAt: T }],
    pdf: artifact, manifest: { ...artifact, sha256: H("d") }, publicReference: "pub-1", finalizedAt: T,
  };

  it("versión con antecedente, constancias y referencias privadas", () => {
    expect(DocumentVersionSchema.safeParse(version).success).toBe(true);
    expect(DocumentVersionSchema.safeParse({ ...version, previousVersionId: "v0" }).success).toBe(true);
  });

  it.each([
    ["sin constancias", { receipts: [] }],
    ["sin PDF", { pdf: undefined }],
    ["hash de PDF inválido", { pdf: { ...artifact, sha256: "zz" } }],
    ["sin antecedente explícito", { previousVersionId: undefined }],
  ])("versión rechaza %s", (_n, patch) => {
    expect(DocumentVersionSchema.safeParse({ ...version, ...patch }).success).toBe(false);
  });

  it("el sello HCS es independiente de la finalización", () => {
    const base = { schemaVersion: 1, versionId: "v1", manifestHash: H("e"), consensus: null };
    // Finalizada con sello pendiente / fallido (con intento incierto) es válido.
    expect(HcsSealSchema.safeParse({ ...base, status: "pendiente", attempts: [] }).success).toBe(true);
    expect(
      HcsSealSchema.safeParse({
        ...base,
        status: "fallido",
        attempts: [{ attemptId: "a1", transactionId: null, payloadHash: H("f"), outcome: "incierto", attemptedAt: T }],
      }).success,
    ).toBe(true);
    expect(
      HcsSealSchema.safeParse({ ...base, status: "registrado", attempts: [], consensus }).success,
    ).toBe(true);
    expect(
      HcsSealSchema.safeParse({ schemaVersion: 1, versionId: "v1", manifestHash: null, status: "no_iniciado", attempts: [], consensus: null }).success,
    ).toBe(true);
  });

  it.each([
    ["registrado sin consenso", { status: "registrado", attempts: [], consensus: null }],
    ["consenso sin registrado", { status: "pendiente", attempts: [], consensus }],
    ["red distinta de testnet", { status: "registrado", attempts: [], consensus: { ...consensus, network: "mainnet" } }],
    ["no_iniciado con intentos", { status: "no_iniciado", attempts: [{ attemptId: "a", transactionId: null, payloadHash: H("f"), outcome: "pendiente", attemptedAt: T }] }],
    ["iniciado sin manifestHash", { status: "pendiente", attempts: [], manifestHash: null }],
  ])("sello rechaza %s", (_n, patch) => {
    const base = { schemaVersion: 1, versionId: "v1", manifestHash: H("e"), consensus: null };
    expect(HcsSealSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe("MVP-021 DTO públicos", () => {
  it("invitación válida incluye operación completa, advertencias con alias y disponibilidad", () => {
    const parsed = PublicInvitationSchema.parse(invitation);
    expect(parsed.operation).toEqual(operation);
    expect(parsed.warnings[0].sources[0].alias).toBe("Fuente A");
  });

  it.each([
    "token", "chat", "messages", "evidences", "documentId", "ownerId", "privateLocation", "tokenHash", "declaredName",
  ])("invitación rechaza la clave extra «%s» (strict)", (key) => {
    expect(PublicInvitationSchema.safeParse({ ...invitation, [key]: "x" }).success).toBe(false);
  });

  it("invitación rechaza claves extra anidadas y roles inválidos", () => {
    expect(
      PublicInvitationSchema.safeParse({ ...invitation, operation: { ...operation, evidenceIds: ["e1"] } }).success,
    ).toBe(false);
    expect(
      PublicInvitationSchema.safeParse({
        ...invitation,
        warnings: [{ ...warning, sources: [{ alias: "A", description: "d", messageId: "m1" }] }],
      }).success,
    ).toBe(false);
    expect(PublicInvitationSchema.safeParse({ ...invitation, role: "autor" }).success).toBe(false);
    expect(PublicInvitationSchema.safeParse({ ...invitation, availability: "otra" }).success).toBe(false);
  });

  it("no se puede reutilizar un snapshot privado como invitación", () => {
    expect(PublicInvitationSchema.safeParse(snapshot).success).toBe(false);
  });

  const envelope = { schemaVersion: 1, publicReference: "pub-1", pdfHash: H("1"), privateDetailHash: H("2") };
  const verification = {
    schemaVersion: 1, publicReference: "pub-1", registrationStatus: "registrado",
    proof: { envelope, manifestHash: H("3"), consensus }, fileCheck: { provided: true, result: "coincide" },
  };

  it("verificación pública: con PDF, sin PDF y registro pendiente", () => {
    expect(PublicVerificationSchema.safeParse(verification).success).toBe(true);
    expect(PublicVerificationSchema.safeParse({ ...verification, fileCheck: { provided: false } }).success).toBe(true);
    expect(
      PublicVerificationSchema.safeParse({
        ...verification, registrationStatus: "pendiente", proof: null, fileCheck: { provided: true, result: "no_verificable" },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["operación", { operation }],
    ["constancias", { receipts: [] }],
    ["documentId", { documentId: "d1" }],
    ["clave extra en prueba", { proof: { ...verification.proof, privateDetail: {} } }],
    ["prueba sin registro", { registrationStatus: "pendiente" }],
    ["coincide sin prueba", { registrationStatus: "pendiente", proof: null }],
    ["sin PDF con resultado", { fileCheck: { provided: false, result: "coincide" } }],
  ])("verificación rechaza %s", (_n, patch) => {
    expect(PublicVerificationSchema.safeParse({ ...verification, ...patch }).success).toBe(false);
  });
});

describe("MVP-021 envelope técnico", () => {
  const schema = technicalEnvelope(DocumentRecordSchema.pick({ documentId: true }));

  it("éxito persistido, operación en curso y error", () => {
    expect(schema.safeParse({ schemaVersion: 1, status: "persisted", data: { documentId: "d1" } }).success).toBe(true);
    expect(
      schema.safeParse({ schemaVersion: 1, status: "in_progress", operation: { operationId: "o1", stage: "pdf" } }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        schemaVersion: 1, status: "error",
        error: { code: "TOKEN_INVALIDO", stage: "confirmacion", retryable: false, correlationId: "c1" },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["éxito con datos inválidos", { status: "persisted", data: {} }],
    ["error sin etapa", { status: "error", error: { code: "X", retryable: true, correlationId: "c" } }],
    ["código en minúsculas", { status: "error", error: { code: "x", stage: "hcs", retryable: true, correlationId: "c" } }],
    ["error sin correlación", { status: "error", error: { code: "X", stage: "hcs", retryable: true } }],
    ["error con clave extra", { status: "error", error: { code: "X", stage: "hcs", retryable: true, correlationId: "c", token: "t" } }],
    ["estado desconocido", { status: "ok", data: { documentId: "d1" } }],
  ])("rechaza %s", (_n, patch) => {
    expect(schema.safeParse({ schemaVersion: 1, ...patch }).success).toBe(false);
  });
});
