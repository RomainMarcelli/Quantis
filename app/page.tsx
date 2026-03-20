// app/page.tsx
// Point d'entree auth: applique le shell visuel premium (DA /analysis) autour du formulaire connexion/inscription.
import { LoginForm } from "@/components/LoginForm";

export default function HomePage() {
  return (
    <main className="premium-analysis-root relative mx-auto flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-10">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />
      <LoginForm />
    </main>
  );
}
