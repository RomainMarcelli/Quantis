// app/onboarding/page.tsx
// Page d'orientation PRÉ-signup (feature/cabinet-ux).
// L'user choisit son type de compte avant même de créer son compte :
//   - dirigeant TPE/PME      → /register?next=/synthese
//   - expert-comptable       → /cabinet/setup (puis /register avec firmName)
// Le choix est stocké en localStorage et consommé par AuthPage après signup
// pour écrire users/{uid}.accountType + créer la Firm si firm_member.
import { OnboardingSelector } from "@/components/cabinet/OnboardingSelector";

export default function OnboardingPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-4 py-12 md:py-16">
      <OnboardingSelector />
    </main>
  );
}
