// File: components/financials/BalanceSheet.tsx
// Role: rendu visuel d'un bilan (actif gauche / passif droite).
"use client";

import { Scale } from "lucide-react";
import type { BalanceSheet as BalanceSheetType } from "@/lib/financials/types";
import {
  SectionCard,
  SectionSubtotal,
  formatAmount,
  lineColorClass,
} from "@/components/financials/FinancialsCommon";

export function BalanceSheet({ sheet }: { sheet: BalanceSheetType }) {
  return (
    <article className="precision-card rounded-2xl border-l-4 border-l-sky-400/50 bg-[#0F0F12] p-5">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-sky-300" />
          <h2 className="text-sm font-semibold text-white">Bilan</h2>
        </div>
        {sheet.fiscalYear ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/55">
            Au 31/12/{sheet.fiscalYear}
          </span>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ─── ACTIF ───────────────────────────────────────────── */}
        <section>
          <div className="mb-2.5 flex items-center justify-between rounded-md bg-sky-500/10 px-3 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-200">
              Actif (ce que l'entreprise possède)
            </span>
          </div>
          <div className="space-y-3">
            <SectionCard section={sheet.actif.immobilise} />
            <SectionCard section={sheet.actif.circulant} />
            {sheet.actif.cca !== null && sheet.actif.cca !== 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
                <p
                  className={`mb-2 text-[10px] font-mono uppercase tracking-wider ${lineColorClass("actif")} opacity-80`}
                >
                  Charges constatées d'avance
                </p>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-sky-200">CCA</span>
                  <span className="font-mono tabular-nums text-sky-200">
                    {formatAmount(sheet.actif.cca)}
                  </span>
                </div>
              </div>
            ) : null}
            <SectionSubtotal
              label="TOTAL ACTIF"
              value={sheet.actif.total}
              intensity="final"
            />
          </div>
        </section>

        {/* ─── PASSIF ──────────────────────────────────────────── */}
        <section>
          <div className="mb-2.5 flex items-center justify-between rounded-md bg-amber-500/10 px-3 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-200">
              Passif (comment c'est financé)
            </span>
          </div>
          <div className="space-y-3">
            <SectionCard section={sheet.passif.capitauxPropres} />
            <SectionCard section={sheet.passif.provisions} />
            <SectionCard section={sheet.passif.dettes} />
            {sheet.passif.pca !== null && sheet.passif.pca !== 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
                <p
                  className={`mb-2 text-[10px] font-mono uppercase tracking-wider ${lineColorClass("dette")} opacity-80`}
                >
                  Produits constatés d'avance
                </p>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-amber-200">PCA</span>
                  <span className="font-mono tabular-nums text-amber-200">
                    {formatAmount(sheet.passif.pca)}
                  </span>
                </div>
              </div>
            ) : null}
            <SectionSubtotal
              label="TOTAL PASSIF"
              value={sheet.passif.total}
              intensity="final"
            />
          </div>
        </section>
      </div>
    </article>
  );
}
