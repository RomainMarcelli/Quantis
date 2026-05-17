// app/cabinet/onboarding/connect/page.tsx
// Page de connexion OAuth Pennylane Firm (Sprint C Tâche 3).
import { Suspense } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { FirmConnectPage } from "@/components/cabinet/FirmConnectPage";

export default function CabinetOnboardingConnectPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-4 py-12">
      <AuthGate>
        <Suspense fallback={null}>
          <FirmConnectPage />
        </Suspense>
      </AuthGate>
    </main>
  );
}
