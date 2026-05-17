// GET /api/debug/env-check
// Endpoint de debug pour vérifier que les variables d'env Pennylane Firm
// sont bien injectées côté runtime serveur. Activé seulement si
// ENABLE_ENV_DEBUG === "true". À désactiver en prod après diagnostic.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const DEBUG_ENABLED = process.env.ENABLE_ENV_DEBUG === "true";

  if (!DEBUG_ENABLED) {
    return NextResponse.json(
      { error: "Debug endpoint disabled" },
      { status: 403 }
    );
  }

  const checks = {
    PENNYLANE_FIRM_CLIENT_ID: {
      present: !!process.env.PENNYLANE_FIRM_CLIENT_ID,
      length: process.env.PENNYLANE_FIRM_CLIENT_ID?.length || 0,
    },
    PENNYLANE_FIRM_CLIENT_SECRET: {
      present: !!process.env.PENNYLANE_FIRM_CLIENT_SECRET,
      length: process.env.PENNYLANE_FIRM_CLIENT_SECRET?.length || 0,
    },
    PENNYLANE_REDIRECT_URI: {
      present: !!process.env.PENNYLANE_REDIRECT_URI,
      value: process.env.PENNYLANE_REDIRECT_URI || "N/A",
    },
  };

  return NextResponse.json({
    checks,
    allPresent: Object.values(checks).every((c) => c.present),
  });
}
