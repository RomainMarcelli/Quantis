// CRUD serveur pour les connexions aux logiciels comptables tiers.
// Utilise Firebase Admin (jamais le SDK client) car les tokens chiffrés ne doivent jamais transiter
// par le navigateur. Les API routes sont le seul point d'entrée.

import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { decryptToken, encryptToken } from "@/lib/server/tokenCrypto";
import type {
  Connection,
  ConnectionRecord,
  ConnectionStatus,
  ConnectionSyncCursors,
  ConnectorAuth,
  ConnectorProvider,
  ConnectorProviderSub,
  SyncCursor,
} from "@/types/connectors";

const COLLECTION = "connections";

// Cursor vide par défaut pour chaque entité.
const EMPTY_CURSOR: SyncCursor = {
  paginationCursor: null,
  lastSyncedAt: null,
};

const EMPTY_SYNC_CURSORS: ConnectionSyncCursors = {
  entries: { ...EMPTY_CURSOR },
  invoices: { ...EMPTY_CURSOR },
  ledgerAccounts: { ...EMPTY_CURSOR },
  contacts: { ...EMPTY_CURSOR },
  journals: { ...EMPTY_CURSOR },
  bankTransactions: { ...EMPTY_CURSOR },
};

/** Masque un token en gardant les premiers et derniers caractères pour identification visuelle.
 *  Format : 6 premiers caractères + "…" + 4 derniers caractères. Le reste est masqué.
 */
function buildTokenPreview(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length <= 10) return "****";
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

// ─── Création ────────────────────────────────────────────────────────────────

export type CreateConnectionInput = {
  userId: string;
  provider: ConnectorProvider;
  providerSub: ConnectorProviderSub;
  auth: ConnectorAuth;
};

/**
 * Erreur typée levée par `createConnection` quand l'utilisateur a déjà une
 * connexion ACTIVE pour le même provider. Permet aux routes connect de
 * répondre 409 avec un message clair + l'id de la connexion existante (utile
 * pour que le front propose une "Resync" ou "Disconnect" plutôt que de
 * créer un doublon).
 */
export class ConnectionAlreadyExistsError extends Error {
  constructor(
    public readonly userId: string,
    public readonly provider: ConnectorProvider,
    public readonly existingConnectionId: string
  ) {
    super(
      `Une connexion ${provider} active existe déjà pour cet utilisateur (id=${existingConnectionId}).`
    );
    this.name = "ConnectionAlreadyExistsError";
  }
}

export async function createConnection(input: CreateConnectionInput): Promise<Connection> {
  // Garde-fou : une seule connexion ACTIVE par (userId, provider).
  // Les connexions revoked/expired/error ne bloquent pas (l'utilisateur peut
  // re-connecter après un disconnect ou un échec de rotation de token).
  const existing = await listUserConnections(input.userId, input.provider);
  const stillActive = existing.find((c) => c.status === "active");
  if (stillActive) {
    throw new ConnectionAlreadyExistsError(input.userId, input.provider, stillActive.id);
  }

  const db = getFirebaseAdminFirestore();
  const docRef = db.collection(COLLECTION).doc();
  const createdAt = new Date().toISOString();

  const record: Omit<ConnectionRecord, "id"> = {
    userId: input.userId,
    provider: input.provider,
    providerSub: input.providerSub,
    status: "active",
    authMode: input.auth.mode,
    encryptedAccessToken: encryptToken(input.auth.accessToken),
    encryptedRefreshToken:
      input.auth.mode === "oauth2" && input.auth.refreshToken
        ? encryptToken(input.auth.refreshToken)
        : null,
    tokenPreview: buildTokenPreview(input.auth.accessToken),
    tokenExpiresAt: input.auth.mode === "oauth2" ? input.auth.tokenExpiresAt : null,
    scopes: input.auth.mode === "oauth2" ? input.auth.scopes : [],
    externalCompanyId:
      input.auth.mode === "firm_token"
        ? ""
        : input.auth.mode === "partner_jwt"
          ? input.auth.externalCompanyId
          : input.auth.mode === "odoo_session"
            ? input.auth.externalCompanyId
            : input.auth.externalCompanyId,
    externalFirmId: input.auth.mode === "firm_token" ? input.auth.externalFirmId : null,
    odooInstanceUrl: input.auth.mode === "odoo_session" ? input.auth.instanceUrl : null,
    odooDatabase: input.auth.mode === "odoo_session" ? input.auth.database : null,
    odooLogin: input.auth.mode === "odoo_session" ? input.auth.login : null,
    syncCursors: { ...EMPTY_SYNC_CURSORS },
    lastSyncAt: null,
    lastSyncStatus: "never",
    lastSyncError: null,
    createdAt,
  };

  await docRef.set(record);
  return toConnection({ ...record, id: docRef.id });
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

export async function getConnectionById(connectionId: string): Promise<Connection | null> {
  const db = getFirebaseAdminFirestore();
  const snap = await db.collection(COLLECTION).doc(connectionId).get();
  if (!snap.exists) {
    return null;
  }
  return toConnection({ ...(snap.data() as Omit<ConnectionRecord, "id">), id: snap.id });
}

export async function getUserConnectionById(
  userId: string,
  connectionId: string
): Promise<Connection | null> {
  const conn = await getConnectionById(connectionId);
  if (!conn || conn.userId !== userId) {
    return null;
  }
  return conn;
}

export async function listUserConnections(
  userId: string,
  provider?: ConnectorProvider
): Promise<Connection[]> {
  const db = getFirebaseAdminFirestore();
  let query = db.collection(COLLECTION).where("userId", "==", userId);
  if (provider) {
    query = query.where("provider", "==", provider);
  }
  const snap = await query.get();
  return snap.docs.map((doc) =>
    toConnection({ ...(doc.data() as Omit<ConnectionRecord, "id">), id: doc.id })
  );
}

// ─── Mise à jour ────────────────────────────────────────────────────────────

// Refresh des tokens après un OAuth refresh.
export async function updateConnectionTokens(
  connectionId: string,
  auth: ConnectorAuth
): Promise<void> {
  const db = getFirebaseAdminFirestore();
  const update: Partial<ConnectionRecord> = {
    authMode: auth.mode,
    encryptedAccessToken: encryptToken(auth.accessToken),
    encryptedRefreshToken:
      auth.mode === "oauth2" && auth.refreshToken ? encryptToken(auth.refreshToken) : null,
    tokenPreview: buildTokenPreview(auth.accessToken),
    tokenExpiresAt: auth.mode === "oauth2" ? auth.tokenExpiresAt : null,
    scopes: auth.mode === "oauth2" ? auth.scopes : [],
  };
  await db.collection(COLLECTION).doc(connectionId).update(update);
}

export async function updateSyncStatus(
  connectionId: string,
  status: ConnectionRecord["lastSyncStatus"],
  error: string | null = null
): Promise<void> {
  const db = getFirebaseAdminFirestore();
  await db.collection(COLLECTION).doc(connectionId).update({
    lastSyncStatus: status,
    lastSyncAt: status === "in_progress" ? FieldValue.serverTimestamp() : new Date().toISOString(),
    lastSyncError: error,
  });
}

export async function updateSyncCursor(
  connectionId: string,
  entity: keyof ConnectionSyncCursors,
  cursor: SyncCursor
): Promise<void> {
  const db = getFirebaseAdminFirestore();
  await db
    .collection(COLLECTION)
    .doc(connectionId)
    .update({ [`syncCursors.${entity}`]: cursor });
}

export async function updateConnectionStatus(
  connectionId: string,
  status: ConnectionStatus,
  error: string | null = null
): Promise<void> {
  const db = getFirebaseAdminFirestore();
  await db
    .collection(COLLECTION)
    .doc(connectionId)
    .update({ status, lastSyncError: error });
}

// ─── Suppression ─────────────────────────────────────────────────────────────

export async function deleteConnection(connectionId: string): Promise<void> {
  const db = getFirebaseAdminFirestore();
  await db.collection(COLLECTION).doc(connectionId).delete();
}

// ─── Conversion record ↔ Connection ─────────────────────────────────────────

function toConnection(record: ConnectionRecord): Connection {
  const auth = decryptAuth(record);
  // On retire les champs encryptés de l'objet exposé en mémoire.
  const {
    encryptedAccessToken: _a,
    encryptedRefreshToken: _r,
    ...rest
  } = record;
  // Rétrocompat : les connections créées avant l'ajout du champ tokenPreview
  // n'en ont pas → on le calcule à la volée depuis le token déchiffré.
  const tokenPreview = rest.tokenPreview ?? buildTokenPreview(auth.accessToken);
  return { ...rest, tokenPreview, auth };
}

function decryptAuth(record: ConnectionRecord): ConnectorAuth {
  const accessToken = decryptToken(record.encryptedAccessToken);
  switch (record.authMode) {
    case "company_token":
      return {
        mode: "company_token",
        accessToken,
        externalCompanyId: record.externalCompanyId,
      };
    case "firm_token":
      return {
        mode: "firm_token",
        accessToken,
        externalFirmId: record.externalFirmId ?? "",
      };
    case "oauth2":
      return {
        mode: "oauth2",
        accessToken,
        refreshToken: record.encryptedRefreshToken
          ? decryptToken(record.encryptedRefreshToken)
          : null,
        tokenExpiresAt: record.tokenExpiresAt,
        scopes: record.scopes,
        externalCompanyId: record.externalCompanyId,
      };
    case "partner_jwt":
      return {
        mode: "partner_jwt",
        accessToken,
        externalCompanyId: record.externalCompanyId,
      };
    case "odoo_session":
      return {
        mode: "odoo_session",
        accessToken,
        instanceUrl: record.odooInstanceUrl ?? "",
        database: record.odooDatabase ?? "",
        login: record.odooLogin ?? "",
        externalCompanyId: record.externalCompanyId,
      };
  }
}
