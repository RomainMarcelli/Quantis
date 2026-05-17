// app/cabinet/dossier/[companyId]/page.tsx
// Page d'entrée d'un dossier cabinet (Sprint C Tâche 6).
//
// Wrapper léger qui setActiveCompanyId(companyId) côté client puis redirige
// vers /analysis (cockpit existant). Le cockpit consomme l'activeCompanyId
// du store si nécessaire pour adapter les data.
//
// Approche minimaliste cf. audit-sprint-C D2 — pas de duplication du
// layout dashboard, on réutilise les pages existantes /analysis et
// /synthese via une redirection contextualisée.
import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { CabinetDossierEntry } from "@/components/cabinet/CabinetDossierEntry";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function CabinetDossierPage({ params }: PageProps) {
  const { companyId } = await params;
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-4 py-10">
      <AuthGate>
        <Suspense fallback={null}>
          <CabinetDossierEntry companyId={companyId} />
        </Suspense>
      </AuthGate>
    </main>
  );
}
