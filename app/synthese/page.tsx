// File: app/synthese/page.tsx
// Role: route App Router de la vue Synthese (lecture executive des KPI, tendances, alertes et actions).
import { SyntheseView } from "@/components/synthese/SyntheseView";

export default function SynthesePage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full overflow-hidden px-3 py-8 md:px-4 lg:px-6">
      <SyntheseView />
    </main>
  );
}
