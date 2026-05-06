// File: app/page.tsx
// Role: page d'accueil de l'app — affiche directement la nouvelle AuthPage
// (layout 2 colonnes, branding gauche + form droit) en mode login. C'est le
// premier écran que voit un visiteur non authentifié à la racine `/`.
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
