// app/cabinet/onboarding/picker/page.tsx
// Page de sélection des dossiers post-OAuth Firm (Sprint C Tâche 4).
import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { FirmDossierPicker } from "@/components/cabinet/FirmDossierPicker";

export default function CabinetOnboardingPickerPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-4 py-12">
      <AuthGate>
        <Suspense fallback={null}>
          <FirmDossierPicker />
        </Suspense>
      </AuthGate>
    </main>
  );
}
