// app/debug/pennylane-classes/page.tsx
// Page de debug : agrégation des données Pennylane par classe PCG (1 à 7).
// Sert à valider visuellement, avant agrégation KPIs, ce qui remonte
// réellement compte par compte depuis l'API Pennylane.
import { PennylaneClassesView } from "@/components/debug/PennylaneClassesView";

export default function PennylaneClassesDebugPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full overflow-hidden px-3 py-8 md:px-4 lg:px-6">
      <PennylaneClassesView />
    </main>
  );
}
