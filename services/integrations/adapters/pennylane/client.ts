// Client HTTP minimal pour l'API Pennylane v2.
// - Authentification Bearer (3 modes possibles : company_token, firm_token, oauth2)
// - Pagination cursor-based exposée via fetchPaginated
// - Retry exponentiel sur 429 et 5xx (max 4 tentatives)
//
// Doc : https://pennylane.readme.io/reference

import type { Connection } from "@/types/connectors";

const DEFAULT_BASE_URL = "https://app.pennylane.com/api/external/v2";
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 500;

export class PennylaneApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    public readonly body: string
  ) {
    super(`Pennylane API ${status} on ${endpoint}: ${body.slice(0, 200)}`);
    this.name = "PennylaneApiError";
  }
}

function getBaseUrl(): string {
  return process.env.PENNYLANE_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

function buildHeaders(connection: Connection): HeadersInit {
  // Les 3 modes d'auth utilisent le même header Bearer côté Pennylane.
  // La différence est dans la portée du token (entreprise / cabinet / intégrateur).
  return {
    Authorization: `Bearer ${connection.auth.accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch + retry exponentiel ciblé 429/5xx. 4xx hors 429 ne sont pas retry.
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
  throw lastError ?? new Error(`Pennylane request failed after retries on ${endpointForLog}`);
}

export type PennylaneRequestInit = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /**
   * Sprint B (cf. audit-sprint-B Q4) — pour les Connections Firm OAuth qui
   * donnent accès à N dossiers, on cible un dossier précis via la query
   * `?company_id=X`. Pennylane Firm API accepte ce paramètre sur tous
   * les endpoints data (/ledger_entries, /journals, /invoices, etc.).
   *
   * Fallback : si Pennylane retourne 403/404 avec ce pattern, on retente
   * une fois avec le header custom `X-Company-Id: X` (à valider en
   * sandbox dès accès aux credentials Firm).
   *
   * Sans valeur fournie : aucun ciblage (cas Company token / token manuel
   * où le token est déjà scopé à une Company).
   */
  targetCompanyId?: string;
};

export async function pennylaneRequest<T>(
  connection: Connection,
  endpoint: string,
  init: PennylaneRequestInit = {}
): Promise<T> {
  return executeWithAuthRecovery<T>(connection, endpoint, init, false, false);
}

async function executeWithAuthRecovery<T>(
  connection: Connection,
  endpoint: string,
  init: PennylaneRequestInit,
  alreadyRefreshed: boolean,
  alreadyTriedHeaderFallback: boolean
): Promise<T> {
  const url = new URL(`${getBaseUrl()}${endpoint}`);
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  // Sprint B (Q4 audit) : injecter company_id en query par défaut. Si le
  // serveur refuse (403/404), on retentera une fois avec le header.
  const targetCompanyId = init.targetCompanyId?.trim();
  if (targetCompanyId && !alreadyTriedHeaderFallback) {
    url.searchParams.set("company_id", targetCompanyId);
  }

  const headers: Record<string, string> = { ...(buildHeaders(connection) as Record<string, string>) };
  if (targetCompanyId && alreadyTriedHeaderFallback) {
    headers["X-Company-Id"] = targetCompanyId;
  }

  const requestInit: RequestInit = {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  };

  const response = await fetchWithRetry(url.toString(), requestInit, endpoint);
  const text = await response.text();

  // Sprint B (Q4 audit) — fallback header X-Company-Id si le query-param
  // est refusé. Une seule retry par requête, uniquement quand un
  // targetCompanyId était demandé. Évite les boucles sur les vrais 4xx.
  if (
    targetCompanyId &&
    !alreadyTriedHeaderFallback &&
    (response.status === 403 || response.status === 404)
  ) {
    console.warn(
      `[pennylane-client] company_id=${targetCompanyId} via query refused ` +
        `(${response.status} on ${endpoint}) — retrying with X-Company-Id header`
    );
    return executeWithAuthRecovery<T>(connection, endpoint, init, alreadyRefreshed, true);
  }

  // 401 mid-sync : si le mode est OAuth et qu'on n'a pas déjà tenté un refresh,
  // on rafraîchit le token in-place et on retente une fois.
  if (response.status === 401 && !alreadyRefreshed && connection.auth.mode === "oauth2") {
    try {
      // Import dynamique pour éviter une dépendance circulaire avec auth.ts.
      const { refreshOAuthToken } = await import("@/services/integrations/adapters/pennylane/auth");
      // kind dérivé du providerSub : firm pour les cabinets (sandbox 13/05/2026),
      // company sinon (compat connexions Phase 1.5 pre-Firm).
      const kind = connection.providerSub === "pennylane_firm" ? "firm" : "company";
      const refreshed = await refreshOAuthToken(connection.auth, kind);
      // Mutation in-place : les requêtes suivantes du même sync utiliseront le nouveau token.
      Object.assign(connection.auth, refreshed);
      // Persistance asynchrone "best effort" — si elle échoue, on continue avec la session
      // en mémoire ; le token sera repersisté au prochain sync OK.
      try {
        const { updateConnectionTokens } = await import(
          "@/services/integrations/storage/connectionStore"
        );
        await updateConnectionTokens(connection.id, refreshed);
      } catch {
        /* swallow — refresh utilisable en mémoire même si la persistance échoue */
      }
      return executeWithAuthRecovery<T>(connection, endpoint, init, true, alreadyTriedHeaderFallback);
    } catch {
      // Refresh impossible → on lève l'erreur 401 d'origine.
    }
  }

  if (!response.ok) {
    throw new PennylaneApiError(response.status, endpoint, text);
  }

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

// ─── Pagination cursor-based ────────────────────────────────────────────────
// Pennylane v2 expose un curseur dans la réponse. La forme exacte est documentée
// par endpoint mais le pattern est régulier : { items: [...], next_cursor: string | null }
// ou { data: [...], pagination: { next_cursor } }. On normalise les deux.

export type PennylanePage<T> = {
  items: T[];
  nextCursor: string | null;
};

type RawPennylaneResponse<T> =
  | { items: T[]; next_cursor?: string | null }
  | { data: T[]; pagination?: { next_cursor?: string | null } }
  | { results: T[]; next_cursor?: string | null };

export function normalizePage<T>(raw: RawPennylaneResponse<T>): PennylanePage<T> {
  if ("items" in raw) {
    return { items: raw.items, nextCursor: raw.next_cursor ?? null };
  }
  if ("results" in raw) {
    return { items: raw.results, nextCursor: raw.next_cursor ?? null };
  }
  return {
    items: raw.data ?? [],
    nextCursor: raw.pagination?.next_cursor ?? null,
  };
}

export async function pennylaneFetchPage<T>(
  connection: Connection,
  endpoint: string,
  query: Record<string, string | number | undefined> = {},
  cursor: string | null = null,
  /** Sprint B — cible un dossier précis pour les Connections Firm OAuth. */
  targetCompanyId?: string
): Promise<PennylanePage<T>> {
  const queryWithCursor = { ...query, cursor: cursor ?? undefined };
  const raw = await pennylaneRequest<RawPennylaneResponse<T>>(connection, endpoint, {
    query: queryWithCursor,
    targetCompanyId,
  });
  return normalizePage<T>(raw);
}

// Helper pour vérifier qu'un token est valide.
export async function pennylaneVerifyAuth(connection: Connection): Promise<boolean> {
  try {
    await pennylaneRequest(connection, "/me", { method: "GET" });
    return true;
  } catch (error) {
    if (error instanceof PennylaneApiError && (error.status === 401 || error.status === 403)) {
      return false;
    }
    throw error;
  }
}
