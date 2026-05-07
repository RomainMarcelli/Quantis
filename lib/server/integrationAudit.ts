// File: lib/server/integrationAudit.ts
// Role: journalisation des erreurs / latences d'API tierces (MyUnisoft,
// Pennylane, Bridge…) dans Firestore. Permet aux ops de débugger les
// problèmes des bêta-testeurs SANS avoir accès à leur compte.
//
// Schéma cible (collection `integration_api_audit`) :
//   - provider : "myunisoft" | "pennylane" | "odoo" | "bridge"
//   - endpoint : "/entry", "/account", "/diary", etc.
//   - method : "GET" | "POST" | …
//   - status : code HTTP retourné par l'API tierce (ou -1 si network err)
//   - durationMs : latence end-to-end de la requête
//   - userId : qui était authentifié au moment de la requête (null si N/A)
//   - errorMessage : tronqué à 400 chars (PII filtrée par la stack tierce)
//   - createdAt : Timestamp serveur
//
// Best-effort : un échec de log ne doit JAMAIS casser le flux métier
// principal (cf. pattern de `securityAudit.ts`).

import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

const COLLECTION = "integration_api_audit";
const MAX_MESSAGE_LENGTH = 400;

export type IntegrationProvider =
  | "myunisoft"
  | "pennylane"
  | "odoo"
  | "bridge"
  | "fec";

export type IntegrationApiAuditEvent = {
  provider: IntegrationProvider;
  endpoint: string;
  method?: string;
  status: number;
  durationMs: number;
  userId?: string | null;
  /** True si l'appel a réussi ; false sinon. Permet de filtrer rapidement
   *  les erreurs sans avoir à parser le status. */
  ok: boolean;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Wrapper sans-throw — usage standard depuis les adaptateurs et les
 * routes API. Une erreur de logging est `console.error` mais ne propage
 * pas — la requête métier reste maîtresse du flux.
 */
export async function safeLogIntegrationApiCall(
  event: IntegrationApiAuditEvent
): Promise<void> {
  try {
    await logIntegrationApiCall(event);
  } catch (error) {
    // eslint-disable-next-line no-console -- monitoring fallback
    console.error("[integration-audit] failed to persist event", error);
  }
}

async function logIntegrationApiCall(event: IntegrationApiAuditEvent): Promise<void> {
  const firestore = getFirebaseAdminFirestore();
  const payload = {
    provider: event.provider,
    endpoint: event.endpoint.slice(0, 200),
    method: event.method ?? "GET",
    status: event.status,
    durationMs: Math.round(event.durationMs),
    userId: event.userId ?? null,
    ok: event.ok,
    errorMessage: event.errorMessage
      ? event.errorMessage.slice(0, MAX_MESSAGE_LENGTH)
      : null,
    metadata: event.metadata ?? null,
    createdAt: FieldValue.serverTimestamp(),
  };
  await firestore.collection(COLLECTION).add(payload);
}

/**
 * Helper de chronométrage. Wrappe une promesse d'appel API et logue
 * automatiquement durée + succès/échec en Firestore.
 *
 *   const result = await traceApiCall(
 *     { provider: "myunisoft", endpoint: "/entry", method: "GET", userId },
 *     () => fetch(url)
 *   );
 *
 * Si la promesse throw, on logue l'erreur ET on re-throw (l'appelant
 * gère l'erreur métier comme avant). Si elle réussit, on logue ok=true.
 */
export async function traceApiCall<T>(
  context: {
    provider: IntegrationProvider;
    endpoint: string;
    method?: string;
    userId?: string | null;
    metadata?: Record<string, unknown>;
  },
  fn: () => Promise<{ result: T; status: number }>
): Promise<T> {
  const start = Date.now();
  try {
    const { result, status } = await fn();
    void safeLogIntegrationApiCall({
      ...context,
      status,
      durationMs: Date.now() - start,
      ok: status >= 200 && status < 400,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorWithStatus = error as { status?: number };
    void safeLogIntegrationApiCall({
      ...context,
      status: typeof errorWithStatus.status === "number" ? errorWithStatus.status : -1,
      durationMs: Date.now() - start,
      ok: false,
      errorMessage: message,
    });
    throw error;
  }
}
