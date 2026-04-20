// components/pricing/PricingView.tsx
// Vue client des offres commerciales avec DA premium (dark/gold) alignee sur les ecrans dashboard.
"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";

type Offer = {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlighted: boolean;
  badge?: string;
};

const OFFERS: Offer[] = [
  {
    name: "Free",
    price: "0 EUR / mois",
    description: "Pour decouvrir Quantis et structurer un premier pilotage financier.",
    features: [
      "1 dossier actif",
      "Dashboard essentiel",
      "Analyse KPI standard",
      "Support communautaire"
    ],
    highlighted: false,
    badge: "Starter"
  },
  {
    name: "Pro",
    price: "49 EUR / mois",
    description: "Pour les equipes finance qui veulent aller plus vite et plus loin.",
    features: [
      "Dossiers illimites",
      "Alertes avancees",
      "Exports et benchmarks",
      "Priorite support"
    ],
    highlighted: true,
    badge: "Recommande"
  },
  {
    name: "Enterprise",
    price: "Sur devis",
    description: "Pour les organisations multi-entites avec exigences de gouvernance.",
    features: [
      "SSO et gouvernance",
      "SLA dedie",
      "Accompagnement personnalise",
      "Deployment sur mesure"
    ],
    highlighted: false,
    badge: "Scale"
  }
];

export function PricingView() {
  const router = useRouter();

  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl space-y-6">
      <header className="precision-card rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <QuantisLogo withText={false} size={28} />
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                Pricing
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
              {"Offres "}
              <span className="text-quantis-gold">Quantis</span>
            </h1>
            <p className="mt-2 text-sm text-white/65">
              {"Choisissez le niveau adapt\u00E9 \u00E0 votre cadence de pilotage financier."}
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-white/70">
              <ShieldCheck className="h-3.5 w-3.5 text-quantis-gold" />
              {"Paiement non actif pour le moment (mode d\u00E9monstration)."}
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/analysis")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/10"
          >
            {"Retour à l’analyse"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        {OFFERS.map((offer) => (
          <article
            key={offer.name}
            className={`precision-card rounded-2xl p-5 ${offer.highlighted ? "border-quantis-gold/45 shadow-[0_0_30px_-12px_rgba(197,160,89,0.35)]" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-white/50">{offer.name}</p>
                <p className="mt-2 text-3xl font-semibold text-white">{offer.price}</p>
              </div>
              {offer.badge ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${
                    offer.highlighted
                      ? "border-quantis-gold/45 bg-quantis-gold/15 text-quantis-gold"
                      : "border-white/15 bg-white/5 text-white/70"
                  }`}
                >
                  {offer.highlighted ? <Sparkles className="h-3 w-3" /> : null}
                  {offer.badge}
                </span>
              ) : null}
            </div>

            <p className="card-header mt-3 text-sm text-white/60">{offer.description}</p>

            <ul className="space-y-2.5">
              {offer.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-white/85">
                  <Check
                    className={`mt-0.5 h-4 w-4 ${
                      offer.highlighted ? "text-quantis-gold" : "text-emerald-300"
                    }`}
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className={`mt-6 w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                offer.highlighted
                  ? "btn-gold-premium"
                  : "border border-white/15 bg-white/5 text-white hover:bg-white/10"
              }`}
            >
              {offer.highlighted ? "Plan recommande" : `Choisir ${offer.name}`}
            </button>
          </article>
        ))}
      </section>
    </section>
  );
}
