// Adaptateur Odoo — implémente le contrat IntegrationAdapter.
//
// Particularités :
//  - Pas d'invoices séparées : Odoo modélise les factures comme des account.move
//    avec move_type = "out_invoice" / "in_invoice". Notre fetcher entries les
//    embarque déjà → granular insights via les écritures.
//  - L'authenticate ne fait rien de plus que valider les credentials (déjà fait
//    au connect). Pas de refresh token.

import {
  fetchAccountingEntries,
  fetchContacts,
  fetchJournals,
  fetchLedgerAccounts,
  fetchTrialBalance,
} from "@/services/integrations/adapters/odoo/fetchers";
import type { Connection, IntegrationAdapter } from "@/types/connectors";

export const odooAdapter: IntegrationAdapter = {
  provider: "odoo",

  async authenticate(connection: Connection): Promise<Connection> {
    // L'API key Odoo n'expire pas tant qu'elle n'est pas révoquée côté admin.
    // Pas de refresh à faire ici.
    return connection;
  },

  fetchJournals: (ctx, cursor) => fetchJournals(ctx, cursor),
  fetchLedgerAccounts: (ctx, cursor) => fetchLedgerAccounts(ctx, cursor),
  fetchContacts: (ctx, cursor) => fetchContacts(ctx, cursor),
  fetchAccountingEntries: (ctx, cursor) => fetchAccountingEntries(ctx, cursor),
  fetchTrialBalance: (connection, periodStart, periodEnd) =>
    fetchTrialBalance(connection, periodStart, periodEnd),

  // Pas de fetchInvoices : factures = account.move avec move_type spécifique,
  // déjà capturées par fetchAccountingEntries.
  // Pas de fetchBankAccounts/fetchBankTransactions : Phase 3 (Bridge).
};
