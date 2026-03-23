// File: app/upload/manual/page.tsx
// Role: route de saisie manuelle des KPI quand l'upload est incomplet.
import { ManualKpiEntryView } from "@/components/upload/ManualKpiEntryView";

export default function ManualUploadPage() {
  return (
    <main className="premium-analysis-root relative mx-auto min-h-screen w-full overflow-hidden px-4 py-8">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />
      <ManualKpiEntryView />
    </main>
  );
}
