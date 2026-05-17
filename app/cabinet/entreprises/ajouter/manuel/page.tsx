// app/cabinet/entreprises/ajouter/manuel/page.tsx
// Ajout manuel d'une entreprise au cabinet — saisie nom + SIREN + upload
// fichier FEC ou Excel/PDF. Réservé aux firm_member.
import { AuthGate } from "@/components/auth/AuthGate";
import { Suspense } from "react";
import { AddCompanyManualView } from "@/components/cabinet/AddCompanyManualView";

export default function CabinetAddCompanyManualPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-4 py-10">
      <AuthGate>
        <Suspense fallback={null}>
          <AddCompanyManualView />
        </Suspense>
      </AuthGate>
    </main>
  );
}
