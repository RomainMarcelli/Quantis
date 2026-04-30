// app/debug/pennylane/page.tsx
// Page de debug : valide que les données dailyAccounting + balanceSheetSnapshot
// remontent bien jusqu'au front. Sert de référence pour le PM avant le design des
// vrais dashboards. Auth Firebase requise.
import { PennylaneDebugView } from "@/components/debug/PennylaneDebugView";

export default function PennylaneDebugPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full overflow-hidden px-3 py-8 md:px-4 lg:px-6">
      <PennylaneDebugView />
    </main>
  );
}
