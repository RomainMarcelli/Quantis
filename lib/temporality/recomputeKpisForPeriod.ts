// File: lib/temporality/recomputeKpisForPeriod.ts
// Role: filtre les flux comptables (dailyAccounting) sur une période, recalcule les KPI flow
// (CA, VA, EBITDA, marges, etc.) tout en conservant les KPI bilan tels quels (le snapshot
// est un état à un instant T, indépendant de la période sélectionnée).
//
// Si l'analyse n'a pas de dailyAccounting (source statique = upload PDF), renvoie les KPI
// annuels stockés sans modification.

import type { AnalysisRecord, CalculatedKpis, MappedFinancialData } from "@/types/analysis";
import type { DailyAccountingEntry, PnlVariableCode } from "@/types/connectors";

const PNL_CODES: readonly PnlVariableCode[] = [
  "ventes_march", "prod_biens", "prod_serv", "prod_vendue",
  "prod_stockee", "prod_immo", "subv_expl", "autres_prod_expl",
  "total_prod_expl",
  "achats_march", "var_stock_march", "achats_mp", "var_stock_mp", "ace",
  "impots_taxes", "salaires", "charges_soc", "dap", "dprov",
  "autres_charges_expl", "total_charges_expl",
  "ebit",
  "prod_fin", "charges_fin", "prod_excep", "charges_excep",
  "is_impot", "resultat_exercice",
];

export type RecomputeResult = {
  kpis: CalculatedKpis;
  // mappedData filtré sur la période (utile pour les composants qui lisent directement mappedData).
  mappedData: MappedFinancialData;
  // True si l'analyse possède du daily filtrable ; false si on a juste l'annuel.
  isFiltered: boolean;
  // Résumé du filtrage.
  filterSummary: {
    daysInPeriod: number;
    totalDaysAvailable: number;
  };
};

export function recomputeKpisForPeriod(
  analysis: AnalysisRecord,
  periodStart: string,
  periodEnd: string
): RecomputeResult {
  const daily = analysis.dailyAccounting ?? null;
  const totalDays = daily?.length ?? 0;

  // Source statique ou pas de données journalières : on retourne les KPI annuels
  // tels quels — mais on hydrate quand même TVA/IS à partir du snapshot bilan
  // si présent. Ça permet aux analyses synchronisées AVANT le câblage TVA dans
  // mappedData (cf. fix buildAnalysisFromSync) de quand même afficher la tile :
  // les soldes 4456/4457 vivent dans `balanceSheetSnapshot.values` et restent
  // exploitables même quand `analysis.kpis.tva_a_payer` est null.
  if (!daily || daily.length === 0) {
    return {
      kpis: hydrateFiscalKpis(analysis.kpis, analysis, undefined, periodStart, periodEnd),
      mappedData: analysis.mappedData,
      isFiltered: false,
      filterSummary: { daysInPeriod: 0, totalDaysAvailable: 0 },
    };
  }

  const filtered = filterDailyByPeriod(daily, periodStart, periodEnd);

  // Aucune écriture journalière dans la période sélectionnée : on n'a rien à
  // recalculer. Si on continuait, `sumDailyValues(filtered)` produirait des
  // totaux à 0 qui écraseraient l'annuel et le dashboard afficherait des zéros
  // partout. On retourne l'analyse telle quelle, comme pour une source statique.
  if (filtered.length === 0) {
    return {
      kpis: hydrateFiscalKpis(analysis.kpis, analysis, undefined, periodStart, periodEnd),
      mappedData: analysis.mappedData,
      isFiltered: false,
      filterSummary: { daysInPeriod: 0, totalDaysAvailable: totalDays },
    };
  }

  const periodTotals = sumDailyValues(filtered);

  // mappedData partiel = on remplace UNIQUEMENT les variables de flux (P&L) par le total période.
  // Les variables de bilan (capital, clients, fournisseurs, total_actif, etc.) restent celles
  // de l'analyse (snapshot indépendant de la période sélectionnée).
  const mappedData: MappedFinancialData = {
    ...analysis.mappedData,
  };
  for (const code of PNL_CODES) {
    (mappedData as Record<string, number | null>)[code] = periodTotals[code];
  }
  // ca = ventes_march + prod_vendue (déjà calculé via le bridge dans analysis.kpis pour l'annuel ;
  // ici on le recalcule). On conserve la cohérence avec les formules PM.

  // Span calendaire de la période sélectionnée (inclus). Sert à annualiser les
  // ratios temporels (DSO/DPO/rot_bfr/rot_stocks) : sans ça, sur une fenêtre d'un
  // mois, le CA est ~1/12e de l'annuel mais le poste clients reste cumulé →
  // le ratio explose (DSO de 1900 jours observé en sandbox).
  // Formule équivalente à "annualiser le CA puis appliquer × 365" :
  //   DSO = clients × periodDays / period_CA  (au lieu de × 365 / annual_CA)
  const periodDays = computePeriodDays(periodStart, periodEnd);

  // Recalcul des KPI front à partir des nouveaux totals.
  const kpis: CalculatedKpis = recomputeFromMappedData(analysis, mappedData, periodTotals, periodDays);
  // TVA/IS : récupérés depuis le snapshot bilan + résultat période. Vit en
  // dehors de recomputeFromMappedData pour garder cette fonction concentrée
  // sur les KPI flow ; les KPI fiscaux sont des dérivés "snapshot + barème".
  const kpisWithFiscal = hydrateFiscalKpis(
    kpis,
    analysis,
    periodTotals.resultat_exercice,
    periodStart,
    periodEnd
  );

  return {
    kpis: kpisWithFiscal,
    mappedData,
    isFiltered: true,
    filterSummary: {
      daysInPeriod: filtered.length,
      totalDaysAvailable: totalDays,
    },
  };
}

function computePeriodDays(periodStart: string, periodEnd: string): number {
  const start = new Date(`${periodStart}T00:00:00.000Z`).getTime();
  const end = new Date(`${periodEnd}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  // +1 pour inclure le jour de fin (intervalle fermé).
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function filterDailyByPeriod(
  daily: DailyAccountingEntry[],
  periodStart: string,
  periodEnd: string
): DailyAccountingEntry[] {
  return daily.filter((d) => d.date >= periodStart && d.date <= periodEnd);
}

function sumDailyValues(daily: DailyAccountingEntry[]): Record<PnlVariableCode, number> {
  const totals = {} as Record<PnlVariableCode, number>;
  for (const code of PNL_CODES) totals[code] = 0;
  for (const day of daily) {
    for (const code of PNL_CODES) {
      totals[code] += day.values[code] ?? 0;
    }
  }
  return totals;
}

function recomputeFromMappedData(
  source: AnalysisRecord,
  mapped: MappedFinancialData,
  totals: Record<PnlVariableCode, number>,
  periodDays: number
): CalculatedKpis {
  const ca = totals.ventes_march + totals.prod_vendue;
  const va = totals.total_prod_expl - totals.achats_march - totals.achats_mp - totals.ace;
  const ebitda = va - totals.impots_taxes - totals.salaires - totals.charges_soc;
  const ebe = ebitda; // convention front
  const marge_ebitda = ca > 0 ? (ebitda / ca) * 100 : null;

  // Charges variables (achats + variations de stocks).
  const charges_var =
    totals.achats_march + totals.achats_mp + totals.var_stock_march + totals.var_stock_mp;
  const mscv = ca - charges_var;
  const tmscv = ca > 0 ? mscv / ca : null;

  const charges_fixes = totals.ace + totals.salaires + totals.charges_soc + totals.dap;
  const point_mort = tmscv && tmscv > 0 ? charges_fixes / tmscv : null;

  // Bilan : on lit le snapshot via mappedData (qui contient les valeurs annuelles non touchées).
  const bfr =
    (mapped.total_stocks ?? 0) +
    (mapped.creances ?? 0) -
    ((mapped.fournisseurs ?? 0) + (mapped.dettes_fisc_soc ?? 0));

  // Ratios temporels — on utilise `periodDays` plutôt que 365 codé en dur :
  // équivalent à annualiser le CA. Si la période sélectionnée est l'année
  // complète (365j), le résultat est identique à la formule annuelle classique.
  const dso = ca > 0 && mapped.clients !== null ? (mapped.clients * periodDays) / (ca * 1.2) : null;
  const dpo =
    totals.achats_march + totals.ace > 0 && mapped.fournisseurs !== null
      ? (mapped.fournisseurs * periodDays) / ((totals.achats_march + totals.ace) * 1.2)
      : null;
  const rot_stocks = ca > 0 && mapped.total_stocks !== null
    ? (mapped.total_stocks * periodDays) / ca
    : null;
  const rot_bfr = ca > 0 ? (bfr / (ca * 1.2)) * periodDays : null;

  const caf = totals.resultat_exercice + totals.dap;
  const fte = caf - (mapped.delta_bfr ?? 0);
  const tn = (mapped.dispo ?? 0) - (mapped.emprunts ?? 0);

  const solvabilite =
    mapped.total_passif && mapped.total_passif > 0 && mapped.total_cp !== null
      ? mapped.total_cp / mapped.total_passif
      : null;
  const liq_gen =
    mapped.total_actif_circ !== null && (mapped.fournisseurs ?? 0) + (mapped.dettes_fisc_soc ?? 0) > 0
      ? mapped.total_actif_circ /
        ((mapped.fournisseurs ?? 0) + (mapped.dettes_fisc_soc ?? 0))
      : null;
  const liq_red =
    (mapped.creances ?? 0) + (mapped.dispo ?? 0) > 0 &&
    (mapped.fournisseurs ?? 0) + (mapped.dettes_fisc_soc ?? 0) > 0
      ? ((mapped.creances ?? 0) + (mapped.dispo ?? 0)) /
        ((mapped.fournisseurs ?? 0) + (mapped.dettes_fisc_soc ?? 0))
      : null;
  const liq_imm =
    (mapped.dispo ?? 0) > 0 &&
    (mapped.fournisseurs ?? 0) + (mapped.dettes_fisc_soc ?? 0) > 0
      ? (mapped.dispo ?? 0) /
        ((mapped.fournisseurs ?? 0) + (mapped.dettes_fisc_soc ?? 0))
      : null;

  const round = (v: number | null): number | null =>
    v === null ? null : Math.round(v * 100) / 100;

  // On part des KPI annuels stockés (pour conserver tcam, ratio_immo, healthScore, etc. qui
  // ne dépendent pas de la période) puis on écrase ceux qu'on vient de recalculer.
  return {
    ...source.kpis,
    ca: round(ca),
    va: round(va),
    ebitda: round(ebitda),
    ebe: round(ebe),
    marge_ebitda: round(marge_ebitda),
    charges_var: round(charges_var),
    mscv: round(mscv),
    tmscv: round(tmscv),
    charges_fixes: round(charges_fixes),
    point_mort: round(point_mort),
    bfr: round(bfr),
    rot_bfr: round(rot_bfr),
    dso: round(dso),
    dpo: round(dpo),
    rot_stocks: round(rot_stocks),
    caf: round(caf),
    fte: round(fte),
    tn: round(tn),
    solvabilite: round(solvabilite),
    liq_gen: round(liq_gen),
    liq_red: round(liq_red),
    liq_imm: round(liq_imm),
    disponibilites: mapped.dispo,
    resultat_net: round(totals.resultat_exercice),
    netProfit: round(totals.resultat_exercice),
    workingCapital: round(bfr),
    grossMarginRate: tmscv === null ? null : Math.round(tmscv * 10000) / 100,
  };
}

/**
 * Hydrate les KPI fiscaux (TVA + IS) au prorata de la période sélectionnée
 * dans la barre temporelle (jour / semaine / mois / trimestre / année).
 *
 * Stratégie :
 *   - TVA : `balanceSheetSnapshot.values.tva_collectee/tva_deductible` est un
 *     solde cumulé sur la période du snapshot (`asOfDate − snapshot.periodStart`).
 *     On scale au prorata `periodDays / snapshotDays` pour rendre la tile
 *     "TVA à reverser ce mois" / "TVA à reverser ce trimestre" intuitive
 *     selon ce que l'utilisateur a sélectionné.
 *   - IS : barème 2024 PME (15 % / 25 %) appliqué sur le résultat de la
 *     période quand on a un filtre temporel actif (periodResultatExercice
 *     fourni), sinon résultat annuel.
 *
 * On force le recalcul TVA quand `periodStart`/`periodEnd` sont fournis (pour
 * que la tile s'adapte à la barre temporelle), sinon on respecte la valeur
 * pré-calculée dans `kpis.tva_a_payer` (cas SyntheseDashboard sans filtre).
 */
function hydrateFiscalKpis(
  kpis: CalculatedKpis,
  analysis: AnalysisRecord,
  periodResultatExercice?: number,
  periodStart?: string,
  periodEnd?: string
): CalculatedKpis {
  const snapshot = analysis.balanceSheetSnapshot;
  const tvaCollectee = snapshot?.values.tva_collectee;
  const tvaDeductible = snapshot?.values.tva_deductible;

  let tva_a_payer = kpis.tva_a_payer ?? null;
  let tva_provision_mensuelle = kpis.tva_provision_mensuelle ?? null;

  if (typeof tvaCollectee === "number" && typeof tvaDeductible === "number") {
    const annualTva = tvaCollectee - tvaDeductible;
    // Prorata vs durée du snapshot. Si `snapshot.periodStart` et `asOfDate`
    // sont disponibles, on scale en fonction de la fenêtre utilisateur.
    let scaledTva = annualTva;
    if (snapshot && periodStart && periodEnd) {
      const snapshotDays = computePeriodDays(snapshot.periodStart, snapshot.asOfDate);
      const userDays = computePeriodDays(periodStart, periodEnd);
      if (snapshotDays > 0 && userDays > 0 && userDays !== snapshotDays) {
        scaledTva = annualTva * (userDays / snapshotDays);
      }
    }
    tva_a_payer = Math.round(scaledTva * 100) / 100;
    // La "moyenne mensuelle" reste basée sur le total annuel (référence stable
    // pour le hint « ~X €/mois en moyenne », indépendant de la fenêtre choisie).
    tva_provision_mensuelle = Math.round((annualTva / 12) * 100) / 100;
  }

  const isAlreadyPresent =
    typeof kpis.provision_is === "number" && Number.isFinite(kpis.provision_is);
  let provision_is = kpis.provision_is ?? null;
  let provision_is_mensuelle = kpis.provision_is_mensuelle ?? null;
  if (!isAlreadyPresent || periodResultatExercice !== undefined) {
    const resultat =
      periodResultatExercice ?? analysis.mappedData.resultat_exercice ?? null;
    if (resultat !== null && Number.isFinite(resultat)) {
      provision_is = Math.round(applyIncomeTaxScale(resultat) * 100) / 100;
      provision_is_mensuelle = Math.round((provision_is / 12) * 100) / 100;
    }
  }

  return {
    ...kpis,
    tva_a_payer,
    tva_provision_mensuelle,
    provision_is,
    provision_is_mensuelle,
  };
}

/**
 * Barème IS 2024 — taux réduit PME : 15 % jusqu'à 42 500 €, 25 % au-delà.
 * Dupliqué (volontairement, version locale simple) du `kpiEngine` pour ne
 * pas créer un import inverse depuis services/ vers lib/. À refactorer si
 * un 3e endroit a besoin de la même formule.
 */
function applyIncomeTaxScale(resultatExercice: number): number {
  if (resultatExercice <= 0) return 0;
  const reducedRateThreshold = 42500;
  if (resultatExercice <= reducedRateThreshold) return resultatExercice * 0.15;
  return reducedRateThreshold * 0.15 + (resultatExercice - reducedRateThreshold) * 0.25;
}
