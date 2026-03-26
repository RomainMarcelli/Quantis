// File: app/register/page.tsx
// Role: page dédiée à l'inscription avec retour et accès au mode connexion.
import { LoginForm } from "@/components/LoginForm";
import { isCompanySizeValue, isSectorValue } from "@/lib/onboarding/options";

type RegisterPageProps = {
  searchParams?: Promise<{
    companySize?: string | string[];
    sector?: string | string[];
    next?: string | string[];
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = (await searchParams) ?? {};
  const rawCompanySize = Array.isArray(params.companySize)
    ? params.companySize[0] ?? ""
    : params.companySize ?? "";
  const rawSector = Array.isArray(params.sector) ? params.sector[0] ?? "" : params.sector ?? "";
  const rawNext = Array.isArray(params.next) ? params.next[0] ?? "" : params.next ?? "";

  const initialCompanySize = isCompanySizeValue(rawCompanySize) ? rawCompanySize : "";
  const initialSector = isSectorValue(rawSector) ? rawSector : "";
  const postLoginRedirect = rawNext.startsWith("/") ? rawNext : "/synthese";

  return (
    <main className="premium-analysis-root relative mx-auto flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-10">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />
      <section className="relative z-10 w-full max-w-2xl">
        <LoginForm
          initialMode="register"
          initialCompanySize={initialCompanySize}
          initialSector={initialSector}
          backHref="/"
          postLoginRedirect={postLoginRedirect}
        />
      </section>
    </main>
  );
}
