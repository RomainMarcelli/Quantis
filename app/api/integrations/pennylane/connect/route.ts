// POST /api/integrations/pennylane/connect
// Crée une connection Pennylane pour l'utilisateur courant.
// Supporte les 3 modes d'auth : company_token (par copier-coller), firm_token, oauth2 (redirect).

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import {
  buildCompanyTokenAuth,
  buildFirmTokenAuth,
  buildOAuthAuthorizeUrl,
} from "@/services/integrations/adapters/pennylane/auth";
import {
  ConnectionAlreadyExistsError,
  createConnection,
} from "@/services/integrations/storage/connectionStore";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

const OAUTH_STATES_COLLECTION = "oauth_states";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

type ConnectRequestBody =
  | {
      mode: "company_token";
      accessToken: string;
    }
  | {
      mode: "firm_token";
      accessToken: string;
      externalFirmId: string;
    }
  | {
      mode: "oauth2";
    };

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

  try {
    if (body.mode === "company_token") {
      if (!body.accessToken?.trim()) {
        return NextResponse.json({ error: "accessToken manquant." }, { status: 400 });
      }
      const auth = await buildCompanyTokenAuth({ accessToken: body.accessToken });
      const connection = await createConnection({
        userId,
        provider: "pennylane",
        providerSub: "pennylane_company",
        auth,
      });
      return NextResponse.json(
        { connectionId: connection.id, mode: "company_token", status: "active" },
        { status: 201 }
      );
    }

    if (body.mode === "firm_token") {
      if (!body.accessToken?.trim() || !body.externalFirmId?.trim()) {
        return NextResponse.json(
          { error: "accessToken et externalFirmId requis." },
          { status: 400 }
        );
      }
      const auth = await buildFirmTokenAuth({
        accessToken: body.accessToken,
        externalFirmId: body.externalFirmId,
      });
      const connection = await createConnection({
        userId,
        provider: "pennylane",
        providerSub: "pennylane_firm",
        auth,
      });
      return NextResponse.json(
        { connectionId: connection.id, mode: "firm_token", status: "active" },
        { status: 201 }
      );
    }

    if (body.mode === "oauth2") {
      const state = randomBytes(24).toString("base64url");
      const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
      await getFirebaseAdminFirestore()
        .collection(OAUTH_STATES_COLLECTION)
        .doc(state)
        .set({
          userId,
          provider: "pennylane",
          createdAt: new Date().toISOString(),
          expiresAt,
        });

      let authorizeUrl: string;
      try {
        authorizeUrl = buildOAuthAuthorizeUrl(state);
      } catch (error) {
        return NextResponse.json(
          {
            error: "OAuth Pennylane non configuré côté serveur.",
            detail: error instanceof Error ? error.message : "unknown",
          },
          { status: 501 }
        );
      }
      return NextResponse.json({ authorizeUrl, state }, { status: 200 });
    }

    return NextResponse.json({ error: "Mode d'auth inconnu." }, { status: 400 });
  } catch (error) {
    if (error instanceof ConnectionAlreadyExistsError) {
      return NextResponse.json(
        {
          error: "Une connexion Pennylane active existe déjà.",
          detail: "Déconnectez la connexion existante avant d'en créer une nouvelle, ou utilisez Resync.",
          existingConnectionId: error.existingConnectionId,
          provider: error.provider,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        error: "Échec de la création de la connection.",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
