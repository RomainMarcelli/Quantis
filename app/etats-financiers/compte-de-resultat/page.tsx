// app/etats-financiers/compte-de-resultat/page.tsx
// Page "Compte de résultat" — comptes 6 à 7 (charges et produits).
// Source = analyse active. Cf. brief 09/06/2026 : scindage de la page
// États financiers en Bilan + CDR.
import { FinancialStatementsView } from "@/components/financials/FinancialStatementsView";

export default function CompteDeResultatPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-3 py-8 md:px-4 lg:px-6">
      <FinancialStatementsView mode="cdr" />
    </main>
  );
}
