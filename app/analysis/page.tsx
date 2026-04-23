import { AuthGate } from "@/components/auth/AuthGate";
import { AnalysisDetailView } from "@/components/analysis/AnalysisDetailView";

export default function AnalysisLatestPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full overflow-hidden px-3 py-8 md:px-4 lg:px-6">
      <AuthGate>
        <AnalysisDetailView />
      </AuthGate>
    </main>
  );
}
