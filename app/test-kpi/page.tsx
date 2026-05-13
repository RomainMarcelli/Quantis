// app/test-kpi/page.tsx
// Route serveur App Router pour la page de validation KPI, avec shell premium coherent.
import { AdminGate } from "@/components/admin/AdminGate";
import { KpiBeforeAfterView } from "@/components/debug/KpiBeforeAfterView";

export default function TestKpiPage() {
  return (
    <main className="premium-analysis-root relative mx-auto min-h-screen w-full px-4 py-8">
      <AdminGate>
        <div className="noise-overlay" aria-hidden="true" />
        <div className="spotlight" aria-hidden="true" />
        <KpiBeforeAfterView />
      </AdminGate>
    </main>
  );
}
