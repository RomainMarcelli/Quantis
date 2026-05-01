// POST /api/integrations/bridge/connect
//
// Body  : { userEmail: string }
// Auth  : header Authorization: Bearer <Firebase ID token>
//
// Crée (ou réutilise) un utilisateur Bridge, génère un access_token, crée
// une session Connect et retourne l'URL à ouvrir dans le navigateur. Le
// front redirige l'utilisateur vers cette URL — la connexion banque se
// passe entièrement chez Bridge (SCA, choix de la banque, etc.).
//
// Une fois la connexion validée par l'utilisateur, le front appelle
// POST /api/integrations/bridge/sync pour récupérer les comptes/transactions
// et persister la connection + le BankingSummary côté Vyzor.

import { NextResponse, type NextRequest } from "next/server";
import {
  buildBridgeClientFromEnv,
  createBridgeUser,
  authenticateBridgeUser,
  createBridgeConnectSession,
} from "@/services/integrations/adapters/bridge";
import {
  ConnectionAlreadyExistsError,
  createConnection,
  listUserConnections,
} from "@/services/integrations/storage/connectionStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";

export const runtime = "nodejs";

/**
 * Body :
 *  - `externalUserId` (optionnel) : par défaut on utilise le `userId`
 *    Firebase comme clé stable côté Bridge.
 *  - `userEmail` (obligatoire) : Bridge l'exige pour la session Connect
 *    (pré-remplissage du widget + notifications). Le front passe l'email
 *    du dirigeant ; en sandbox on accepte un email synthétique.
 */
type ConnectRequestBody = { externalUserId?: string; userEmail?: string };

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

  let body: ConnectRequestBody = {};
  try {
    body = (await request.json()) as ConnectRequestBody;
  } catch {
    // body vide accepté
  }

  const externalUserId = body.externalUserId?.trim() || userId;
  const userEmail = body.userEmail?.trim();
  if (!userEmail) {
    return NextResponse.json(
      { error: "userEmail manquant — requis par Bridge pour la session Connect." },
      { status: 400 }
    );
  }

  try {
    const appClient = buildBridgeClientFromEnv();

    // Crée l'utilisateur Bridge (idempotent côté API — 409 silencieux ici).
    try {
      await createBridgeUser(appClient, externalUserId);
    } catch {
      // utilisateur déjà existant ou erreur transitoire — on tente l'auth ci-dessous
    }

    const userToken = await authenticateBridgeUser(appClient, externalUserId);

    // Persiste la connection AVANT la session Connect — la route /sync
    // tirera les données via ce token. La connection est "active" même
    // sans comptes (un sync ultérieur les remplira).
    const existing = await listUserConnections(userId, "bridge");
    const stillActive = existing.find((c) => c.status === "active");
    if (!stillActive) {
      try {
        await createConnection({
          userId,
          provider: "bridge",
          providerSub: null,
          auth: {
            mode: "oauth2",
            accessToken: userToken.access_token,
            refreshToken: null,
            tokenExpiresAt: userToken.expires_at ?? null,
            scopes: [],
            externalCompanyId: externalUserId,
          },
        });
      } catch (err) {
        if (!(err instanceof ConnectionAlreadyExistsError)) throw err;
      }
    }

    // La session Connect EXIGE le bearer user — on construit un client avec
    // le token utilisateur frais.
    const userClient = buildBridgeClientFromEnv(userToken.access_token);
    const session = await createBridgeConnectSession(userClient, {
      userEmail,
      callbackUrl: request.nextUrl.origin
        ? `${request.nextUrl.origin}/integrations/bridge/callback`
        : undefined,
    });

    return NextResponse.json(
      {
        connectUrl: session.url,
        sessionId: session.id,
        externalUserId,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Échec de la création de la session Bridge.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
