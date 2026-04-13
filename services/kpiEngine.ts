import type { CalculatedKpis, MappedFinancialData } from "@/types/analysis";

export function computeKpis(data: MappedFinancialData): CalculatedKpis {
  const ca = computeCa(data);
  const tcam = percent(powMinusOne(div(ca, data.ca_n_minus_1), inv(data.n)));
  const va = sub(data.total_prod_expl, sum(data.achats_march, data.achats_mp, data.ace));
  const ebitda = sub(va, sum(data.impots_taxes, data.salaires, data.charges_soc));
  const ebe = ebitda;
  const marge_ebitda = percent(div(ebitda, data.total_prod_expl));
  const charges_var = sum(data.achats_march, data.achats_mp, data.var_stock_march, data.var_stock_mp);
  const mscv = sub(ca, charges_var);
  const tmscv = div(mscv, ca);
  const charges_fixes = sum(data.ace, data.salaires, data.charges_soc, data.dap);
  const point_mort = div(charges_fixes, tmscv);
  const ratio_immo = computeImmobilizationRatio({
    totalActifImmoNet: data.total_actif_immo_net,
    totalActifImmoBrut: data.total_actif_immo_brut,
    totalActifImmo: data.total_actif_immo
  });
  const bfr = sub(
    sum(data.total_stocks, data.creances),
    sum(data.fournisseurs, data.dettes_fisc_soc)
  );
  const rot_bfr = mul(div(bfr, mul(data.total_prod_expl, 1.2)), 365);
  const dso = div(mul(data.clients, 365), mul(data.total_prod_expl, 1.2));
  const dpo = div(mul(data.fournisseurs, 365), mul(sum(data.achats_march, data.ace), 1.2));
  const rot_stocks = div(mul(data.total_stocks, 365), data.total_prod_expl);
  const caf = sum(data.res_net, data.dap);
  const fte = caf === null ? null : caf - (data.delta_bfr ?? 0);
  const tn = sub(data.dispo, data.emprunts);
  const solvabilite = div(data.total_cp, data.total_passif);
  const gearing = div(sub(data.emprunts, data.dispo), ebitda);
  const liq_gen = div(data.total_actif_circ, sum(data.fournisseurs, data.dettes_fisc_soc));
  const liq_red = div(sum(data.creances, data.dispo), sum(data.fournisseurs, data.dettes_fisc_soc));
  const liq_imm = div(data.dispo, sum(data.fournisseurs, data.dettes_fisc_soc));
  const disponibilites = data.dispo;
  const roce = div(mul(data.ebit, 0.75), sum(data.total_actif_immo, bfr));
  const roe = div(data.res_net, data.total_cp);
  const effet_levier = sub(roe, roce);
  const resultat_net = data.res_net ?? data.resultat_exercice;
  const capacite_remboursement_annees = computeDebtRepaymentCapacity(data.emprunts, caf);
  const etat_materiel_indice = percent(ratio_immo);

  const grossMarginRate = percent(tmscv);
  const netProfit = resultat_net;
  const workingCapital = bfr;
  const monthlyBurnRate = netProfit !== null && netProfit < 0 ? round(Math.abs(netProfit) / 12) : 0;
  const cashRunwayMonths = monthlyBurnRate > 0 ? div(data.dispo, monthlyBurnRate) : null;

  return {
    tcam: roundOrNull(tcam),
    ca: roundOrNull(ca),
    va: roundOrNull(va),
    ebitda: roundOrNull(ebitda),
    ebe: roundOrNull(ebe),
    marge_ebitda: roundOrNull(marge_ebitda),
    charges_var: roundOrNull(charges_var),
    mscv: roundOrNull(mscv),
    tmscv: roundOrNull(tmscv),
    charges_fixes: roundOrNull(charges_fixes),
    point_mort: roundOrNull(point_mort),
    ratio_immo: roundOrNull(ratio_immo),
    bfr: roundOrNull(bfr),
    rot_bfr: roundOrNull(rot_bfr),
    dso: roundOrNull(dso),
    dpo: roundOrNull(dpo),
    rot_stocks: roundOrNull(rot_stocks),
    caf: roundOrNull(caf),
    fte: roundOrNull(fte),
    tn: roundOrNull(tn),
    solvabilite: roundOrNull(solvabilite),
    gearing: roundOrNull(gearing),
    liq_gen: roundOrNull(liq_gen),
    liq_red: roundOrNull(liq_red),
    liq_imm: roundOrNull(liq_imm),
    disponibilites: roundOrNull(disponibilites),
    roce: roundOrNull(roce),
    roe: roundOrNull(roe),
    effet_levier: roundOrNull(effet_levier),
    resultat_net: roundOrNull(resultat_net),
    grossMarginRate: roundOrNull(grossMarginRate),
    netProfit: roundOrNull(netProfit),
    workingCapital: roundOrNull(workingCapital),
    monthlyBurnRate: roundOrNull(monthlyBurnRate),
    cashRunwayMonths: roundOrNull(cashRunwayMonths),
    capacite_remboursement_annees: roundOrNull(capacite_remboursement_annees),
    etat_materiel_indice: roundOrNull(etat_materiel_indice),
    healthScore: scoreHealth({
      grossMarginRate,
      netProfit,
      workingCapital,
      cashRunwayMonths
    })
  };
}

function scoreHealth({
  grossMarginRate,
  netProfit,
  workingCapital,
  cashRunwayMonths
}: {
  grossMarginRate: number | null;
  netProfit: number | null;
  workingCapital: number | null;
  cashRunwayMonths: number | null;
}): number | null {
  let score = 0;
  let weights = 0;

  if (grossMarginRate !== null) {
    score += normalize(grossMarginRate, 20, 60) * 35;
    weights += 35;
  }
  if (netProfit !== null) {
    score += (netProfit > 0 ? 1 : 0) * 30;
    weights += 30;
  }
  if (workingCapital !== null) {
    score += (workingCapital >= 0 ? 1 : 0) * 20;
    weights += 20;
  }
  if (cashRunwayMonths !== null) {
    score += normalize(cashRunwayMonths, 2, 12) * 15;
    weights += 15;
  }

  if (weights === 0) {
    return null;
  }

  return round((score / weights) * 100);
}

function computeCa(data: MappedFinancialData): number | null {
  const salesGoods = sanitizeTurnoverComponent(data.ventes_march);
  const soldProduction = sanitizeTurnoverComponent(data.prod_vendue);
  const hasAtLeastOneSource = data.ventes_march !== null || data.prod_vendue !== null;

  if (salesGoods !== null && soldProduction !== null) {
    return salesGoods + soldProduction;
  }

  if (salesGoods !== null) {
    return salesGoods;
  }

  if (soldProduction !== null) {
    return soldProduction;
  }

  if (!hasAtLeastOneSource) {
    return data.total_prod_expl;
  }

  return null;
}

function sanitizeTurnoverComponent(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  if (value < 0) {
    return null;
  }

  return value;
}

function normalize(value: number, low: number, high: number): number {
  if (value <= low) {
    return 0;
  }
  if (value >= high) {
    return 1;
  }
  return (value - low) / (high - low);
}

function sum(...values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) {
    return null;
  }
  const strictValues = values as number[];
  return strictValues.reduce((acc, value) => acc + value, 0);
}

function sub(left: number | null, right: number | null): number | null {
  if (left === null || right === null) {
    return null;
  }
  return left - right;
}

function mul(left: number | null, right: number | null): number | null {
  if (left === null || right === null) {
    return null;
  }
  return left * right;
}

function div(left: number | null, right: number | null): number | null {
  if (left === null || right === null || right === 0) {
    return null;
  }
  return left / right;
}

function inv(value: number | null): number | null {
  if (value === null || value === 0) {
    return null;
  }
  return 1 / value;
}

function powMinusOne(base: number | null, exponent: number | null): number | null {
  if (base === null || exponent === null || base <= 0) {
    return null;
  }
  return Math.pow(base, exponent) - 1;
}

function percent(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  return value * 100;
}

function roundOrNull(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  return round(value);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function computeDebtRepaymentCapacity(
  debt: number | null,
  cashFlowCapacity: number | null
): number | null {
  if (debt === null || cashFlowCapacity === null || cashFlowCapacity <= 0) {
    return null;
  }
  return debt / cashFlowCapacity;
}

function computeImmobilizationRatio(input: {
  totalActifImmoNet: number | null;
  totalActifImmoBrut: number | null;
  totalActifImmo: number | null;
}): number | null {
  const { totalActifImmoNet, totalActifImmoBrut, totalActifImmo } = input;

  if (totalActifImmoNet !== null && totalActifImmoBrut !== null) {
    return div(totalActifImmoNet, totalActifImmoBrut);
  }

  if (
    totalActifImmoNet !== null &&
    totalActifImmo !== null &&
    totalActifImmo > 0 &&
    totalActifImmo >= totalActifImmoNet &&
    totalActifImmo !== totalActifImmoNet
  ) {
    return div(totalActifImmoNet, totalActifImmo);
  }

  if (
    totalActifImmoBrut !== null &&
    totalActifImmo !== null &&
    totalActifImmo > 0 &&
    totalActifImmoBrut >= totalActifImmo &&
    totalActifImmoBrut !== totalActifImmo
  ) {
    return div(totalActifImmo, totalActifImmoBrut);
  }

  return null;
}
