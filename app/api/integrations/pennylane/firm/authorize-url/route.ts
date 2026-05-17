// GET /api/integrations/pennylane/firm/authorize-url
// Construit l'URL OAuth Pennylane Firm côté serveur (pas d'exposition du
// client_id au bundle JS). Utilisé par le flow simplifié /cabinet/onboarding/connect.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const DEFAULT_AUTHORIZE_URL = "https://app.pennylane.com/oauth/authorize";
const DEFAULT_SCOPES =
  "accounting:read invoices:read customers:read suppliers:read transactions:read categories:read products:read bank_accounts:read employees:read firms:read companies:read";

export async function GET() {
  const clientId = process.env.PENNYLANE_FIRM_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "Pennylane credentials not configured" },
      { status: 500 }
    );
  }

  const fallbackRedirect = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/pennylane/firm/callback`
    : undefined;
  const redirectUri =
    process.env.PENNYLANE_REDIRECT_URI ??
    process.env.PENNYLANE_FIRM_REDIRECT_URI ??
    fallbackRedirect;

  if (!redirectUri) {
    return NextResponse.json(
      { error: "Pennylane redirect URI not configured" },
      { status: 500 }
    );
  }

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
