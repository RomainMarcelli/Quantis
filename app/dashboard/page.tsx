// app/dashboard/page.tsx
// Route serveur App Router pour l'espace de depot, stylee avec la DA premium globale.
import { DashboardView } from "@/components/DashboardView";

export default function DashboardPage() {
  return (
    <main className="premium-analysis-root relative mx-auto min-h-screen w-full overflow-hidden px-4 py-8">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />
      <DashboardView />
    </main>
  );
}
