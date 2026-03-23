// File: lib/kpiBuilder.ts
// Role: construit un jeu de KPI complet à partir d'une saisie manuelle simplifiée.
// Les formules ici évitent de demander des ratios techniques à l'utilisateur final.

import type { CalculatedKpis } from "@/types/analysis";

export type ManualKpiInput = {
  // Bloc Activité
  ca: number | null;
  tcam: number | null;
  // Bloc Rentabilité
  ebe: number | null;
  resultat_net: number | null;
  roe: number | null;
  roce: number | null;
  // Bloc Trésorerie & BFR
  cash: number | null;
  bfr: number | null;
  dso: number | null;
  dpo: number | null;
  // Bloc avancé (optionnel)
  total_actif: number | null;
  capitaux_propres: number | null;
  dettes_financieres: number | null;
  actif_circulant: number | null;
  dettes_ct: number | null;
  immo_brut: number | null;
  immo_net: number | null;
};

export function buildCompleteKpis(input: ManualKpiInput): CalculatedKpis {
  const ca = finiteOrNull(input.ca);
  const ebe = finiteOrNull(input.ebe);
  const resultatNet = finiteOrNull(input.resultat_net);
  const cash = finiteOrNull(input.cash);
  const bfr = finiteOrNull(input.bfr);
  const dso = finiteOrNull(input.dso);
  const dpo = finiteOrNull(input.dpo);
  const tcam = finiteOrNull(input.tcam);
  const roe = finiteOrNull(input.roe);
  const roce = finiteOrNull(input.roce);

  const totalActif = finiteOrNull(input.total_actif);
  const capitauxPropres = finiteOrNull(input.capitaux_propres);
  const dettesFinancieres = finiteOrNull(input.dettes_financieres);
  const actifCirculant = finiteOrNull(input.actif_circulant);
  const dettesCt = finiteOrNull(input.dettes_ct);
  const immoBrut = finiteOrNull(input.immo_brut);
  const immoNet = finiteOrNull(input.immo_net);

  // Marge EBE et marge nette calculées automatiquement pour alimenter le scoring.
  const margeEbitda = toPercentRatio(ebe, ca);
  const margeNette = toPercentRatio(resultatNet, ca);

  // Rotation du BFR en jours.
  const rotBfr = safeDivide(bfr, ca, 365);

  // Trésorerie nette: en saisie manuelle MVP, on l'aligne au cash disponible.
  const tn = cash;

  // Créances clients approximées:
  // - priorité à DSO * CA / 365
  // - fallback via actif circulant - cash
  const creancesClientsApprox =
    dso !== null && ca !== null ? safeDivide(ca * Math.max(dso, 0), 365, 1) : null;
  const creancesFallback =
    actifCirculant !== null && cash !== null ? Math.max(actifCirculant - cash, 0) : null;
  const creances = creancesClientsApprox ?? creancesFallback;

  // Ratios de liquidité.
  const liqGen = safeDivide(actifCirculant, dettesCt, 1);
  const liqRed = safeDivide(addNullable(creances, cash), dettesCt, 1);
  const liqImm = safeDivide(cash, dettesCt, 1);

  // Solvabilité: capitaux propres / total passif.
  // Si total passif n'est pas saisi, on l'approxime par bilan simplifié.
  const totalPassifApprox =
    totalActif ?? addNullable(addNullable(capitauxPropres, dettesFinancieres), dettesCt);
  const solvabilite = safeDivide(capitauxPropres, totalPassifApprox, 1);

  // Gearing demandé: dettes financières / EBE (si EBE > 0).
  const gearing =
    dettesFinancieres !== null && ebe !== null && ebe > 0 ? dettesFinancieres / ebe : null;

  // Flux de trésorerie libre approximé:
  // on estime la variation de BFR par une composante liée à la croissance.
  const variationBfrApprox =
    bfr !== null && tcam !== null ? bfr * (tcam / 100) : null;
  const fcf =
    ebe !== null
      ? ebe - (variationBfrApprox ?? 0)
      : null;

  // Charges fixes et point mort (approximation MVP):
  // - charges fixes approx = CA - EBE
  // - point mort approx = CA - EBE (si EBE<0, le point mort dépasse le CA actuel)
  const chargesFixes =
    ca !== null && ebe !== null ? ca - ebe : null;
  const pointMort =
    ca !== null && ebe !== null ? Math.max(ca - ebe, 0) : null;

  // Usure des actifs.
  const ratioImmoUsure = safeDivide(immoNet, immoBrut, 1);
  const etatMaterielIndice = ratioImmoUsure !== null ? ratioImmoUsure * 100 : null;

  // Ratio de couverture des immobilisations pour les vues existantes.
  const ratioImmo = safeDivide(totalActif, immoNet, 1);

  // CAF simplifiée pour alimenter les blocs financement.
  const caf = ebe ?? resultatNet;

  // Capacité de remboursement en années.
  const capaciteRemboursementAnnees =
    dettesFinancieres !== null && caf !== null && caf > 0 ? dettesFinancieres / caf : null;

  // Burn rate / runway restent prudents en mode manuel.
  const monthlyBurnRate =
    fcf !== null && fcf < 0 ? Math.abs(fcf) / 12 : 0;
  const cashRunwayMonths =
    monthlyBurnRate > 0 && cash !== null && cash > 0 ? cash / monthlyBurnRate : null;

  return {
    tcam,
    va: null,
    ebitda: ebe,
    ebe,
    marge_ebitda: margeEbitda,
    charges_var: null,
    mscv: null,
    tmscv: null,
    ca,
    charges_fixes: chargesFixes,
    point_mort: pointMort,
    ratio_immo: ratioImmo,
    ratio_immo_usure: ratioImmoUsure,
    bfr,
    rot_bfr: rotBfr,
    dso,
    dpo,
    rot_stocks: null,
    caf,
    fte: fcf,
    tn,
    solvabilite,
    gearing,
    liq_gen: liqGen,
    liq_red: liqRed,
    liq_imm: liqImm,
    disponibilites: cash,
    roce,
    roe,
    effet_levier: gearing,
    resultat_net: resultatNet,
    grossMarginRate: null,
    netProfit: margeNette,
    workingCapital: bfr,
    monthlyBurnRate,
    cashRunwayMonths,
    capacite_remboursement_annees: capaciteRemboursementAnnees,
    etat_materiel_indice: etatMaterielIndice,
    healthScore: null
  };
}

function finiteOrNull(value: number | null): number | null {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function safeDivide(
  numerator: number | null,
  denominator: number | null,
  multiplier: number
): number | null {
  if (
    numerator === null ||
    denominator === null ||
    denominator === 0 ||
    Number.isNaN(denominator) ||
    !Number.isFinite(denominator)
  ) {
    return null;
  }
  const value = (numerator / denominator) * multiplier;
  return Number.isFinite(value) ? value : null;
}

function toPercentRatio(numerator: number | null, denominator: number | null): number | null {
  return safeDivide(numerator, denominator, 100);
}

function addNullable(left: number | null, right: number | null): number | null {
  if (left === null && right === null) {
    return null;
  }
  return (left ?? 0) + (right ?? 0);
}
