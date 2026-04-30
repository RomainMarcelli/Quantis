// File: components/financials/IncomeStatement.tsx
// Role: rendu visuel d'un compte de résultat — cascade PCG complète.
//
// Direction artistique : sobre, monospace pour les montants, hiérarchie
// claire (sections → sous-totaux → résultat net en doré). Les sections
// vides sont masquées pour ne pas afficher de boîtes "Aucune valeur" en
// rafale sur les analyses partielles (typique d'un upload Excel léger).
"use client";

import type { IncomeStatement as IncomeStatementType } from "@/lib/financials/types";
import { SectionCard, SectionSubtotal } from "@/components/financials/FinancialsCommon";

export function IncomeStatement({ statement }: { statement: IncomeStatementType }) {
  // Helper pour ne pas afficher une section dont aucune ligne n'a de valeur.
  const hasContent = (subtotal: number | null) => subtotal !== null && subtotal !== 0;

  return (
    <article className="precision-card rounded-2xl px-5 py-4">
      <header className="mb-4 flex items-baseline justify-between gap-3 border-b border-white/10 pb-3">
        <h2 className="text-sm font-semibold tracking-wide text-white">Compte de résultat</h2>
        {statement.fiscalYear ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/45">
            Exercice {statement.fiscalYear}
          </span>
        ) : null}
      </header>

      <div className="space-y-3">
        {/* ─── Bloc Exploitation ────────────────────────────────────── */}
        {hasContent(statement.produitsExploitation.subtotal) ? (
          <SectionCard section={statement.produitsExploitation} />
        ) : null}
        {hasContent(statement.chargesExploitation.subtotal) ? (
          <SectionCard section={statement.chargesExploitation} />
        ) : null}
        {statement.resultatExploitation !== null ? (
          <SectionSubtotal
            label="= Résultat d'exploitation"
            value={statement.resultatExploitation}
            intensity="result"
          />
        ) : null}

        {/* ─── Bloc Financier ───────────────────────────────────────── */}
        {hasContent(statement.produitsFinanciers.subtotal) ? (
          <SectionCard section={statement.produitsFinanciers} />
        ) : null}
        {hasContent(statement.chargesFinancieres.subtotal) ? (
          <SectionCard section={statement.chargesFinancieres} />
        ) : null}
        {statement.resultatFinancier !== null ? (
          <SectionSubtotal
            label="= Résultat financier"
            value={statement.resultatFinancier}
            intensity="result"
          />
        ) : null}

        {/* ─── Bloc Exceptionnel ────────────────────────────────────── */}
        {hasContent(statement.produitsExceptionnels.subtotal) ? (
          <SectionCard section={statement.produitsExceptionnels} />
        ) : null}
        {hasContent(statement.chargesExceptionnelles.subtotal) ? (
          <SectionCard section={statement.chargesExceptionnelles} />
        ) : null}
        {statement.resultatExceptionnel !== null ? (
          <SectionSubtotal
            label="= Résultat exceptionnel"
            value={statement.resultatExceptionnel}
            intensity="result"
          />
        ) : null}

        {/* ─── Cascade finale (toujours affichée si on a un résultat) ─ */}
        {statement.resultatNet !== null ? (
          <div className="rounded-xl border border-quantis-gold/30 bg-quantis-gold/[0.04] px-4 py-3">
            {statement.resultatAvantImpot !== null ? (
              <SectionSubtotal
                label="Résultat avant impôt"
                value={statement.resultatAvantImpot}
                intensity="section"
              />
            ) : null}
            {statement.impot !== null && statement.impot !== 0 ? (
              <SectionSubtotal
                label="− Impôt sur les bénéfices"
                value={statement.impot}
                intensity="section"
              />
            ) : null}
            <SectionSubtotal
              label="= RÉSULTAT NET"
              value={statement.resultatNet}
              intensity="final"
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}
