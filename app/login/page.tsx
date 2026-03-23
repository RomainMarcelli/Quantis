// File: app/login/page.tsx
// Role: page dédiée à la connexion, avec accès direct à l'onglet inscription.
import { LoginForm } from "@/components/LoginForm";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const rawNext = Array.isArray(params.next) ? params.next[0] ?? "" : params.next ?? "";
  const postLoginRedirect = rawNext.startsWith("/") ? rawNext : "/analysis";

  return (
    <main className="premium-analysis-root relative mx-auto flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-10">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />
      <section className="relative z-10 w-full max-w-2xl">
        <LoginForm initialMode="login" backHref="/" postLoginRedirect={postLoginRedirect} />
      </section>
    </main>
  );
}
