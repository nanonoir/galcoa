import type { EvidenceStorage } from "@/lib/documents/evidence/ports";

import type { TestClock } from "../support/clock";

/**
 * Storage privado en memoria que implementa el puerto real `EvidenceStorage`
 * (`src/lib/documents/evidence/ports.ts`). El estado vive en la instancia. Sin red.
 *
 * Fallos configurables por operación y por test: `failNext` hace fallar la siguiente
 * llamada indicada. `put` simula la subida directa del cliente a la URL firmada (no es
 * parte del puerto): permite probar «objeto ya presente» y «commit fallido» (subida sin
 * que el servicio llegue a aceptar).
 */

export type StorageOperation = "authorizeDirectUpload" | "download" | "remove" | "createSignedRead";

export type InMemoryEvidenceStorage = EvidenceStorage & {
  /** Subida directa del cliente al objeto (fuera del puerto). */
  put(privateLocation: string, bytes: Uint8Array): void;
  has(privateLocation: string): boolean;
  /** La siguiente llamada a `operation` lanza `error`. */
  failNext(operation: StorageOperation, error?: unknown): void;
  readonly calls: { operation: StorageOperation; privateLocation: string }[];
};

export function createInMemoryEvidenceStorage(clock?: { now(): Date } | TestClock): InMemoryEvidenceStorage {
  const objects = new Map<string, Uint8Array>();
  const pendingFailures = new Map<StorageOperation, unknown>();
  const calls: InMemoryEvidenceStorage["calls"] = [];
  const now = () => (clock ? clock.now() : new Date());

  const enter = (operation: StorageOperation, privateLocation: string) => {
    calls.push({ operation, privateLocation });
    if (pendingFailures.has(operation)) {
      const error = pendingFailures.get(operation);
      pendingFailures.delete(operation);
      throw error ?? new Error(`Storage de test: fallo en ${operation}`);
    }
  };

  return {
    calls,
    put: (privateLocation, bytes) => void objects.set(privateLocation, new Uint8Array(bytes)),
    has: (privateLocation) => objects.has(privateLocation),
    failNext: (operation, error) => void pendingFailures.set(operation, error),

    async authorizeDirectUpload(privateLocation, options) {
      enter("authorizeDirectUpload", privateLocation);
      return {
        transport: "authenticated", bucket: "evidences-private", objectPath: privateLocation,
        contentType: options.contentType, maxBytes: options.maxBytes, expiresAt: options.expiresAt,
      };
    },
    async download(privateLocation) {
      enter("download", privateLocation);
      const bytes = objects.get(privateLocation);
      return bytes ? new Uint8Array(bytes) : null;
    },
    async remove(privateLocation) {
      enter("remove", privateLocation);
      objects.delete(privateLocation);
    },
    async createSignedRead(privateLocation, expiresInSeconds) {
      enter("createSignedRead", privateLocation);
      return {
        url: `https://storage.invalid/read/${encodeURIComponent(privateLocation)}`,
        expiresAt: new Date(now().getTime() + expiresInSeconds * 1000).toISOString(),
      };
    },
  };
}
