import { AnalysisDetailView } from "@/components/analysis/AnalysisDetailView";

type AnalysisDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AnalysisDetailPage({ params }: AnalysisDetailPageProps) {
  const { id } = await params;

  return (
    <main className="premium-analysis-root relative min-h-screen w-full overflow-hidden px-3 py-8 md:px-4 lg:px-6">
      <AnalysisDetailView analysisId={id} />
    </main>
  );
}
