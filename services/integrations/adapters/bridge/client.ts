// Client HTTP Bridge (Open Banking PSD2).
//
// Auth combinée :
//   - Headers app : Client-Id + Client-Secret (constants par instance Vyzor)
//   - Header user (optionnel) : Authorization: Bearer <user_access_token>
//
// Pagination : Bridge utilise une pagination cursor-based via le query param
// `after`. La réponse expose `pagination.next_uri` (URL absolue) ou null. On
// boucle en passant le cursor extrait depuis next_uri.
//
// Rate limiting : Bridge n'a pas de quota strict documenté côté sandbox. On
// implémente un simple guard 100 ms entre 2 requêtes pour éviter les bursts
// accidentels lors d'une pagination longue (peut être assoupli en prod si
// nécessaire).

const DEFAULT_BASE_URL = "https://api.bridgeapi.io";
const DEFAULT_BRIDGE_VERSION = "2025-01-15";
const REQUEST_DELAY_MS = 100;

export type BridgeClientOptions = {
  clientId: string;
  clientSecret: string;
  /** Override base URL (utile pour tests / proxy interne). */
  baseUrl?: string;
  /** Version d'API Bridge — figée pour reproductibilité. */
  bridgeVersion?: string;
  /** Token utilisateur — null/undefined pour les endpoints "app" (register, etc.). */
  userAccessToken?: string | null;
};

export type BridgeFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Override per-request du token user (ex: register basculer sans token). */
  userAccessToken?: string | null;
};

export type BridgePaginationResponse<T> = {
  resources: T[];
  pagination: {
    /** URL absolue de la page suivante, null si dernière page. */
    next_uri: string | null;
  };
};

export class BridgeClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private readonly bridgeVersion: string;
  private userAccessToken: string | null;
  private lastRequestAt = 0;

  constructor(options: BridgeClientOptions) {
    if (!options.clientId || !options.clientSecret) {
      throw new Error("BridgeClient: clientId et clientSecret sont requis.");
    }
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.bridgeVersion = options.bridgeVersion ?? DEFAULT_BRIDGE_VERSION;
    this.userAccessToken = options.userAccessToken ?? null;
  }

  setUserAccessToken(token: string | null): void {
    this.userAccessToken = token;
  }

  /** Bas niveau : exécute une requête Bridge avec headers + JSON parsing. */
  async request<T>(path: string, options: BridgeFetchOptions = {}): Promise<T> {
    await this.throttle();
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const userToken =
      options.userAccessToken !== undefined
        ? options.userAccessToken
        : this.userAccessToken;
    const headers: Record<string, string> = {
      "Bridge-Version": this.bridgeVersion,
      "Client-Id": this.clientId,
      "Client-Secret": this.clientSecret,
      "Content-Type": "application/json",
      accept: "application/json",
    };
    if (userToken) headers["Authorization"] = `Bearer ${userToken}`;

    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BridgeApiError(res.status, text || res.statusText, url);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /**
   * Itère sur toutes les pages d'un endpoint paginé. Retourne le tableau
   * concaténé. Limite optionnelle (`maxPages`) pour borner la pagination
   * dans les contextes de scripts où on veut éviter une explosion de
   * requêtes en cas de bug API.
   */
  async paginate<T>(
    path: string,
    options: { maxPages?: number; initialQuery?: Record<string, string> } = {}
  ): Promise<T[]> {
    const maxPages = options.maxPages ?? 100;
    const all: T[] = [];
    let nextUri: string | null = this.appendQuery(path, options.initialQuery);
    let page = 0;
    while (nextUri && page < maxPages) {
      const res: BridgePaginationResponse<T> = await this.request(nextUri);
      all.push(...res.resources);
      nextUri = res.pagination?.next_uri ?? null;
      page++;
    }
    return all;
  }

  /** Append querystring à une URL relative. Pas de gestion fancy : pas de
   *  collision attendue (Bridge a des querystrings simples). */
  private appendQuery(path: string, query?: Record<string, string>): string {
    if (!query || Object.keys(query).length === 0) return path;
    const params = new URLSearchParams(query).toString();
    return path.includes("?") ? `${path}&${params}` : `${path}?${params}`;
  }

  /** Throttle simple à 1 requête / 100 ms. Évite les bursts en pagination. */
  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < REQUEST_DELAY_MS) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS - elapsed));
    }
    this.lastRequestAt = Date.now();
  }
}

export class BridgeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly bodyText: string,
    public readonly url: string
  ) {
    super(`Bridge API ${status} on ${url}: ${bodyText.slice(0, 240)}`);
    this.name = "BridgeApiError";
  }
}

/**
 * Construit un client Bridge à partir des variables d'env. Utilisé par les
 * fetchers et les routes API. Lève si les credentials manquent — préférable
 * à un client silencieusement cassé qui produit des 401 confus.
 */
export function buildBridgeClientFromEnv(
  userAccessToken?: string | null
): BridgeClient {
  const clientId = process.env.BRIDGE_CLIENT_ID;
  const clientSecret = process.env.BRIDGE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "BRIDGE_CLIENT_ID et BRIDGE_CLIENT_SECRET sont requis dans l'env."
    );
  }
  return new BridgeClient({
    clientId,
    clientSecret,
    baseUrl: process.env.BRIDGE_BASE_URL,
    bridgeVersion: process.env.BRIDGE_VERSION,
    userAccessToken: userAccessToken ?? null,
  });
}
