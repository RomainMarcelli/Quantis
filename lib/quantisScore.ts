// File: lib/quantisScore.ts
// Role: calcule le Quantis Score (QS) V1 avec la logique Python de reference, en fonction pure TypeScript.

export type QuantisScoreInputKpis = {
  // Entrees attendues par la formule de scoring.
  marge_brute_pct?: number | null;
  marge_ebitda?: number | null;
  marge_nette_pct?: number | null;
  roce?: number | null;
  roe?: number | null;
  rot_bfr?: number | null;
  tcam?: number | null;
  point_mort?: number | null;
  ca?: number | null;
  fcf?: number | null;
  solvabilite?: number | null;
  gearing?: number | null;
  liq_gen?: number | null;
  liq_red?: number | null;
  liq_imm?: number | null;
  tn?: number | null;
  ratio_immo_usure?: number | null;

  // Alias utilises dans l'application actuelle.
  grossMarginRate?: number | null;
  resultat_net?: number | null;
  netProfit?: number | null;
  fte?: number | null;
  ratio_immo?: number | null;
  etat_materiel_indice?: number | null;
};

export type QuantisScoreResult = {
  quantis_score: number;
  piliers: {
    rentabilite: number;
    solvabilite: number;
    liquidite: number;
    efficacite: number;
  };
  alerte_investissement: boolean;
};

// Normalise un ratio entre 0 et 100 selon des bornes de marche.
// Comportement identique au script Python:
// - valeur manquante/invalide => 50
// - reverse=true => plus bas = meilleur
export function normalize(
  val: number | string | null | undefined,
  minVal: number,
  maxVal: number,
  reverse = false
): number {
  if (val === null || val === undefined) {
    return 50;
  }

  const numericValue = toFiniteNumber(val);
  if (numericValue === null) {
    return 50;
  }

  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || maxVal <= minVal) {
    return 50;
  }

  if (reverse) {
    if (numericValue <= minVal) {
      return 100;
    }
    if (numericValue >= maxVal) {
      return 0;
    }
    return (100 * (maxVal - numericValue)) / (maxVal - minVal);
  }

  if (numericValue >= maxVal) {
    return 100;
  }
  if (numericValue <= minVal) {
    return 0;
  }
  return (100 * (numericValue - minVal)) / (maxVal - minVal);
}

export function calculateQuantisScore(kpis: QuantisScoreInputKpis): QuantisScoreResult {
  const input = resolveScoreInputs(kpis);

  // --- 1. PILIER RENTABILITE (35%) ---
  // Mesure la capacite a generer de la marge et du rendement sur le capital.
  const nMargeBrute = normalize(input.marge_brute_pct, 20, 70);
  const nMargeEbitda = normalize(input.marge_ebitda, 0, 15);
  const nMargeNette = normalize(input.marge_nette_pct, 0, 8);
  const nRoce = normalize(input.roce, 5, 15);
  const nRoe = normalize(input.roe, 5, 20);

  const pRentabilite =
    nMargeBrute * 0.1 +
    nMargeEbitda * 0.3 +
    nMargeNette * 0.2 +
    nRoce * 0.2 +
    nRoe * 0.2;

  // --- 2. PILIER EFFICACITE & CASH (25%) ---
  // Mesure la rotation du cash, la croissance et la securite vis-a-vis du point mort.
  const nRotBfr = normalize(input.rot_bfr, 30, 90, true);
  const nGrowth = normalize(input.tcam, -5, 10);

  // Securite point mort: (CA - point mort) / CA
  const ca = input.ca ?? 1;
  const pointMort = input.point_mort ?? 0;
  const distPm = ca > 0 ? (ca - pointMort) / ca : 0;
  const nSecuPm = normalize(distPm, 0, 0.25);

  // FCF binaire comme en Python.
  const nFcf = (input.fcf ?? 0) > 0 ? 100 : 0;

  const pEfficacite = nRotBfr * 0.25 + nGrowth * 0.2 + nSecuPm * 0.2 + nFcf * 0.35;

  // --- 3. PILIER SOLVABILITE (20%) ---
  // Mesure l'independance financiere et le niveau de levier.
  const nIndepFin = normalize(input.solvabilite, 0.15, 0.4);
  const nGearing = normalize(input.gearing, 2.0, 5.0, true);

  const pSolvabilite = nIndepFin * 0.5 + nGearing * 0.5;

  // --- 4. PILIER LIQUIDITE (20%) ---
  // Mesure la capacite a honorer les dettes court terme + tresorerie nette.
  const nLiqGen = normalize(input.liq_gen, 0.8, 1.2);
  const nLiqRed = normalize(input.liq_red, 0.6, 1.0);
  const nLiqImm = normalize(input.liq_imm, 0.05, 0.2);
  const nTresoPure = (input.tn ?? 0) > 0 ? 100 : 0;

  const pLiquidite = nLiqGen * 0.4 + nLiqRed * 0.2 + nLiqImm * 0.2 + nTresoPure * 0.2;

  // --- 5. MALUS INVESTISSEMENT ---
  // Si l'outil est use (<30% de valeur nette), on retire 5 points au score final.
  const ratioUsure = input.ratio_immo_usure ?? 1.0;
  const malusInvest = ratioUsure < 0.3 ? -5 : 0;

  // --- CALCUL FINAL ---
  const finalScoreRaw =
    pRentabilite * 0.35 + pSolvabilite * 0.2 + pLiquidite * 0.2 + pEfficacite * 0.25 + malusInvest;

  const finalScore = clamp(finalScoreRaw, 0, 100);

  return {
    quantis_score: round(finalScore, 1),
    piliers: {
      rentabilite: round(pRentabilite, 1),
      solvabilite: round(pSolvabilite, 1),
      liquidite: round(pLiquidite, 1),
      efficacite: round(pEfficacite, 1)
    },
    alerte_investissement: ratioUsure < 0.3
  };
}

type QuantisScoreResolvedInput = {
  marge_brute_pct: number | null;
  marge_ebitda: number | null;
  marge_nette_pct: number | null;
  roce: number | null;
  roe: number | null;
  rot_bfr: number | null;
  tcam: number | null;
  point_mort: number | null;
  ca: number | null;
  fcf: number | null;
  solvabilite: number | null;
  gearing: number | null;
  liq_gen: number | null;
  liq_red: number | null;
  liq_imm: number | null;
  tn: number | null;
  ratio_immo_usure: number | null;
};

function resolveScoreInputs(kpis: QuantisScoreInputKpis): QuantisScoreResolvedInput {
  const ca = pickNumber(kpis.ca);
  const resultatNet = pickNumber(kpis.resultat_net, kpis.netProfit);

  const margeNetteFromResultat =
    resultatNet !== null && ca !== null && ca > 0 ? (resultatNet / ca) * 100 : null;

  return {
    marge_brute_pct: pickNumber(kpis.marge_brute_pct, kpis.grossMarginRate),
    marge_ebitda: pickNumber(kpis.marge_ebitda),
    marge_nette_pct: pickNumber(kpis.marge_nette_pct, margeNetteFromResultat),
    // Alignement pratique pour l'app: ROE/ROCE peuvent arriver en ratio (0.12) ou en pourcentage (12).
    roce: percentIfRatio(pickNumber(kpis.roce)),
    roe: percentIfRatio(pickNumber(kpis.roe)),
    rot_bfr: pickNumber(kpis.rot_bfr),
    tcam: percentIfRatio(pickNumber(kpis.tcam)),
    point_mort: pickNumber(kpis.point_mort),
    ca,
    fcf: pickNumber(kpis.fcf, kpis.fte),
    solvabilite: pickNumber(kpis.solvabilite),
    gearing: pickNumber(kpis.gearing),
    liq_gen: pickNumber(kpis.liq_gen),
    liq_red: pickNumber(kpis.liq_red),
    liq_imm: pickNumber(kpis.liq_imm),
    tn: pickNumber(kpis.tn),
    ratio_immo_usure: resolveRatioImmoUsure(kpis)
  };
}

function resolveRatioImmoUsure(kpis: QuantisScoreInputKpis): number | null {
  const direct = pickNumber(kpis.ratio_immo_usure);
  if (direct !== null) {
    return ratioIfPercent(direct);
  }

  const etatMateriel = pickNumber(kpis.etat_materiel_indice);
  if (etatMateriel !== null) {
    return ratioIfPercent(etatMateriel);
  }

  return null;
}

function percentIfRatio(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function ratioIfPercent(value: number): number {
  return value > 1 ? value / 100 : value;
}

function pickNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function toFiniteNumber(value: number | string): number | null {
  const converted = Number(value);
  if (!Number.isFinite(converted)) {
    return null;
  }
  return converted;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
