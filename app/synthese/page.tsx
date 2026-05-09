// File: app/synthese/page.tsx
// Role: route App Router de la vue Synthese (lecture executive des KPI, tendances, alertes et actions).
import { AuthGate } from "@/components/auth/AuthGate";
import { SyntheseView } from "@/components/synthese/SyntheseView";
import { VyzorBenchmarkProvider } from "@/lib/benchmark/BenchmarkContext";

export default function SynthesePage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-3 py-8 md:px-4 lg:px-6">
      <AuthGate>
        <VyzorBenchmarkProvider>
          <SyntheseView />
        </VyzorBenchmarkProvider>
      </AuthGate>
    </main>
  );
}