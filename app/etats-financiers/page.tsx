// app/etats-financiers/page.tsx
// Page "États financiers" : bilan + compte de résultat + vérifications
// de cohérence. Source = analyse active (cf. lib/source/activeSource).
import { FinancialStatementsView } from "@/components/financials/FinancialStatementsView";

export default function EtatsFinanciersPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full overflow-hidden px-3 py-8 md:px-4 lg:px-6">
      <FinancialStatementsView />
    </main>
  );
}
