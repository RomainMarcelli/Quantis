// File: app/register/page.tsx
// Role: page d'inscription — bascule vers `AuthPage` (initialMode register).
// Les `searchParams` company/sector ne sont plus consommés ici (le nouveau
// flux d'inscription se limite à nom + email + mot de passe + CGU).
import { AuthPage } from "@/components/auth/AuthPage";

type RegisterPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = (await searchParams) ?? {};
  const rawNext = Array.isArray(params.next) ? params.next[0] ?? "" : params.next ?? "";
  const postLoginRedirect = rawNext.startsWith("/") ? rawNext : "/synthese";

  return <AuthPage initialMode="register" postLoginRedirect={postLoginRedirect} />;
}
