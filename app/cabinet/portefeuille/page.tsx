// app/cabinet/portefeuille/page.tsx
// Vue Portefeuille du cabinet (Sprint C Tâche 5).
// Accès restreint aux users firm_member — sinon redirect côté client.
import { AuthGate } from "@/components/auth/AuthGate";
import { FirmPortfolioView } from "@/components/cabinet/FirmPortfolioView";

export default function CabinetPortefeuillePage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-4 py-10">
      <AuthGate>
        <FirmPortfolioView />
      </AuthGate>
    </main>
  );
}
