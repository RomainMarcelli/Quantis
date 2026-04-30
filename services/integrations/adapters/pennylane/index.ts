// Adaptateur Pennylane v2 — implémente le contrat IntegrationAdapter.
// Ne fait que rassembler client + auth + fetchers ; toute la logique est déléguée.

import { ensureFreshAuth } from "@/services/integrations/adapters/pennylane/auth";
import {
  fetchAccountingEntries,
  fetchContacts,
  fetchInvoices,
  fetchJournals,
  fetchLedgerAccounts,
  fetchTrialBalance,
} from "@/services/integrations/adapters/pennylane/fetchers";
import { updateConnectionTokens } from "@/services/integrations/storage/connectionStore";
import type { Connection, IntegrationAdapter } from "@/types/connectors";

export const pennylaneAdapter: IntegrationAdapter = {
  provider: "pennylane",

  async authenticate(connection: Connection): Promise<Connection> {
    const { auth, refreshed } = await ensureFreshAuth(connection);
    if (!refreshed) {
      return connection;
    }
    // Token rafraîchi — on persiste avant de continuer le sync.
    await updateConnectionTokens(connection.id, auth);
    return { ...connection, auth };
  },

  fetchJournals: (ctx, cursor) => fetchJournals(ctx, cursor),
  fetchLedgerAccounts: (ctx, cursor) => fetchLedgerAccounts(ctx, cursor),
  fetchContacts: (ctx, cursor) => fetchContacts(ctx, cursor),
  fetchInvoices: (ctx, cursor) => fetchInvoices(ctx, cursor),
  fetchAccountingEntries: (ctx, cursor) => fetchAccountingEntries(ctx, cursor),
  fetchTrialBalance: (connection, periodStart, periodEnd) =>
    fetchTrialBalance(connection, periodStart, periodEnd),

  // Pas de banque côté Pennylane direct : c'est Phase 3 (Bridge).
};
