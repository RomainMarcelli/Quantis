// File: app/synthese/page.tsx
// Role: route App Router de la vue Synthese (lecture executive des KPI, tendances, alertes et actions).
import { SyntheseView } from "@/components/synthese/SyntheseView";

export default function SynthesePage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8">
      <SyntheseView />
    </main>
  );
}
