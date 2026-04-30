// File: lib/financials/coherenceChecks.ts
// Role: vérifications de cohérence à afficher en évidence dans la vue
// "états financiers". Sert de double-contrôle visuel pour le PM/dirigeant
// avant qu'il ne fasse confiance aux KPIs calculés en aval.
//
// Quatre familles de checks :
//   1. Bilan équilibré : Total actif == Total passif
//   2. EBIT calculé == EBIT mappé : sanity sur la cascade P&L
//   3. CA calculé (ventes_march + prod_vendue) == kpis.ca : sanité KPI
//   4. EBITDA calculé == kpis.ebitda : idem
//
// Chaque check produit un statut (`ok` / `warning` / `error` / `na`) et
// un éventuel écart formaté.

import type { AnalysisRecord, MappedFinancialData } from "@/types/analysis";
import type { BalanceSheet, CoherenceCheck, IncomeStatement } from "@/lib/financials/types";

/**
 * Tolérance absolue en € pour l'égalité bilan : 1 € (arrondis comptables).
 * Tolérance relative pour les autres checks : 1% (rounding cascading).
 */
const ABS_TOLERANCE_EUR = 1;
const RELATIVE_TOLERANCE = 0.01;

function classifyDelta(
  delta: number,
  reference: number | null,
  options: { absTolerance?: number } = {}
): CoherenceCheck["status"] {
  const absDelta = Math.abs(delta);
  if (absDelta <= (options.absTolerance ?? ABS_TOLERANCE_EUR)) return "ok";
  if (reference === null || reference === 0) {
    // Pas de référence pour évaluer un seuil relatif → on garde une zone
    // de tolérance plus large (10 €) au-delà de laquelle on signale.
    return absDelta < 10 ? "warning" : "error";
  }
  const ratio = absDelta / Math.abs(reference);
  if (ratio <= RELATIVE_TOLERANCE) return "warning";
  return "error";
}

export function buildCoherenceChecks(input: {
  analysis: AnalysisRecord;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
}): CoherenceCheck[] {
  const { analysis, incomeStatement, balanceSheet } = input;
  const m: MappedFinancialData = analysis.mappedData;
  const checks: CoherenceCheck[] = [];

  // ─── 1. Bilan équilibré ──────────────────────────────────────────────
  const actifTotal = balanceSheet.actif.total;
  const passifTotal = balanceSheet.passif.total;
  if (actifTotal === null || passifTotal === null) {
    checks.push({
      id: "bilan-equilibre",
      label: "Bilan équilibré",
      status: "na",
      detail: "Total actif ou total passif non disponible.",
    });
  } else {
    const delta = actifTotal - passifTotal;
    checks.push({
      id: "bilan-equilibre",
      label: "Bilan équilibré (Total actif = Total passif)",
      status: classifyDelta(delta, actifTotal),
      delta,
      detail: `Actif: ${actifTotal.toFixed(0)} € · Passif: ${passifTotal.toFixed(0)} € · Écart: ${delta.toFixed(0)} €`,
    });
  }

  // ─── 2. EBIT calculé vs EBIT mappé ──────────────────────────────────
  // Le mapping persiste un `ebit` agrégé (FR  GG du 2033-SD). Notre
  // recalcul = produits exploitation - charges exploitation. Ils doivent
  // matcher modulo arrondis.
  const ebitCalc = incomeStatement.resultatExploitation;
  const ebitMapped = m.ebit;
  if (ebitCalc === null || ebitMapped === null) {
    checks.push({
      id: "ebit-coherent",
      label: "Résultat d'exploitation cohérent",
      status: "na",
      detail: "EBIT calculé ou mappé non disponible.",
    });
  } else {
    const delta = ebitCalc - ebitMapped;
    checks.push({
      id: "ebit-coherent",
      label: "Résultat d'exploitation cohérent (calculé vs 2033-SD)",
      status: classifyDelta(delta, ebitMapped),
      delta,
      detail: `Calculé: ${ebitCalc.toFixed(0)} € · 2033-SD: ${ebitMapped.toFixed(0)} €`,
    });
  }

  // ─── 3. CA calculé vs kpis.ca ────────────────────────────────────────
  const caComputed = sumNullable([m.ventes_march, m.prod_vendue]);
  const caKpi = analysis.kpis.ca;
  if (caComputed === null || caKpi === null) {
    checks.push({
      id: "ca-coherent",
      label: "Chiffre d'affaires cohérent",
      status: "na",
      detail: "CA calculé ou KPI non disponible.",
    });
  } else {
    const delta = caComputed - caKpi;
    checks.push({
      id: "ca-coherent",
      label: "CA cohérent (ventes + production vendue vs KPI)",
      status: classifyDelta(delta, caKpi),
      delta,
      detail: `Calculé: ${caComputed.toFixed(0)} € · KPI: ${caKpi.toFixed(0)} €`,
    });
  }

  // ─── 4. Résultat net cohérent (P&L cascade vs kpis.resultat_net) ─────
  const rnPL = incomeStatement.resultatNet;
  const rnKpi = analysis.kpis.resultat_net;
  if (rnPL === null || rnKpi === null) {
    checks.push({
      id: "rn-coherent",
      label: "Résultat net cohérent",
      status: "na",
      detail: "Résultat net calculé ou KPI non disponible.",
    });
  } else {
    const delta = rnPL - rnKpi;
    checks.push({
      id: "rn-coherent",
      label: "Résultat net cohérent (cascade P&L vs KPI)",
      status: classifyDelta(delta, rnKpi),
      delta,
      detail: `P&L: ${rnPL.toFixed(0)} € · KPI: ${rnKpi.toFixed(0)} €`,
    });
  }

  // ─── 5. EBITDA recalculé vs kpis.ebitda ──────────────────────────────
  // EBITDA = EBIT + DAP + DPROV (re-ajout des charges non décaissées).
  if (
    m.ebit !== null &&
    m.dap !== null &&
    m.dprov !== null &&
    analysis.kpis.ebitda !== null
  ) {
    const ebitdaCalc = m.ebit + m.dap + m.dprov;
    const ebitdaKpi = analysis.kpis.ebitda;
    const delta = ebitdaCalc - ebitdaKpi;
    checks.push({
      id: "ebitda-coherent",
      label: "EBITDA cohérent (EBIT + amortissements + provisions)",
      status: classifyDelta(delta, ebitdaKpi),
      delta,
      detail: `Calculé: ${ebitdaCalc.toFixed(0)} € · KPI: ${ebitdaKpi.toFixed(0)} €`,
    });
  } else {
    checks.push({
      id: "ebitda-coherent",
      label: "EBITDA cohérent",
      status: "na",
      detail: "EBIT, DAP, DPROV ou KPI ebitda manquant.",
    });
  }

  return checks;
}

function sumNullable(values: Array<number | null | undefined>): number | null {
  let total = 0;
  let hasAny = false;
  for (const v of values) {
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      total += v;
      hasAny = true;
    }
  }
  return hasAny ? total : null;
}
