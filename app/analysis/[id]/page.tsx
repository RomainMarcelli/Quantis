import { AnalysisDetailView } from "@/components/analysis/AnalysisDetailView";

type AnalysisDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AnalysisDetailPage({ params }: AnalysisDetailPageProps) {
  const { id } = await params;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8">
      <AnalysisDetailView analysisId={id} />
    </main>
  );
}
