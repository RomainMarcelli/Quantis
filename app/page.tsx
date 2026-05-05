// File: app/page.tsx
// Role: page d'accueil de l'app — connexion / inscription uniquement.
//
// L'acquisition (landing marketing) est gérée hors de l'app. Quand un visiteur
// arrive sur la racine, il atterrit directement sur la page d'auth ; s'il est
// déjà connecté, `AuthPage` le redirige vers `/synthese` via son useEffect
// `firebaseAuthGateway.subscribe`.
//
// Les routes `/login`, `/register`, `/forgot-password` restent disponibles
// comme deep-links (mêmes liens dans les emails de reset, etc.) et pointent
// toutes vers le même composant avec un `initialMode` différent.
import { AuthPage } from "@/components/auth/AuthPage";

type HomePageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {};
  const rawNext = Array.isArray(params.next) ? params.next[0] ?? "" : params.next ?? "";
  const postLoginRedirect = rawNext.startsWith("/") ? rawNext : "/synthese";

  return <AuthPage initialMode="login" postLoginRedirect={postLoginRedirect} />;
}
