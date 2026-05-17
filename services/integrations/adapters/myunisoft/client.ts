// Client HTTP minimal pour l'API MyUnisoft v1.
//
// Auth = 2 headers :
//  - X-Third-Party-Secret = clé partenaire fixe (env MYUNISOFT_THIRD_PARTY_SECRET)
//  - Authorization: Bearer <JWT>  = token par cabinet/société (depuis la connection)
//
// Doc partenaire : https://partners.api.myu.fr/ (rebrand MyUnisoft → MyU, semaine du 18/05/2026)
// Doc API runtime : https://docs.api.myunisoft.fr/ (inchangée)

import type { Connection } from "@/types/connectors";
import {
  MOCK_JOURNALS,
  MOCK_ACCOUNTS,
  MOCK_ENTRIES,
  MOCK_BALANCE,
  shouldUseMyUnisoftMock,
} from "@/services/integrations/adapters/myunisoft/mock";

const DEFAULT_BASE_URL = "https://api.myunisoft.fr/api/v1";
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 500;

export class MyUnisoftApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    public readonly body: string
  ) {
    super(`MyUnisoft API ${status} on ${endpoint}: ${body.slice(0, 200)}`);
    this.name = "MyUnisoftApiError";
  }
}

function getBaseUrl(): string {
  return process.env.MYUNISOFT_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

function getPartnerSecret(): string {
  const secret = process.env.MYUNISOFT_THIRD_PARTY_SECRET;
  if (!secret) {
    throw new Error(
      "MYUNISOFT_THIRD_PARTY_SECRET is not configured. Add it to your .env to use the MyUnisoft adapter."
    );
  }
  return secret;
}

function buildHeaders(connection: Connection): HeadersInit {
  if (connection.auth.mode !== "partner_jwt") {
    throw new Error(
      `MyUnisoft adapter requires partner_jwt auth, got "${connection.auth.mode}"`
    );
  }
  return {
    "X-Third-Party-Secret": getPartnerSecret(),
    Authorization: `Bearer ${connection.auth.accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  endpointForLog: string
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status === 429 || response.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const retryAfterHeader = response.headers.get("retry-after");
          const retryAfterMs = retryAfterHeader
            ? Number(retryAfterHeader) * 1000
            : BASE_BACKOFF_MS * Math.pow(2, attempt);
          await sleep(retryAfterMs);
          continue;
        }
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error(`MyUnisoft request failed after retries on ${endpointForLog}`);
}

export type MyUnisoftRequestInit = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
};

/**
 * Mock router : quand `MYUNISOFT_THIRD_PARTY_SECRET` est absente, on
 * renvoie des fixtures déterministes (cf. ./mock.ts) plutôt qu'une
 * vraie requête. Permet le dev local sans credentials.
 *
 * Le routing est scopé aux endpoints utilisés par les fetchers réels —
 * tout endpoint inconnu retombe sur un tableau vide (sécurité par
 * défaut, jamais d'erreur silencieuse).
 */
function getMockResponse<T>(endpoint: string): T {
  // Endpoints MAD (canon — /mad/*?version=1.0.0). Ce sont ceux que les
  // fetchers utilisent en prod.
  if (endpoint.startsWith("/mad/journals")) {
    return MOCK_JOURNALS as T;
  }
  if (endpoint.startsWith("/mad/accounts")) {
    return MOCK_ACCOUNTS as T;
  }
  if (endpoint.startsWith("/mad/entries")) {
    return MOCK_ENTRIES as T;
  }
  if (endpoint.startsWith("/mad/balance")) {
    return MOCK_BALANCE as T;
  }
  if (endpoint.startsWith("/mad/exercices")) {
    // Endpoint de vérification d'auth — renvoie un tableau minimal valide.
    return [] as T;
  }
  return [] as T;
}

export async function myUnisoftRequest<T>(
  connection: Connection,
  endpoint: string,
  init: MyUnisoftRequestInit = {}
): Promise<T> {
  const method = init.method ?? "GET";

  // Bascule mock — silencieuse en prod (la var est toujours présente),
  // active en dev sans credentials. Log explicite pour que les devs
  // remarquent qu'ils tapent sur le mock plutôt que sur l'API réelle.
  if (shouldUseMyUnisoftMock()) {
    // eslint-disable-next-line no-console -- monitoring temporaire dev
    console.info(`[myunisoft/mock] ${method} ${endpoint} (no credentials, using mock)`);
    return getMockResponse<T>(endpoint);
  }

  const url = new URL(`${getBaseUrl()}${endpoint}`);
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  // Tous les endpoints MAD requièrent ?version=1.0.0 (cf. specs partenaires
  // MyUnisoft). On l'injecte automatiquement si l'appelant ne l'a pas
  // déjà précisé pour éviter d'avoir à le répéter dans chaque fetcher.
  if (endpoint.startsWith("/mad/") && !url.searchParams.has("version")) {
    url.searchParams.set("version", "1.0.0");
  }

  const requestInit: RequestInit = {
    method,
    headers: buildHeaders(connection),
    body: init.body ? JSON.stringify(init.body) : undefined,
  };

  // Audit Firestore : on chronomètre + on persiste un événement
  // (succès OU échec) dans `integration_api_audit`. Permet de débugger
  // les problèmes des bêta-testeurs sans accès à leur compte.
  // Importé dynamiquement pour éviter de bundler firebase-admin côté
  // client (il n'est jamais appelé hors serveur en pratique, mais c'est
  // une protection supplémentaire).
  const start = Date.now();
  let response: Response;
  let auditPromise: Promise<void> | null = null;

  try {
    response = await fetchWithRetry(url.toString(), requestInit, endpoint);
  } catch (networkError) {
    // Erreur réseau / timeout — pas de status HTTP. On logue avec -1.
    if (typeof window === "undefined") {
      const message = networkError instanceof Error ? networkError.message : String(networkError);
      auditPromise = (async () => {
        try {
          const { safeLogIntegrationApiCall } = await import("@/lib/server/integrationAudit");
          await safeLogIntegrationApiCall({
            provider: "myunisoft",
            endpoint,
            method,
            status: -1,
            durationMs: Date.now() - start,
            userId: connection.userId ?? null,
            ok: false,
            errorMessage: message,
          });
        } catch {
          /* swallow */
        }
      })();
    }
    if (auditPromise) await auditPromise;
    throw networkError;
  }

  const text = await response.text();
  const durationMs = Date.now() - start;

  // Log côté serveur uniquement (Admin SDK indispo client).
  if (typeof window === "undefined") {
    auditPromise = (async () => {
      try {
        const { safeLogIntegrationApiCall } = await import("@/lib/server/integrationAudit");
        await safeLogIntegrationApiCall({
          provider: "myunisoft",
          endpoint,
          method,
          status: response.status,
          durationMs,
          userId: connection.userId ?? null,
          ok: response.ok,
          errorMessage: response.ok ? null : text.slice(0, 400),
        });
      } catch {
        /* swallow — never break the business call */
      }
    })();
  }

  // On ne `await` PAS le log avant de retourner pour ne pas pénaliser la
  // latence de l'API métier. Le log finit en background.
  if (auditPromise) {
    void auditPromise;
  }

  if (!response.ok) {
    throw new MyUnisoftApiError(response.status, endpoint, text);
  }

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// MyUnisoft renvoie souvent les listes sous forme d'array brut OU avec une enveloppe.
// On normalise selon les patterns observables.
export type MyUnisoftListResponse<T> = T[] | { data: T[]; meta?: unknown } | { items: T[] };

export function extractList<T>(response: MyUnisoftListResponse<T>): T[] {
  if (Array.isArray(response)) return response;
  if ("data" in response && Array.isArray(response.data)) return response.data;
  if ("items" in response && Array.isArray(response.items)) return response.items;
  return [];
}

// Vérification du token via /mad/exercices (endpoint léger, retourne 1-3
// items selon les exercices ouverts). 401/403 = token invalide ; tout
// autre échec se propage.
export async function myUnisoftVerifyAuth(connection: Connection): Promise<boolean> {
  try {
    await myUnisoftRequest(connection, "/mad/exercices", { method: "GET" });
    return true;
  } catch (error) {
    if (error instanceof MyUnisoftApiError && (error.status === 401 || error.status === 403)) {
      return false;
    }
    throw error;
  }
}
