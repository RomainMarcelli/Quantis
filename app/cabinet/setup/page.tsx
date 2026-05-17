// app/cabinet/setup/page.tsx
// Étape PRÉ-signup spécifique au parcours cabinet : saisie du nom du cabinet
// + nombre estimé de dossiers. Les valeurs sont stockées en localStorage et
// consommées par AuthPage après signup pour créer la Firm en Firestore.
import { CabinetSetupForm } from "@/components/cabinet/CabinetSetupForm";

export default function CabinetSetupPage() {
  return (
    <main className="premium-analysis-root relative min-h-screen w-full px-4 py-12 md:py-16">
      <CabinetSetupForm />
    </main>
  );
}
