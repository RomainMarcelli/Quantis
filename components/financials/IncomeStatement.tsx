// File: components/financials/IncomeStatement.tsx
// Role: rendu visuel d'un compte de résultat — présentation 2 colonnes
// (Produits à gauche / Charges à droite), alignée sur la lecture
// "miroir" classique d'un expert-comptable.
//
// Architecture en 3 blocs verticaux : Exploitation, Financier,
// Exceptionnel. Pour chaque bloc, deux cards côte à côte (produits |
// charges) — leurs sous-totaux s'alignent visuellement grâce au mode
// `equalHeight` du SectionCard (h-full + lignes en flex-1 + total en
// bas). Sous chaque bloc, une ligne de résultat intermédiaire qui
// traverse les deux colonnes.
//
// Bloc final (Résultat avant impôt → Impôt → Résultat net) : encart
// doré à toute largeur en bas de la cascade.
"use client";

import type {
  FinancialSection,
  IncomeStatement as IncomeStatementType,
} from "@/lib/financials/types";
import {
  SectionCard,
  SectionSubtotal,
} from "@/components/financials/FinancialsCommon";

type IncomeStatementProps = {
  statement: IncomeStatementType;
  /** Libellé custom de période ("Du DD/MM/YYYY au DD/MM/YYYY"). Override
   *  le fallback "Exercice {fiscalYear}" — utilisé en mode dynamique pour
   *  refléter la fenêtre TemporalityBar (sinon le CDR affiche l'exercice
   *  de l'analyse mère, pas la période sélectionnée). */
  periodLabel?: string | null;
};

export function IncomeStatement({ statement, periodLabel }: IncomeStatementProps) {
  return (
    <article className="precision-card rounded-2xl px-5 py-4">
      <header className="mb-4 flex items-baseline justify-between gap-3 border-b border-white/10 pb-3">
        <h2 className="text-sm font-semibold tracking-wide text-white">Compte de résultat</h2>
        {periodLabel ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/45">
            {periodLabel}
          </span>
        ) : statement.fiscalYear ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/45">
            Exercice {statement.fiscalYear}
          </span>
        ) : null}
      </header>

      {/* En-tête de colonnes — toujours visible pour ancrer la lecture. */}
      <div className="mb-3 grid grid-cols-2 gap-4">
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/55">
          Produits
        </p>
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/55">
          Charges
        </p>
      </div>

      <div className="space-y-3">
        {/* ─── Bloc Exploitation ────────────────────────────────────── */}
        <CashflowBlock
          left={statement.produitsExploitation}
          right={statement.chargesExploitation}
        />
        {statement.resultatExploitation !== null ? (
          <ResultLine
            label="= Résultat d'exploitation"
            value={statement.resultatExploitation}
          />
        ) : null}

        {/* ─── Bloc Financier ───────────────────────────────────────── */}
        <CashflowBlock
          left={statement.produitsFinanciers}
          right={statement.chargesFinancieres}
        />
        {statement.resultatFinancier !== null ? (
          <ResultLine
            label="= Résultat financier"
            value={statement.resultatFinancier}
          />
        ) : null}

        {/* ─── Bloc Exceptionnel ────────────────────────────────────── */}
        <CashflowBlock
          left={statement.produitsExceptionnels}
          right={statement.chargesExceptionnelles}
        />
        {statement.resultatExceptionnel !== null ? (
          <ResultLine
            label="= Résultat exceptionnel"
            value={statement.resultatExceptionnel}
          />
        ) : null}

        {/* ─── Cascade finale (toute largeur) ──────────────────────── */}
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

/**
 * Bloc à 2 colonnes — produits à gauche, charges à droite. Les deux
 * SectionCard utilisent `equalHeight` pour que leurs sous-totaux soient
 * sur la même ligne quel que soit le nombre de lignes affichées dans
 * chaque card.
 *
 * On masque le bloc entièrement si les deux sections sont vides
 * (ex. analyse Excel partielle qui n'a pas de produits financiers).
 */
function CashflowBlock({
  left,
  right,
}: {
  left: FinancialSection;
  right: FinancialSection;
}) {
  const hasLeft = left.subtotal !== null && left.subtotal !== 0;
  const hasRight = right.subtotal !== null && right.subtotal !== 0;
  if (!hasLeft && !hasRight) return null;

  return (
    <div className="grid grid-cols-2 gap-4">
      {hasLeft ? (
        <SectionCard section={left} equalHeight />
      ) : (
        <EmptyColumn title={left.title} />
      )}
      {hasRight ? (
        <SectionCard section={right} equalHeight />
      ) : (
        <EmptyColumn title={right.title} />
      )}
    </div>
  );
}

/** Placeholder discret quand un côté du bloc n'a pas de valeur. */
function EmptyColumn({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-dashed border-white/10 bg-black/[0.08] px-4 py-3">
      <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-white/40">
        {title}
      </p>
      <p className="text-xs italic text-white/30">Aucune valeur disponible.</p>
    </div>
  );
}

/**
 * Ligne de résultat intermédiaire qui traverse visuellement les deux
 * colonnes (= Résultat d'exploitation, financier, exceptionnel).
 * Le label est aligné à gauche, la valeur à droite.
 */
function ResultLine({ label, value }: { label: string; value: number | null }) {
  return (
    <SectionSubtotal label={label} value={value} intensity="result" />
  );
}
