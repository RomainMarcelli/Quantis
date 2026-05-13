// File: components/financials/FinancialsCommon.tsx
// Role: helpers visuels partagés entre IncomeStatement et BalanceSheet.
//
// Direction artistique :
// - Cible : expert-comptable. Sobre, monospace pour les montants,
//   alignement strict, peu de couleurs.
// - Une seule couleur d'accent : `quantis-gold` pour les sous-totaux et
//   les résultats (= la lecture qui compte).
// - Les négatifs s'affichent entre parenthèses (convention comptable
//   française), en rose discret.
// - Les lignes à valeur nulle (null OU 0) sont masquées par défaut pour
//   garder la page compacte et "remplie" sur les analyses partielles.
"use client";

import type { FinancialLine, FinancialSection } from "@/lib/financials/types";

/**
 * Formatte un montant en euros avec séparateurs FR.
 *   12345  → "12 345 €"
 *   -12345 → "(12 345) €"  (convention comptable)
 *   null   → "—"
 *   0      → "—"          (un 0 est traité comme une donnée absente côté UI)
 */
export function formatAmount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value === 0) return "—";
  const rounded = Math.round(value);
  const abs = Math.abs(rounded).toLocaleString("fr-FR");
  return rounded < 0 ? `(${abs} €)` : `${abs} €`;
}

/**
 * Une ligne d'état financier (un poste comptable).
 * Affiche : libellé + code 2033-SD discret + montant aligné à droite.
 */
export function FinancialLineRow({
  line,
}: {
  line: FinancialLine;
}) {
  const negative = typeof line.value === "number" && line.value < 0;
  return (
    <div
      className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-1 text-xs"
      data-fin-row
      title={
        line.tooltip
          ? `${line.tooltip}${line.pcgCode ? ` (2033-SD : ${line.pcgCode})` : ""}`
          : line.pcgCode
            ? `2033-SD : ${line.pcgCode}`
            : undefined
      }
    >
      {/* Brief 10/05/2026 — codes 2033-SD masqués visuellement (parasitaient
          la lecture). On garde le `pcgCode` dans le `title` du parent pour
          permettre au curieux de le retrouver au survol. */}
      <span className="truncate text-white/85">{line.label}</span>
      <span
        className={`flex-shrink-0 font-mono tabular-nums ${
          negative ? "text-rose-300/85" : "text-white/85"
        }`}
        data-fin-amount={negative ? "negative" : "positive"}
      >
        {formatAmount(line.value)}
      </span>
    </div>
  );
}

/**
 * Sous-total / total / résultat — typographie graduée par "intensity".
 *   "section" : sous-total d'une section (ex. "Total produits expl.")
 *   "result"  : résultat intermédiaire (EBIT, résultat financier...)
 *   "final"   : résultat net / total bilan — accent doré
 *
 * Si `brutValue` est fourni (cf. actif immobilisé), on rend deux colonnes
 * "Brut · Net" comme un bilan papier. Sinon, simple ligne label + montant.
 */
export function SectionSubtotal({
  label,
  value,
  brutValue = null,
  intensity = "section",
}: {
  label: string;
  value: number | null;
  brutValue?: number | null;
  intensity?: "section" | "result" | "final";
}) {
  const negative = typeof value === "number" && value < 0;

  const styling =
    intensity === "final"
      ? "mt-2 border-t border-quantis-gold/40 pt-2 text-sm font-semibold text-quantis-gold"
      : intensity === "result"
        ? "mt-1.5 border-t border-white/15 pt-1.5 text-xs font-semibold text-white"
        : "mt-1 border-t border-white/10 pt-1 text-xs font-medium text-white/85";

  const amountColor =
    intensity === "final"
      ? "text-quantis-gold"
      : negative
        ? "text-rose-300"
        : "text-white";

  // Mode "Brut · Net" : 3 colonnes (label | brut | net) — utilisé pour le
  // sous-total Actif immobilisé où la distinction valeur brute / valeur
  // nette comptable est significative (amortissements cumulés).
  if (brutValue !== null && Number.isFinite(brutValue)) {
    return (
      <div
        className={`grid grid-cols-[1fr_auto_auto] items-baseline gap-4 ${styling}`}
        data-fin-subtotal={intensity}
      >
        <span>{label}</span>
        <span className="flex-shrink-0 font-mono tabular-nums text-white/55">
          <span className="mr-1.5 text-[9px] uppercase tracking-wider">Brut</span>
          {formatAmount(brutValue)}
        </span>
        <span className={`flex-shrink-0 font-mono tabular-nums ${amountColor}`}>
          <span className="mr-1.5 text-[9px] uppercase tracking-wider opacity-70">Net</span>
          {formatAmount(value)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-[1fr_auto] items-baseline gap-3 ${styling}`}
      data-fin-subtotal={intensity}
    >
      <span>{label}</span>
      <span className={`flex-shrink-0 font-mono tabular-nums ${amountColor}`}>
        {formatAmount(value)}
      </span>
    </div>
  );
}

/**
 * Bloc de section (titre + lignes filtrées + sous-total).
 * Les lignes à valeur nulle ou 0 sont masquées pour rester compact.
 *
 * Mode `equalHeight` : utilisé quand deux SectionCard sont placés côte à
 * côte dans une grille (compte de résultat 2 colonnes : produits / charges,
 * bilan 2 colonnes : actif / passif). Le card prend toute la hauteur de
 * la cellule de grille (`h-full`) et la zone de lignes pousse le sous-total
 * en bas (`flex-1`), ce qui aligne visuellement les sous-totaux des deux
 * cards même quand l'un a moins de lignes que l'autre.
 */
export function SectionCard({
  section,
  equalHeight = false,
}: {
  section: FinancialSection;
  equalHeight?: boolean;
}) {
  const visibleLines = section.lines.filter(
    (l) => l.value !== null && l.value !== 0
  );

  const containerClass = `rounded-xl border border-white/10 bg-black/[0.18] px-4 py-3 ${
    equalHeight ? "flex h-full flex-col" : ""
  }`;

  return (
    <div className={containerClass} data-fin-section>
      <p
        className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-white/55"
        data-fin-section-header
      >
        {section.title}
      </p>
      {visibleLines.length === 0 ? (
        <p
          className={`text-xs italic text-white/35 ${equalHeight ? "flex-1" : ""}`}
        >
          Aucune valeur disponible pour cette section.
        </p>
      ) : (
        <div className={`space-y-0 ${equalHeight ? "flex-1" : ""}`}>
          {visibleLines.map((line, idx) => (
            <FinancialLineRow key={idx} line={line} />
          ))}
        </div>
      )}
      {section.subtotal !== null ? (
        <SectionSubtotal
          label={`Total ${section.title.toLowerCase()}`}
          value={section.subtotal}
          brutValue={section.subtotalBrut ?? null}
          intensity="section"
        />
      ) : null}
    </div>
  );
}
