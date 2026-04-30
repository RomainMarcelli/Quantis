// File: components/financials/FinancialsCommon.tsx
// Role: helpers visuels partagés entre IncomeStatement et BalanceSheet
// (formatage des montants, ligne d'état financier, sous-total).
"use client";

import type { FinancialLine, FinancialSection } from "@/lib/financials/types";

/**
 * Formatte un montant en euros avec séparateurs FR (1 234 567 €).
 * Affiche les négatifs entre parenthèses (convention comptable).
 * `null` → tiret discret pour ne pas trahir une absence de donnée comme un 0.
 */
export function formatAmount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value === 0) return "—"; // 0 = donnée nulle pour l'utilisateur
  const rounded = Math.round(value);
  const abs = Math.abs(rounded).toLocaleString("fr-FR");
  return rounded < 0 ? `(${abs} €)` : `${abs} €`;
}

/**
 * Couleur de texte selon le type de ligne. Convention :
 *   - produit / actif / capitaux : neutre clair (info utile, pas un signal)
 *   - charge : rouge atténué (perte / sortie)
 *   - dette : ambre atténué (engagement)
 *   - neutre : gris
 * On reste sobre côté palette : c'est un état financier, pas un signal d'alerte.
 */
export function lineColorClass(kind: FinancialSection["kind"]): string {
  switch (kind) {
    case "produit":
      return "text-emerald-200";
    case "charge":
      return "text-rose-200";
    case "actif":
      return "text-sky-200";
    case "capitaux":
      return "text-violet-200";
    case "dette":
      return "text-amber-200";
    default:
      return "text-white/85";
  }
}

/**
 * Une ligne d'état financier (un poste comptable).
 * Affiche : libellé + montant aligné à droite. Code PCG en tooltip.
 */
export function FinancialLineRow({
  line,
  kind,
  emphasis = false,
}: {
  line: FinancialLine;
  kind: FinancialSection["kind"];
  /** True pour les lignes "résultat de l'exercice" / "résultat net" — gras + bordure. */
  emphasis?: boolean;
}) {
  const color = lineColorClass(kind);
  const amountColor =
    line.value === null
      ? "text-white/30"
      : line.value < 0
        ? "text-rose-300"
        : color;

  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1 ${
        emphasis ? "border-t border-white/10 pt-1.5 font-semibold" : ""
      }`}
      title={
        line.tooltip
          ? `${line.tooltip}${line.pcgCode ? ` (PCG: ${line.pcgCode})` : ""}`
          : line.pcgCode
            ? `PCG: ${line.pcgCode}`
            : undefined
      }
    >
      <span className={`text-xs ${color}`}>
        {line.label}
        {line.pcgCode ? (
          <span className="ml-1.5 font-mono text-[9px] text-white/30">
            [{line.pcgCode}]
          </span>
        ) : null}
      </span>
      <span className={`flex-shrink-0 font-mono text-xs tabular-nums ${amountColor}`}>
        {formatAmount(line.value)}
      </span>
    </div>
  );
}

/**
 * Sous-total / total de section. Style typographique différencié.
 */
export function SectionSubtotal({
  label,
  value,
  intensity = "section",
}: {
  label: string;
  value: number | null;
  /**
   * "section" : sous-total d'une section (ex. "Total produits d'exploitation").
   * "result"  : ligne de résultat intermédiaire (EBIT, résultat financier...).
   * "final"   : résultat net / total bilan.
   */
  intensity?: "section" | "result" | "final";
}) {
  const styling =
    intensity === "final"
      ? "border-t-2 border-quantis-gold/60 bg-quantis-gold/5 mt-2 pt-2 text-sm font-semibold text-quantis-gold"
      : intensity === "result"
        ? "border-t border-white/15 mt-1.5 pt-1.5 text-xs font-semibold text-white"
        : "border-t border-white/10 mt-1 pt-1 text-xs font-medium text-white/85";

  return (
    <div className={`flex items-baseline justify-between gap-3 ${styling}`}>
      <span>{label}</span>
      <span className="flex-shrink-0 font-mono tabular-nums">{formatAmount(value)}</span>
    </div>
  );
}

/**
 * Carte de section (titre + lignes + sous-total).
 */
export function SectionCard({
  section,
}: {
  section: FinancialSection;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
      <p
        className={`mb-2 text-[10px] font-mono uppercase tracking-wider ${lineColorClass(section.kind)} opacity-80`}
      >
        {section.title}
      </p>
      <div className="space-y-0">
        {section.lines.map((line, idx) => (
          <FinancialLineRow key={idx} line={line} kind={section.kind} />
        ))}
        <SectionSubtotal
          label={`Total — ${section.title.toLowerCase()}`}
          value={section.subtotal}
          intensity="section"
        />
      </div>
    </div>
  );
}
