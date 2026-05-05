// Adaptateur MyUnisoft v1 — implémente le contrat IntegrationAdapter.
//
// MyUnisoft n'expose pas d'API factures séparée des écritures comptables : les factures
// sont des écritures dans les journaux Achat/Vente. On ne mappe donc pas `fetchInvoices`.
// La couche granularInsightsBuilder utilise les invoices uniquement pour les top clients
// par CA (calcul possible aussi via les écritures de ventes).

import { fetchAccountingEntries, fetchContacts, fetchJournals, fetchLedgerAccounts, fetchTrialBalance } from "@/services/integrations/adapters/myunisoft/fetchers";
import type { Connection, IntegrationAdapter } from "@/types/connectors";

export const myUnisoftAdapter: IntegrationAdapter = {
  provider: "myunisoft",

  async authenticate(connection: Connection): Promise<Connection> {
    // Le JWT MyUnisoft est fourni par l'utilisateur ; pas de refresh automatique
    // (renouvellement géré côté MyUnisoft selon leur politique). Si le token expire,
    // l'utilisateur doit re-coller un nouveau JWT.
    return connection;
  },

  fetchJournals: (ctx, cursor) => fetchJournals(ctx, cursor),
  fetchLedgerAccounts: (ctx, cursor) => fetchLedgerAccounts(ctx, cursor),
  fetchContacts: (ctx, cursor) => fetchContacts(ctx, cursor),
  fetchAccountingEntries: (ctx, cursor) => fetchAccountingEntries(ctx, cursor),
  fetchTrialBalance: (connection, periodStart, periodEnd) =>
    fetchTrialBalance(connection, periodStart, periodEnd),

  // Pas de fetchInvoices — MyUnisoft factures = écritures dans journaux Achat/Vente.
  // Pas de fetchBankAccounts/fetchBankTransactions — Phase 3 (Bridge).
};
