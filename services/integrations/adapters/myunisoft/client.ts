// Client HTTP minimal pour l'API MyUnisoft v1.
//
// Auth = 2 headers :
//  - X-Third-Party-Secret = clé partenaire fixe (env MYUNISOFT_THIRD_PARTY_SECRET)
//  - Authorization: Bearer <JWT>  = token par cabinet/société (depuis la connection)
//
// Doc : https://partners.api.myunisoft.fr/

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
  if (endpoint.startsWith("/diary") || endpoint.startsWith("/journal")) {
    return MOCK_JOURNALS as T;
  }
  if (endpoint.startsWith("/account") || endpoint.startsWith("/accounts")) {
    return MOCK_ACCOUNTS as T;
  }
  if (endpoint.startsWith("/entry") || endpoint.startsWith("/entries") || endpoint.startsWith("/mad/entries")) {
    return MOCK_ENTRIES as T;
  }
  if (endpoint.startsWith("/balance") || endpoint.startsWith("/trial-balance")) {
    return MOCK_BALANCE as T;
  }
  if (endpoint.startsWith("/exercice") || endpoint.startsWith("/me")) {
    // Endpoints de vérification d'auth — renvoie un objet minimal valide.
    return { ok: true } as T;
  }
  return [] as T;
}

export async function myUnisoftRequest<T>(
  connection: Connection,
  endpoint: string,
  init: MyUnisoftRequestInit = {}
): Promise<T> {
  // Bascule mock — silencieuse en prod (la var est toujours présente),
  // active en dev sans credentials. Log explicite pour que les devs
  // remarquent qu'ils tapent sur le mock plutôt que sur l'API réelle.
  if (shouldUseMyUnisoftMock()) {
    // eslint-disable-next-line no-console -- monitoring temporaire dev
    console.info(`[myunisoft/mock] ${init.method ?? "GET"} ${endpoint} (no credentials, using mock)`);
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

  const requestInit: RequestInit = {
    method: init.method ?? "GET",
    headers: buildHeaders(connection),
    body: init.body ? JSON.stringify(init.body) : undefined,
  };

  const response = await fetchWithRetry(url.toString(), requestInit, endpoint);
  const text = await response.text();

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

// Vérification du token via un endpoint léger (à confirmer au moment du test E2E ;
// /me ou /accounts existent probablement). Renvoie true si la conn est valide.
export async function myUnisoftVerifyAuth(connection: Connection): Promise<boolean> {
  try {
    // On tente une requête sur un endpoint léger. À ajuster selon la doc finale.
    await myUnisoftRequest(connection, "/exercice", { method: "GET" });
    return true;
  } catch (error) {
    if (error instanceof MyUnisoftApiError && (error.status === 401 || error.status === 403)) {
      return false;
    }
    throw error;
  }
}
