// app/onboarding/page.tsx
// Page d'orientation post-signup (Sprint C). L'user choisit son type
// de compte : dirigeant TPE/PME (parcours historique /documents) ou
// expert-comptable (parcours cabinet /cabinet/onboarding/connect).
import { AuthGate } from "@/components/auth/AuthGate";
import { OnboardingSelector } from "@/components/cabinet/OnboardingSelector";

export default function OnboardingPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-4 py-12 md:py-16">
      <AuthGate>
        <OnboardingSelector />
      </AuthGate>
    </main>
  );
}
