// File: app/login/page.tsx
// Role: page de connexion — bascule vers `AuthPage` (layout 2 colonnes,
// branding gauche + form droit, modes login / register / forgot intégrés).
import { AuthPage } from "@/components/auth/AuthPage";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const rawNext = Array.isArray(params.next) ? params.next[0] ?? "" : params.next ?? "";
  const postLoginRedirect = rawNext.startsWith("/") ? rawNext : "/synthese";

  return <AuthPage initialMode="login" postLoginRedirect={postLoginRedirect} />;
}
