// Fetchers Bridge — couche fine qui interroge les endpoints Bridge et
// retourne les données BRUTES (formats Bridge tels quels). Le mapping vers
// notre format interne (`BankAccount`, `BankTransaction`) vit dans `mappers.ts`.
//
// Pourquoi cette séparation : on veut pouvoir tester les mappers sur des
// fixtures JSON Bridge sans appeler l'API. Les fetchers restent fins → 1
// fonction = 1 endpoint, peu de logique.

import { BridgeClient } from "@/services/integrations/adapters/bridge/client";

// ─── Types Bridge bruts (forme exacte de la réponse API) ───────────────────

export type BridgeRawAccount = {
  id: number;
  name: string;
  /** Type Bridge (ex. "checking", "savings", "loan", "credit_card", "card"). */
  type: string;
  balance: number;
  currency_code: string;
  iban?: string | null;
  /** Provider = banque sous-jacente (ex. { name: "BNP Paribas" }). */
  provider?: { name?: string | null } | null;
  /** Quand le compte a été rafraîchi par Bridge (ISO). */
  updated_at?: string | null;
};

export type BridgeRawTransaction = {
  id: number;
  account_id: number;
  amount: number;
  /** Date de l'opération côté banque (YYYY-MM-DD). */
  date: string;
  clean_description?: string | null;
  provider_description?: string | null;
  /** Type d'opération côté Bridge (ex. "card", "transfer", "direct_debit"…). */
  operation_type?: string | null;
  category_id: number;
  is_future?: boolean | null;
};

export type BridgeRawCategory = {
  id: number;
  name: string;
};

export type BridgeConnectSession = {
  /** URL à ouvrir dans le navigateur pour le flux interactif. */
  url: string;
  /** ID de la session — peut servir au polling status. */
  id: string;
};

export type BridgeUser = {
  uuid: string;
  /** ID externe fourni à la création (= notre identifiant Vyzor pour le user). */
  external_user_id: string;
};

export type BridgeUserToken = {
  access_token: string;
  expires_at?: string;
  user?: BridgeUser;
};

// ─── Endpoints "app" (auth Client-Id/Client-Secret seulement) ──────────────

/**
 * Crée un utilisateur Bridge. Bridge v3 attend `external_user_id` — un ID
 * stable côté Vyzor (ex. uid Firebase ou hash email). Si l'utilisateur existe
 * déjà, Bridge renvoie 409 — on laisse l'appelant gérer.
 */
export async function createBridgeUser(
  client: BridgeClient,
  externalUserId: string
): Promise<BridgeUser> {
  return client.request<BridgeUser>("/v3/aggregation/users", {
    method: "POST",
    body: { external_user_id: externalUserId },
  });
}

/**
 * Récupère un access_token utilisateur (court-vivant). Bridge l'utilise pour
 * rendre la session Connect personnalisée et pour les requêtes /accounts et
 * /transactions sur les données de cet utilisateur.
 */
export async function authenticateBridgeUser(
  client: BridgeClient,
  externalUserId: string
): Promise<BridgeUserToken> {
  return client.request<BridgeUserToken>("/v3/aggregation/authorization/token", {
    method: "POST",
    body: { external_user_id: externalUserId },
  });
}

/**
 * Crée une session Connect : c'est cette URL que l'utilisateur ouvre dans
 * son navigateur pour autoriser une banque (avec SCA en sandbox simulée).
 * Bridge invalide la session côté serveur quand l'utilisateur termine — le
 * front polle ensuite /accounts pour confirmer la connexion.
 *
 * Auth : le client DOIT porter le bearer user (la session est nominative).
 * Body : `user_email` est OBLIGATOIRE — Bridge l'utilise pour pré-remplir
 * le widget Connect et pour les notifications. Pas un secret — on peut
 * passer l'email Vyzor du dirigeant.
 */
export async function createBridgeConnectSession(
  client: BridgeClient,
  options: { userEmail: string; redirectUrl?: string }
): Promise<BridgeConnectSession> {
  return client.request<BridgeConnectSession>(
    "/v3/aggregation/connect-sessions",
    {
      method: "POST",
      body: {
        user_email: options.userEmail,
        redirect_url: options.redirectUrl,
      },
    }
  );
}

// ─── Endpoints "user" (avec Authorization: Bearer <user_token>) ────────────

/**
 * Liste les comptes bancaires de l'utilisateur courant. Bridge n'expose pas
 * forcément une pagination ici (peu de comptes par utilisateur), mais on
 * passe par `paginate` pour rester safe si le nombre dépasse la page par
 * défaut.
 */
export async function fetchBridgeAccounts(
  client: BridgeClient
): Promise<BridgeRawAccount[]> {
  return client.paginate<BridgeRawAccount>("/v3/aggregation/accounts", {
    maxPages: 5,
  });
}

/**
 * Liste les transactions paginées. `since` filtre les transactions après une
 * date donnée (ISO). `accountId` cible un compte précis. La pagination est
 * gérée automatiquement par BridgeClient.paginate.
 */
export async function fetchBridgeTransactions(
  client: BridgeClient,
  options: {
    since?: string;
    minDate?: string;
    maxDate?: string;
    accountId?: number;
    /** Borne le nombre de pages — utile en script pour ne pas saturer. */
    maxPages?: number;
  } = {}
): Promise<BridgeRawTransaction[]> {
  const query: Record<string, string> = {};
  if (options.since) query.since = options.since;
  if (options.minDate) query.min_date = options.minDate;
  if (options.maxDate) query.max_date = options.maxDate;
  if (options.accountId !== undefined) query.account_id = String(options.accountId);
  return client.paginate<BridgeRawTransaction>("/v3/aggregation/transactions", {
    maxPages: options.maxPages ?? 50,
    initialQuery: query,
  });
}

/**
 * Liste les catégories Bridge (pour résoudre `categoryId` → label). Cache
 * possible côté serveur : la liste change rarement (~80 entrées). En MVP on
 * la récupère à chaque sync sans cache.
 */
export async function fetchBridgeCategories(
  client: BridgeClient
): Promise<BridgeRawCategory[]> {
  return client.paginate<BridgeRawCategory>("/v3/aggregation/categories", {
    maxPages: 3,
  });
}
