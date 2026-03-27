// app/page.tsx
// Landing publique: met en avant le CTA d'évaluation sans afficher de formulaire de connexion.
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, FileSpreadsheet, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <main className="premium-analysis-root relative mx-auto min-h-screen w-full overflow-hidden px-4 py-10">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      <section className="relative z-10 mx-auto w-full max-w-6xl space-y-5">
        <header className="precision-card flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/15 bg-black/35 p-2.5 shadow-[0_10px_26px_rgba(0,0,0,0.45)]">
              <Image
                src="/images/LogoV3.png"
                alt="Logo Quantis"
                width={48}
                height={48}
                className="h-10 w-10 object-contain md:h-11 md:w-11"
                priority
              />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-quantis-gold">Quantis</p>
              <p className="mt-1 text-sm text-white/65">Cockpit financier pour PME</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
            >
              Se connecter
            </Link>
            <Link
              href="/register"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
            >
              Créer un compte
            </Link>
          </div>
        </header>

        <article className="precision-card rounded-2xl p-6 md:p-8">
          <div className="grid gap-7 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-quantis-gold/30 bg-quantis-gold/10 px-3 py-1 text-xs font-medium text-quantis-gold">
                <Sparkles className="h-3.5 w-3.5" />
                Analyse pilotée par Quantis Score
              </div>

              <h1 className="mt-4 text-4xl font-semibold leading-tight text-white md:text-6xl">
                Évaluez votre santé financière
                <span className="block text-quantis-gold">en quelques minutes</span>
              </h1>

              <p className="mt-4 max-w-3xl text-base leading-relaxed text-white/72 md:text-lg">
                Déposez un fichier Excel, complétez votre contexte d&apos;entreprise, puis obtenez votre
                Quantis Score et des recommandations actionnables.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/upload"
                  className="btn-gold-premium inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all"
                >
                  Évaluer votre santé financière
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/upload/manual"
                  className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
                >
                  Saisie manuelle
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/55">Parcours rapide</p>
              <ul className="mt-4 space-y-3">
                <li className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                  <FileSpreadsheet className="mt-0.5 h-4 w-4 text-quantis-gold" />
                  <div>
                    <p className="text-sm font-medium text-white">1. Déposez votre fichier Excel</p>
                    <p className="mt-1 text-xs text-white/60">Import sécurisé et validation automatique.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                  <BarChart3 className="mt-0.5 h-4 w-4 text-quantis-gold" />
                  <div>
                    <p className="text-sm font-medium text-white">2. Quantis calcule vos KPI</p>
                    <p className="mt-1 text-xs text-white/60">Lecture immédiate des points forts et des risques.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
                  <Sparkles className="mt-0.5 h-4 w-4 text-quantis-gold" />
                  <div>
                    <p className="text-sm font-medium text-white">3. Passez à l&apos;action</p>
                    <p className="mt-1 text-xs text-white/60">Score global, alertes et recommandations concrètes.</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
