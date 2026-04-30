// File: components/financials/IncomeStatement.tsx
// Role: rendu visuel d'un compte de résultat. Cascade Produits expl →
// Charges expl → Résultat exploitation → Résultat financier → Résultat
// exceptionnel → Résultat avant impôt → Impôt → Résultat net.
"use client";

import { TrendingUp } from "lucide-react";
import type { IncomeStatement as IncomeStatementType } from "@/lib/financials/types";
import { SectionCard, SectionSubtotal } from "@/components/financials/FinancialsCommon";

export function IncomeStatement({
  statement,
}: {
  statement: IncomeStatementType;
}) {
  return (
    <article className="precision-card rounded-2xl border-l-4 border-l-emerald-400/50 bg-[#0F0F12] p-5">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-300" />
          <h2 className="text-sm font-semibold text-white">Compte de résultat</h2>
        </div>
        {statement.fiscalYear ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/55">
            Exercice {statement.fiscalYear}
          </span>
        ) : null}
      </header>

      <div className="space-y-3">
        {/* Bloc 1 : exploitation */}
        <SectionCard section={statement.produitsExploitation} />
        <SectionCard section={statement.chargesExploitation} />
        <SectionSubtotal
          label="= Résultat d'exploitation (EBIT)"
          value={statement.resultatExploitation}
          intensity="result"
        />

        {/* Bloc 2 : financier */}
        <SectionCard section={statement.produitsFinanciers} />
        <SectionCard section={statement.chargesFinancieres} />
        <SectionSubtotal
          label="= Résultat financier"
          value={statement.resultatFinancier}
          intensity="result"
        />

        {/* Bloc 3 : exceptionnel */}
        <SectionCard section={statement.produitsExceptionnels} />
        <SectionCard section={statement.chargesExceptionnelles} />
        <SectionSubtotal
          label="= Résultat exceptionnel"
          value={statement.resultatExceptionnel}
          intensity="result"
        />

        {/* Cascade finale */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
          <SectionSubtotal
            label="Résultat avant impôt"
            value={statement.resultatAvantImpot}
            intensity="section"
          />
          <SectionSubtotal
            label="− Impôt sur les bénéfices"
            value={statement.impot}
            intensity="section"
          />
          <SectionSubtotal
            label="= RÉSULTAT NET"
            value={statement.resultatNet}
            intensity="final"
          />
        </div>
      </div>
    </article>
  );
}
