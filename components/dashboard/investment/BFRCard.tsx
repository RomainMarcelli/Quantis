// File: components/dashboard/investment/BFRCard.tsx
// Role: affiche le KPI principal du BFR pour visualiser l'argent immobilisé dans le cycle d'exploitation.
"use client";

import { formatCurrency } from "@/components/dashboard/formatting";
import { InfoPopover } from "@/components/dashboard/tabs/InfoPopover";

type BFRCardProps = {
  bfr: number | null;
};

export function BFRCard({ bfr }: BFRCardProps) {
  const isKnownValue = bfr !== null;
  const trendSymbol = isKnownValue ? (bfr >= 0 ? "▲" : "▼") : "•";

  return (
    <article className="precision-card relative rounded-2xl p-5">
      {/* BFR: argent immobilisé entre encaissements clients et décaissements fournisseurs/stocks. */}
      <InfoPopover
        title="Argent bloqué (BFR)"
        purpose="Mesurer le montant de trésorerie immobilisé par l'exploitation."
        displayedData="La valeur actuelle du BFR en euros."
        formula="BFR = créances clients + stocks - dettes fournisseurs."
      />

      <h3 className="pr-10 text-2xl font-semibold text-white">Argent bloqué</h3>
      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/55">BFR</p>

      <div className="mt-5 flex items-center gap-3">
        <span className="text-2xl font-semibold text-emerald-300">{trendSymbol}</span>
        <p className="text-4xl font-semibold text-emerald-300">{formatCurrency(bfr)}</p>
      </div>

      <p className="mt-3 text-sm text-white/70">
        Plus ce montant est élevé, plus de cash est immobilisé dans l&apos;activité courante.
      </p>
    </article>
  );
}
