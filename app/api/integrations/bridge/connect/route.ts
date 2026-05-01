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

type ConnectRequestBody = { userEmail?: string };

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

  let body: ConnectRequestBody;
  try {
    body = (await request.json()) as ConnectRequestBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const userEmail = body.userEmail?.trim();
  if (!userEmail) {
    return NextResponse.json({ error: "userEmail manquant." }, { status: 400 });
  }

  try {
    const appClient = buildBridgeClientFromEnv();

    // Crée l'utilisateur Bridge (idempotent côté API — un 409 est silencieux ici).
    try {
      await createBridgeUser(appClient, userEmail);
    } catch {
      // utilisateur déjà existant ou erreur transitoire — on tente l'auth ci-dessous
    }

    const userToken = await authenticateBridgeUser(appClient, userEmail);

    // Persiste la connection AVANT la session Connect : le token permet à la
    // route /sync de tirer les données plus tard. La connection est en
    // "active" même si la session Connect n'a pas encore été validée — on
    // affichera "0 compte" jusqu'au premier sync réussi.
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
            externalCompanyId: userEmail,
          },
        });
      } catch (err) {
        if (!(err instanceof ConnectionAlreadyExistsError)) throw err;
      }
    }

    const session = await createBridgeConnectSession(appClient, {
      userEmail,
      // Bridge accepte une redirect_url pour ramener l'utilisateur sur Vyzor.
      // L'URL exacte est résolue côté front (après la connexion l'utilisateur
      // poste vers /api/integrations/bridge/sync).
      redirectUrl: request.nextUrl.origin
        ? `${request.nextUrl.origin}/integrations/bridge/callback`
        : undefined,
    });

    return NextResponse.json(
      {
        connectUrl: session.url,
        sessionId: session.id,
        userEmail,
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
