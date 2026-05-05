// POST /api/integrations/bridge/sync
//
// Body  : { analysisId?: string } — optionnel, si fourni on attache le
//          BankingSummary à cette analyse. Sinon on crée un nouveau doc
//          dédié dans la collection `banking_summaries`.
// Auth  : header Authorization: Bearer <Firebase ID token>
//
// Récupère les comptes + transactions Bridge avec le token persisté sur la
// connection, construit le `BankingSummary` (cf. summaryBuilder) et le stocke
// côté analyse Firestore (champ `bankingSummary`).
//
// Important : le BankingSummary vit À CÔTÉ de dailyAccounting / balanceSheetSnapshot,
// pas dedans. C'est une couche complémentaire — l'analyse comptable garde sa
// structure existante intacte.

import { NextResponse, type NextRequest } from "next/server";
import { decryptToken } from "@/lib/server/tokenCrypto";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import {
  buildBridgeClientFromEnv,
  fetchBridgeAccounts,
  fetchBridgeTransactions,
  fetchBridgeCategories,
  mapBridgeAccountToInternal,
  mapBridgeTransactionToInternal,
  buildBankingSummary,
} from "@/services/integrations/adapters/bridge";
import { listUserConnections, updateSyncStatus } from "@/services/integrations/storage/connectionStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import type { BankAccount, BankingSummary } from "@/types/banking";

export const runtime = "nodejs";

type SyncRequestBody = { analysisId?: string };

const ANALYSES_COLLECTION = "analyses";
const BANKING_COLLECTION = "banking_summaries";

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  let body: SyncRequestBody = {};
  try {
    body = (await request.json()) as SyncRequestBody;
  } catch {
    // body vide accepté — on crée un summary standalone
  }

  // Connection Bridge active de l'utilisateur
  const connections = await listUserConnections(userId, "bridge");
  const active = connections.find((c) => c.status === "active");
  if (!active) {
    return NextResponse.json(
      { error: "Aucune connexion Bridge active. Connectez votre banque d'abord." },
      { status: 404 }
    );
  }

  // Récupère le token user en clair via le record brut (listUserConnections
  // retourne déjà du chiffré). On lit le doc directement pour décrypter.
  const db = getFirebaseAdminFirestore();
  const connDoc = await db.collection("connections").doc(active.id).get();
  const connRecord = connDoc.data() as { encryptedAccessToken?: string } | undefined;
  if (!connRecord?.encryptedAccessToken) {
    return NextResponse.json(
      { error: "Connexion Bridge corrompue (token absent)." },
      { status: 500 }
    );
  }
  const userAccessToken = decryptToken(connRecord.encryptedAccessToken);

  await updateSyncStatus(active.id, "in_progress");

  try {
    const userClient = buildBridgeClientFromEnv(userAccessToken);

    // Catégories d'abord — on en a besoin pour résoudre les labels lors du
    // build du summary. Léger (~80 entrées), pas paginé en pratique.
    const [rawAccounts, rawTransactions, categories] = await Promise.all([
      fetchBridgeAccounts(userClient),
      fetchBridgeTransactions(userClient, { maxPages: 50 }),
      fetchBridgeCategories(userClient),
    ]);

    // Mapping Bridge → format interne. Le bridgeAccountId → id interne map
    // garantit que les transactions pointent vers le bon compte interne.
    const accounts: BankAccount[] = rawAccounts.map((a) => mapBridgeAccountToInternal(a));
    const accountIdByBridgeId = new Map(accounts.map((a) => [a.bridgeAccountId, a.id]));
    const transactions = rawTransactions.map((tx) =>
      mapBridgeTransactionToInternal(tx, {
        accountIdResolver: (bridgeId) => accountIdByBridgeId.get(bridgeId) ?? String(bridgeId),
      })
    );

    const rawSummary: BankingSummary = buildBankingSummary({
      accounts,
      transactions,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
    });
    // Firestore refuse les valeurs `undefined` ; or les types BankAccount /
    // BankTransaction ont des champs optionnels (iban?, rawDescription?,
    // sparklinePoints?). On purge récursivement les undefined avant l'écrit.
    const summary = stripUndefined(rawSummary) as BankingSummary;

    // Persistance : si analysisId fourni, on attache au doc analyse. Sinon
    // doc dédié dans banking_summaries (clé = userId — un summary par user).
    if (body.analysisId) {
      await db.collection(ANALYSES_COLLECTION).doc(body.analysisId).update({
        bankingSummary: summary,
      });
    } else {
      await db.collection(BANKING_COLLECTION).doc(userId).set(
        {
          userId,
          summary,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    await updateSyncStatus(active.id, "success");

    return NextResponse.json({
      accountsCount: accounts.length,
      transactionsCount: transactions.length,
      totalBalance: summary.totalBalance,
      runway: summary.runway,
      lastSyncAt: summary.lastSyncAt,
    });
  } catch (error) {
    await updateSyncStatus(
      active.id,
      "failed",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      {
        error: "Échec sync Bridge.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}

/**
 * Purge récursivement les valeurs `undefined` d'un objet/tableau pour
 * compatibilité Firestore (qui refuse `undefined`). Préserve `null`,
 * tableaux, dates ISO (strings), nombres.
 *
 * Pourquoi pas activer `ignoreUndefinedProperties` côté Firebase Admin :
 * c'est un setting global qui pourrait masquer des bugs ailleurs (un
 * champ qu'on aurait OUBLIÉ de remplir, plutôt que choisi d'omettre).
 * Ici on cible explicitement le payload Bridge.
 */
function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out;
  }
  return value;
}
