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
};

export async function pennylaneRequest<T>(
  connection: Connection,
  endpoint: string,
  init: PennylaneRequestInit = {}
): Promise<T> {
  return executeWithAuthRecovery<T>(connection, endpoint, init, false);
}

async function executeWithAuthRecovery<T>(
  connection: Connection,
  endpoint: string,
  init: PennylaneRequestInit,
  alreadyRefreshed: boolean
): Promise<T> {
  const url = new URL(`${getBaseUrl()}${endpoint}`);
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const requestInit: RequestInit = {
    method: init.method ?? "GET",
    headers: buildHeaders(connection),
    body: init.body ? JSON.stringify(init.body) : undefined,
  };

  const response = await fetchWithRetry(url.toString(), requestInit, endpoint);
  const text = await response.text();

  // 401 mid-sync : si le mode est OAuth et qu'on n'a pas déjà tenté un refresh,
  // on rafraîchit le token in-place et on retente une fois.
  if (response.status === 401 && !alreadyRefreshed && connection.auth.mode === "oauth2") {
    try {
      // Import dynamique pour éviter une dépendance circulaire avec auth.ts.
      const { refreshOAuthToken } = await import("@/services/integrations/adapters/pennylane/auth");
      const refreshed = await refreshOAuthToken(connection.auth);
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
      return executeWithAuthRecovery<T>(connection, endpoint, init, true);
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
  cursor: string | null = null
): Promise<PennylanePage<T>> {
  const queryWithCursor = { ...query, cursor: cursor ?? undefined };
  const raw = await pennylaneRequest<RawPennylaneResponse<T>>(connection, endpoint, {
    query: queryWithCursor,
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
