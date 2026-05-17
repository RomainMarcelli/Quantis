// app/cabinet/entreprises/ajouter/page.tsx
// Page d'ajout d'une entreprise au cabinet — multi-source.
// Réservée aux firm_member (gardée côté composant via useAccountType).
import { AuthGate } from "@/components/auth/AuthGate";
import { AddCompanyView } from "@/components/cabinet/AddCompanyView";

export default function CabinetAddCompanyPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-4 py-10">
      <AuthGate>
        <AddCompanyView />
      </AuthGate>
    </main>
  );
}
