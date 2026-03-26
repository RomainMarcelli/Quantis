import { AnalysisDetailView } from "@/components/analysis/AnalysisDetailView";

export default function DocumentsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8">
      <AnalysisDetailView viewMode="documents" />
    </main>
  );
}
