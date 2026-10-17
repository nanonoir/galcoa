import type {
  AttemptRecord,
  RecordIntentResult,
  SealIntent,
  SealRegistration,
  SealableVersion,
  SealingStore,
} from "@/lib/documents/sealing/ports";

/** Doble en memoria de `SealingStore` con las restricciones de la migración C3: un intento activo por versión, sin borrados. */
export function memorySealingStore(version: SealableVersion) {
  const attempts: (AttemptRecord & { intent: SealIntent })[] = [];
  const registrations: SealRegistration[] = [];
  const events: string[] = [];
  const failures = { intent: false, outcome: false, registration: false };

  const store: SealingStore = {
    async loadVersion(id) {
      return id === version.versionId ? version : null;
    },
    async loadSealState() {
      const latest = attempts.at(-1) ?? null;
      return { registration: registrations[0] ?? null, latestAttempt: latest && { ...latest, intent: undefined } as AttemptRecord };
    },
    async recordIntent(intent): Promise<RecordIntentResult> {
      if (failures.intent) throw new Error("db caída");
      if (attempts.some((a) => a.outcome === "pendiente" || a.outcome === "incierto")) return { ok: false, reason: "active_attempt" };
      const attempt = {
        id: `attempt-${attempts.length + 1}`,
        payloadHash: intent.payloadHash,
        transactionId: intent.transactionId,
        outcome: "pendiente" as const,
        claimFencing: 1,
        observation: { topicId: intent.topicId, network: intent.network },
        intent,
      };
      attempts.push(attempt);
      events.push("intent");
      return { ok: true, attemptId: attempt.id, claimFencing: 1 };
    },
    async recordOutcome({ attemptId, outcome, observation }) {
      if (failures.outcome) throw new Error("db caída");
      const attempt = attempts.find((a) => a.id === attemptId)!;
      if (attempt.outcome === "registrado" || attempt.outcome === "fallido") throw new Error("terminal");
      attempt.outcome = outcome;
      attempt.observation = observation;
      events.push(`outcome:${outcome}`);
    },
    async recordRegistration({ registration }) {
      if (failures.registration) throw new Error("db caída");
      attempts.find((a) => a.id === registration.attemptId)!.outcome = "registrado";
      registrations.push(registration);
      events.push("registered");
    },
  };
  return { store, attempts, registrations, events, failures };
}
