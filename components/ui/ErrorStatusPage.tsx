// File: components/ui/ErrorStatusPage.tsx
// Role: composant de page d'erreur premium réutilisable (404/403/501) cohérent avec la DA Quantis.
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";

type ErrorStatusPageProps = {
  statusCode: number;
  title: string;
  description: string;
  primaryCtaLabel?: string;
  primaryCtaHref?: string;
};

export function ErrorStatusPage({
  statusCode,
  title,
  description,
  primaryCtaLabel = "Retour au dashboard",
  primaryCtaHref = "/dashboard"
}: ErrorStatusPageProps) {
  return (
    <main className="premium-analysis-root relative mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-10">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      <section className="precision-card relative z-10 w-full rounded-2xl p-8 md:p-10">
        <div className="flex items-center gap-3">
          <QuantisLogo withText={false} size={36} className="rounded-lg border border-white/15 bg-black/25 p-1.5" />
          <p className="text-xs uppercase tracking-[0.18em] text-white/50">Erreur application</p>
        </div>

        <div className="card-header mt-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Code</p>
            <p className="tnum text-4xl font-semibold text-quantis-gold">{statusCode}</p>
          </div>
          <AlertTriangle className="h-7 w-7 text-rose-300" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-semibold text-white md:text-3xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">{description}</p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link
            href={primaryCtaHref}
            className="inline-flex items-center gap-2 rounded-xl border border-quantis-gold/55 bg-quantis-gold/95 px-4 py-2 text-sm font-semibold text-black transition hover:bg-quantis-gold"
          >
            <ArrowLeft className="h-4 w-4" />
            {primaryCtaLabel}
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10"
          >
            Retour à l’accueil
          </Link>
        </div>
      </section>
    </main>
  );
}
