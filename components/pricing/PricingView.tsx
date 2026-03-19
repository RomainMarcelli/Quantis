"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";

const OFFERS = [
  {
    name: "Free",
    price: "0 EUR/mois",
    description: "Ideal pour decouvrir Quantis.",
    features: ["1 dossier actif", "Dashboard standard", "Support communautaire"],
    highlighted: false
  },
  {
    name: "Pro",
    price: "49 EUR/mois",
    description: "Pour les equipes finance en croissance.",
    features: ["Dossiers illimites", "Alertes avancees", "Exports et benchmarks"],
    highlighted: true
  },
  {
    name: "Enterprise",
    price: "Sur devis",
    description: "Pour les organisations multi-entites.",
    features: ["SSO & gouvernance", "SLA dedie", "Accompagnement personnalise"],
    highlighted: false
  }
];

export function PricingView() {
  const router = useRouter();

  return (
    <section className="space-y-6">
      <header className="quantis-panel flex items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <QuantisLogo withText={false} size={24} />
          <div>
            <h1 className="text-2xl font-semibold text-quantis-carbon">Offres Quantis</h1>
            <p className="text-sm text-quantis-slate">Comparatif visuel (mode demonstration)</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/analysis")}
          className="rounded-xl border border-quantis-mist bg-white px-3 py-2 text-sm text-quantis-carbon hover:bg-quantis-paper"
        >
          Retour dashboard
        </button>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        {OFFERS.map((offer) => (
          <article
            key={offer.name}
            className={`quantis-panel p-5 ${offer.highlighted ? "ring-2 ring-quantis-gold/45" : ""}`}
          >
            <p className="text-xs uppercase tracking-wide text-quantis-slate">{offer.name}</p>
            <p className="mt-2 text-2xl font-semibold text-quantis-carbon">{offer.price}</p>
            <p className="mt-1 text-sm text-quantis-slate">{offer.description}</p>

            <ul className="mt-4 space-y-2">
              {offer.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-quantis-carbon">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              className="mt-5 w-full rounded-xl border border-quantis-mist bg-white px-3 py-2 text-sm font-medium text-quantis-carbon hover:bg-quantis-paper"
            >
              Choisir {offer.name}
            </button>
          </article>
        ))}
      </section>
    </section>
  );
}
