import { AuthGate } from "@/components/auth/AuthGate";
import { AnalysisDetailView } from "@/components/analysis/AnalysisDetailView";
import { VyzorBenchmarkProvider } from "@/lib/benchmark/BenchmarkContext";

type AnalysisDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AnalysisDetailPage({ params }: AnalysisDetailPageProps) {
  const { id } = await params;

  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-3 py-8 md:px-4 lg:px-6">
      <AuthGate>
        <VyzorBenchmarkProvider>
          <AnalysisDetailView analysisId={id} />
        </VyzorBenchmarkProvider>
      </AuthGate>
    </main>
  );
}