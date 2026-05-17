// GET /api/integrations/pennylane/firm/authorize-url
// Construit l'URL OAuth Pennylane Firm côté serveur (pas d'exposition du
// client_id au bundle JS). Utilisé par le flow simplifié /cabinet/onboarding/connect.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const DEFAULT_AUTHORIZE_URL = "https://app.pennylane.com/oauth/authorize";
const DEFAULT_SCOPES =
  "accounting:readonly invoices:readonly customers:readonly suppliers:readonly transactions:readonly categories:readonly products:readonly bank_accounts:readonly employees:readonly firms:readonly companies:readonly";

export async function GET() {
  const clientId = process.env.PENNYLANE_OAUTH_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "Pennylane credentials not configured" },
      { status: 500 }
    );
  }

  const redirectUri =
    process.env.PENNYLANE_REDIRECT_URI ||
    `${process.env.APP_BASE_URL}/api/integrations/pennylane/firm/callback`;

  const authorizeBase =
    process.env.PENNYLANE_OAUTH_AUTHORIZE_URL || DEFAULT_AUTHORIZE_URL;
  const scope = process.env.PENNYLANE_FIRM_SCOPES?.trim() || DEFAULT_SCOPES;

  const authorizeUrl = new URL(authorizeBase);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", randomUUID());

  return NextResponse.json({
    authorizeUrl: authorizeUrl.toString(),
  });
}
