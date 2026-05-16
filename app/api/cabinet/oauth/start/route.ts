// POST /api/cabinet/oauth/start
// Initie le flow OAuth Pennylane Firm (Sprint C). Crée un state CSRF
// stocké en Firestore (TTL 10 min), retourne l'URL d'autorisation.
// Le callback est /api/integrations/pennylane/firm/callback.

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const OAUTH_STATES_COLLECTION = "oauth_states";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const DEFAULT_AUTHORIZE_URL = "https://app.pennylane.com/oauth/authorize";
const DEFAULT_SCOPES = [
  "categories:readonly",
  "customers:readonly",
  "fiscal_years:readonly",
  "journals:readonly",
  "ledger_accounts:readonly",
  "ledger_entries:readonly",
  "suppliers:readonly",
  "transactions:readonly",
  "trial_balance:readonly",
  "companies:readonly",
  "dms_files:readonly",
].join(" ");

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

  const clientId = process.env.PENNYLANE_FIRM_CLIENT_ID;
  const redirectUri = process.env.PENNYLANE_FIRM_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        error: "Pennylane Firm OAuth non configuré.",
        detail: "PENNYLANE_FIRM_CLIENT_ID / _REDIRECT_URI manquants côté serveur.",
      },
      { status: 503 }
    );
  }

  // Lit le firmId du user (créé via /onboarding) pour le persister dans le state.
  const db = getFirebaseAdminFirestore();
  const userDoc = await db.collection("users").doc(userId).get();
  const firmId = userDoc.exists ? (userDoc.data()?.firmId as string | undefined) : undefined;

  // Génère + persiste le state CSRF.
  const state = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
  await db
    .collection(OAUTH_STATES_COLLECTION)
    .doc(state)
    .set({
      userId,
      provider: "pennylane",
      kind: "firm",
      firmId: firmId ?? null,
      createdAt: new Date().toISOString(),
      expiresAt,
    });

  const scopes = process.env.PENNYLANE_FIRM_SCOPES?.trim() || DEFAULT_SCOPES;
  const authorizeBase = process.env.PENNYLANE_OAUTH_AUTHORIZE_URL || DEFAULT_AUTHORIZE_URL;
  const authorizeUrl = new URL(authorizeBase);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", scopes);
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.json({ authorizeUrl: authorizeUrl.toString(), state }, { status: 200 });
}
