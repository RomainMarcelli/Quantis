// GET /api/integrations/pennylane/firm/authorize-url
// Construit l'URL OAuth Pennylane Firm côté serveur (pas d'exposition du
// client_id au bundle JS) et persiste le state CSRF en Firestore avec
// kind="firm" + userId. Le callback unifié /api/integrations/pennylane/callback
// retrouve userId + kind via le state.
//
// Authentification : Bearer Firebase ID token requis (l'utilisateur doit
// être loggué pour lier la future Connection à son compte).
//
// Le state est préfixé "firm:" pour défense en profondeur côté callback.

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const OAUTH_STATES_COLLECTION = "oauth_states";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const DEFAULT_AUTHORIZE_URL = "https://app.pennylane.com/oauth/authorize";
// Les 11 scopes Firm API documentés par Pennylane (brief 13/05/2026).
// Toute autre valeur (accounting/invoices/products/bank_accounts/employees/firms)
// fait répondre Pennylane "scope invalide ou mal formé".
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

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const clientId = process.env.PENNYLANE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Pennylane credentials not configured" },
      { status: 500 }
    );
  }

  const redirectUri =
    process.env.PENNYLANE_REDIRECT_URI ||
    `${process.env.APP_BASE_URL}/api/integrations/pennylane/callback`;

  // Lit le firmId du user (créé via /onboarding) pour le persister dans le state.
  const db = getFirebaseAdminFirestore();
  const userDoc = await db.collection("users").doc(userId).get();
  const firmId = userDoc.exists ? (userDoc.data()?.firmId as string | undefined) : undefined;

  // State préfixé "firm:" — défense en profondeur côté callback unifié.
  const state = `firm:${randomBytes(24).toString("base64url")}`;
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

  const authorizeBase =
    process.env.PENNYLANE_OAUTH_AUTHORIZE_URL || DEFAULT_AUTHORIZE_URL;
  // Scopes hard-codés : la liste documentée Pennylane Firm est figée à 11
  // valeurs ; rendre ça paramétrable via env a déjà fait casser la prod
  // (variable mise à des scopes inventés). Modifier ici si Pennylane publie
  // une nouvelle liste.
  const scope = DEFAULT_SCOPES;

  const authorizeUrl = new URL(authorizeBase);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.json({
    authorizeUrl: authorizeUrl.toString(),
  });
}
