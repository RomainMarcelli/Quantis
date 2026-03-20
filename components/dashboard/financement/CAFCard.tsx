// File: components/dashboard/financement/CAFCard.tsx
// Role: affiche la capacité d'autofinancement (CAF), indicateur du cash généré en interne.
"use client";

import { formatCurrency } from "@/components/dashboard/formatting";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";

type CAFCardProps = {
  caf: number | null;
};

export function CAFCard({ caf }: CAFCardProps) {
  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* CAF: cash potentiel généré par l'exploitation pour financer investissements/remboursement. */}
      <InfoPopover
        title="Capacité d'autofinancement"
        purpose="Mesurer la capacité de l&apos;entreprise à financer ses besoins par ses propres ressources."
        displayedData="Le montant de CAF en euros."
        formula="CAF ≈ résultat net + charges non décaissées - produits non encaissés."
      />

      {/* Titre compact pour éviter les retours à la ligne sur les écrans intermédiaires. */}
      <h3
        title="Capacité d'autofinancement"
        className="truncate pr-10 text-lg font-semibold leading-tight text-white sm:text-xl xl:text-2xl"
      >
        Capacité d&apos;autofinancement
      </h3>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/60">CAF</p>
      <p className="mt-5 text-5xl font-semibold text-emerald-300">{formatCurrency(caf)}</p>
    </article>
  );
}
