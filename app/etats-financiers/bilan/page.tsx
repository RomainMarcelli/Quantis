// app/etats-financiers/bilan/page.tsx
// Page "Bilan" — comptes 1 à 5 (capitaux propres, immobilisations,
// stocks, créances, trésorerie). Source = analyse active. Cf. brief
// 09/06/2026 : scindage de la page États financiers en Bilan + CDR.
import { FinancialStatementsView } from "@/components/financials/FinancialStatementsView";

export default function BilanPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full overflow-hidden px-3 py-8 md:px-4 lg:px-6">
      <FinancialStatementsView mode="bilan" />
    </main>
  );
}
