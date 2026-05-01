import { AnalysisDetailView } from "@/components/analysis/AnalysisDetailView";
import { VyzorBenchmarkProvider } from "@/lib/benchmark/BenchmarkContext";

export default function AnalysisLatestPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full overflow-hidden px-3 py-8 md:px-4 lg:px-6">
      <VyzorBenchmarkProvider>
        <AnalysisDetailView />
      </VyzorBenchmarkProvider>
    </main>
  );
}
