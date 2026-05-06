// File: app/api/debug/pennylane-raw/route.ts
// Role: GET /api/debug/pennylane-raw?connectionId=...
// Tappe directement l'API Pennylane (sans appliquer le mapping interne)
// pour permettre au PM de voir :
//   1. Quelle base URL est utilisée (sandbox vs production)
//   2. À quelle entreprise/cabinet le token est rattaché (GET /me)
//   3. Le format JSON brut renvoyé par chaque endpoint principal
//      (ledger_accounts, ledger_entries + détail, journals, customers,
//       suppliers, trial_balance) — avec les noms de champs Pennylane natifs.
//
// Sert à valider visuellement, avant tout traitement, ce qui sort de
// l'API. Si la base URL est `app.pennylane.com/api/external/v2` → c'est
// la PROD. Si elle pointe ailleurs (override via PENNYLANE_API_BASE_URL),
// c'est qu'on tape un autre environnement (sandbox dédiée par exemple).

import { NextResponse, type NextRequest } from "next/server";
import { AuthenticationError, requireAuthenticatedUser } from "@/lib/server/requireAuth";
import {
  getUserConnectionById,
} from "@/services/integrations/storage/connectionStore";
import {
  pennylaneFetchPage,
  pennylaneRequest,
} from "@/services/integrations/adapters/pennylane/client";

export const runtime = "nodejs";

const DEFAULT_BASE_URL = "https://app.pennylane.com/api/external/v2";

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuthenticatedUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const url = new URL(request.url);
  const connectionId = url.searchParams.get("connectionId");
  const sampleSize = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "3"), 1), 10);

  if (!connectionId) {
    return NextResponse.json(
      { error: "Param `connectionId` requis." },
      { status: 400 }
    );
  }

  const connection = await getUserConnectionById(userId, connectionId);
  if (!connection) {
    return NextResponse.json(
      { error: "Connection introuvable ou non autorisée." },
      { status: 404 }
    );
  }
  if (connection.provider !== "pennylane") {
    return NextResponse.json(
      { error: "Cette vue debug est réservée aux connections Pennylane." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.PENNYLANE_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const baseUrlOverridden = Boolean(process.env.PENNYLANE_API_BASE_URL?.trim());

  // /me — révèle qui est rattaché au token. C'est le seul endpoint qui
  // confirme sans ambiguïté l'environnement (un token de prod et un de
  // sandbox renverront des entités distinctes même si l'URL est la même).
  const meResult = await safeCall(() => pennylaneRequest<unknown>(connection, "/me"));

  // Échantillons listes — on demande peu d'items et on garde le payload
  // complet (cursor inclus) pour montrer la forme exacte des réponses.
  const ledgerAccountsSample = await safeCall(() =>
    pennylaneFetchPage<unknown>(connection, "/ledger_accounts", { limit: sampleSize })
  );
  const journalsSample = await safeCall(() =>
    pennylaneFetchPage<unknown>(connection, "/journals", { limit: sampleSize })
  );
  const customersSample = await safeCall(() =>
    pennylaneFetchPage<unknown>(connection, "/customers", { limit: sampleSize })
  );
  const suppliersSample = await safeCall(() =>
    pennylaneFetchPage<unknown>(connection, "/suppliers", { limit: sampleSize })
  );
  const ledgerEntriesListSample = await safeCall(() =>
    pennylaneFetchPage<{ id: string | number }>(connection, "/ledger_entries", {
      limit: sampleSize,
    })
  );
  const customerInvoicesSample = await safeCall(() =>
    pennylaneFetchPage<unknown>(connection, "/customer_invoices", { limit: sampleSize })
  );
  const supplierInvoicesSample = await safeCall(() =>
    pennylaneFetchPage<unknown>(connection, "/supplier_invoices", { limit: sampleSize })
  );

  // Vue détail d'une seule écriture : c'est là qu'on voit `ledger_entry_lines`
  // (vue liste ne les expose pas). On prend la première entrée trouvée.
  let ledgerEntryDetailSample: SafeResult<unknown> = { ok: false, error: "skipped" };
  if (
    ledgerEntriesListSample.ok &&
    Array.isArray((ledgerEntriesListSample.value as { items?: unknown[] }).items) &&
    ((ledgerEntriesListSample.value as { items: unknown[] }).items.length ?? 0) > 0
  ) {
    const first = (ledgerEntriesListSample.value as { items: { id: string | number }[] })
      .items[0]!;
    ledgerEntryDetailSample = await safeCall(() =>
      pennylaneRequest<unknown>(connection, `/ledger_entries/${first.id}`)
    );
  }

  // Trial balance : Pennylane renvoie un format légèrement différent
  // (debits/credits as strings). On limite la fenêtre à 1 mois pour ne pas
  // exploser le volume.
  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const trialBalanceSample = await safeCall(() =>
    pennylaneFetchPage<unknown>(connection, "/trial_balance", {
      period_start: monthStart.toISOString().slice(0, 10),
      period_end: today.toISOString().slice(0, 10),
      limit: sampleSize,
    })
  );

  return NextResponse.json({
    environment: {
      baseUrl,
      baseUrlOverridden,
      defaultBaseUrl: DEFAULT_BASE_URL,
      hint: baseUrlOverridden
        ? "PENNYLANE_API_BASE_URL est défini dans l'env — l'app tape l'URL custom (sandbox dédiée)."
        : "Aucun override d'env. L'app tape la base URL par défaut (app.pennylane.com/api/external/v2). Pennylane ne propose pas d'URL sandbox publique distincte : la 'sandbox' est un compte de test sous le même domaine.",
    },
    connection: {
      id: connection.id,
      authMode: connection.authMode,
      tokenPreview: connection.tokenPreview,
      externalCompanyId: connection.externalCompanyId,
      externalFirmId: connection.externalFirmId,
      lastSyncAt: connection.lastSyncAt,
      lastSyncStatus: connection.lastSyncStatus,
    },
    me: meResult,
    samples: {
      ledger_accounts: ledgerAccountsSample,
      journals: journalsSample,
      customers: customersSample,
      suppliers: suppliersSample,
      ledger_entries_list: ledgerEntriesListSample,
      ledger_entry_detail: ledgerEntryDetailSample,
      customer_invoices: customerInvoicesSample,
      supplier_invoices: supplierInvoicesSample,
      trial_balance: trialBalanceSample,
    },
  });
}

type SafeResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function safeCall<T>(fn: () => Promise<T>): Promise<SafeResult<T>> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}
