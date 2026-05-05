// Client JSON-RPC pour Odoo.
//
// Particularité Odoo : la base URL est DYNAMIQUE (par instance client) — chaque
// connection embarque son `instanceUrl`. Le pattern Pennylane/MyUnisoft (URL fixe
// dans une env var) ne s'applique pas.
//
// Endpoint : POST {instanceUrl}/jsonrpc
// Body : { jsonrpc, method: "call", params: { service, method, args }, id }
// Réponse : { jsonrpc, id, result } OU { jsonrpc, id, error: { code, message, data } }
//
// Auth en 2 étapes :
//  1. login (service: "common", method: "login", args: [db, login, apikey]) → uid (int)
//  2. execute_kw (service: "object", method: "execute_kw", args: [db, uid, apikey,
//     model, method, args, kwargs]) pour toutes les opérations sur les modèles
//
// Doc : https://www.odoo.com/documentation/17.0/developer/reference/external_api.html

import type { Connection } from "@/types/connectors";

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 500;

export class OdooApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    public readonly body: string,
    public readonly odooErrorCode: number | null = null
  ) {
    super(`Odoo API ${status} on ${endpoint}: ${body.slice(0, 200)}`);
    this.name = "OdooApiError";
  }
}

/**
 * Normalise l'URL d'instance fournie par l'utilisateur :
 *  - "acme.odoo.com" → "https://acme.odoo.com"
 *  - "https://acme.odoo.com/" → "https://acme.odoo.com"
 *  - "http://localhost:8069" → "http://localhost:8069" (self-hosted)
 */
export function normalizeInstanceUrl(raw: string): string {
  let url = raw.trim();
  if (!url) throw new Error("instanceUrl manquant");
  if (!/^https?:\/\//i.test(url)) {
    // Ajout du schéma : http pour localhost, https par défaut.
    url = url.startsWith("localhost") || /^\d+\.\d+\.\d+\.\d+/.test(url)
      ? `http://${url}`
      : `https://${url}`;
  }
  // Retire les slashes finaux pour éviter les double // dans les requêtes.
  return url.replace(/\/+$/, "");
}

/**
 * Devine le nom de la base à partir de l'URL d'instance Odoo SaaS.
 * Pour "acme.odoo.com" → "acme". Pour les self-hosted, l'utilisateur doit fournir
 * le nom de la base manuellement (on ne devine pas).
 */
export function guessDatabaseFromUrl(instanceUrl: string): string | null {
  try {
    const url = new URL(instanceUrl);
    if (url.hostname.endsWith(".odoo.com")) {
      return url.hostname.replace(/\.odoo\.com$/, "");
    }
    return null;
  } catch {
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

type JsonRpcRequest = {
  jsonrpc: "2.0";
  method: "call";
  params: {
    service: "common" | "object" | "db";
    method: string;
    args: unknown[];
  };
  id: number;
};

type JsonRpcResponse<T = unknown> =
  | { jsonrpc: "2.0"; id: number; result: T }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string; data?: unknown } };

let requestIdCounter = 1;

/**
 * Effectue une requête JSON-RPC brute (utilisée par login + execute_kw).
 */
async function jsonRpcRequest<T>(
  instanceUrl: string,
  body: JsonRpcRequest,
  endpointForLog: string
): Promise<T> {
  const url = `${instanceUrl}/jsonrpc`;
  const requestInit: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, requestInit);
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
      const text = await response.text();
      if (!response.ok) {
        throw new OdooApiError(response.status, endpointForLog, text);
      }
      const json = JSON.parse(text) as JsonRpcResponse<T>;
      if ("error" in json) {
        throw new OdooApiError(
          response.status,
          endpointForLog,
          JSON.stringify(json.error).slice(0, 400),
          json.error.code
        );
      }
      return json.result;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES && !(error instanceof OdooApiError)) {
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new Error(`Odoo request failed on ${endpointForLog}`);
}

// ─── Auth (login → uid) ────────────────────────────────────────────────────

/**
 * Authentifie un utilisateur Odoo et renvoie son uid (int) si succès.
 * Renvoie null si les credentials sont invalides.
 */
export async function odooLogin(params: {
  instanceUrl: string;
  database: string;
  login: string;
  apiKey: string;
}): Promise<number | null> {
  const result = await jsonRpcRequest<number | false>(
    params.instanceUrl,
    {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "common",
        method: "login",
        args: [params.database, params.login, params.apiKey],
      },
      id: requestIdCounter++,
    },
    "/jsonrpc:common.login"
  );
  return result === false ? null : result;
}

// ─── execute_kw (toutes les opérations sur les modèles) ────────────────────

/**
 * Appelle une méthode sur un modèle Odoo. C'est l'équivalent d'un GET/POST sur
 * une ressource, mais en RPC : on précise le modèle, la méthode (search_read,
 * read_group, etc.) et les arguments.
 *
 * Cache l'uid sur la connection au premier appel (mutation in-place pour les
 * appels suivants du même sync). Si la connection n'a pas d'uid en cache,
 * on fait un login automatique.
 */
export async function odooExecuteKw<T>(
  connection: Connection,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  if (connection.auth.mode !== "odoo_session") {
    throw new Error(
      `Odoo adapter requires odoo_session auth, got "${connection.auth.mode}"`
    );
  }

  const { instanceUrl, database, login, accessToken: apiKey } = connection.auth;

  // Login pour récupérer l'uid (à chaque appel, c'est rapide). Pour optimiser
  // sur de gros syncs, on pourrait cacher l'uid dans connection.auth en
  // mutation in-place — mais les syncs sont des opérations courtes et on évite
  // la complexité d'un cache pour Phase 1.
  const uid = await odooLogin({ instanceUrl, database, login, apiKey });
  if (!uid) {
    throw new OdooApiError(401, "/jsonrpc:common.login", "Authentication failed");
  }

  return jsonRpcRequest<T>(
    instanceUrl,
    {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [database, uid, apiKey, model, method, args, kwargs],
      },
      id: requestIdCounter++,
    },
    `/jsonrpc:${model}.${method}`
  );
}

// ─── Helpers ORM (sucre syntaxique sur execute_kw) ─────────────────────────

export type OdooDomain = (string | number | unknown[])[];

export type SearchReadOptions = {
  domain?: OdooDomain;
  fields?: string[];
  offset?: number;
  limit?: number;
  order?: string;
};

/**
 * Équivalent du SELECT SQL : recherche + lecture en une requête.
 */
export async function odooSearchRead<T = Record<string, unknown>>(
  connection: Connection,
  model: string,
  options: SearchReadOptions = {}
): Promise<T[]> {
  return odooExecuteKw<T[]>(
    connection,
    model,
    "search_read",
    [options.domain ?? []],
    {
      fields: options.fields,
      offset: options.offset,
      limit: options.limit,
      order: options.order,
    }
  );
}

export type ReadGroupOptions = {
  domain?: OdooDomain;
  fields: string[]; // ex: ["debit:sum", "credit:sum"]
  groupby: string[];
  offset?: number;
  limit?: number;
  orderby?: string;
  lazy?: boolean;
};

/**
 * Équivalent du GROUP BY SQL : agrège des champs par groupe.
 */
export async function odooReadGroup<T = Record<string, unknown>>(
  connection: Connection,
  model: string,
  options: ReadGroupOptions
): Promise<T[]> {
  return odooExecuteKw<T[]>(
    connection,
    model,
    "read_group",
    [
      options.domain ?? [],
      options.fields,
      options.groupby,
    ],
    {
      offset: options.offset,
      limit: options.limit,
      orderby: options.orderby,
      lazy: options.lazy ?? false,
    }
  );
}

/**
 * Vérifie qu'une connection Odoo est valide en tentant un login.
 */
export async function odooVerifyAuth(params: {
  instanceUrl: string;
  database: string;
  login: string;
  apiKey: string;
}): Promise<{ ok: boolean; uid: number | null; error: string | null }> {
  try {
    const uid = await odooLogin(params);
    return { ok: uid !== null, uid, error: uid === null ? "Identifiants Odoo invalides." : null };
  } catch (error) {
    return {
      ok: false,
      uid: null,
      error: error instanceof Error ? error.message : "Erreur inconnue lors du login Odoo",
    };
  }
}
