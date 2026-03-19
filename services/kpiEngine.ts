import type { CalculatedKpis, MappedFinancialData } from "@/types/analysis";

export function computeKpis(data: MappedFinancialData): CalculatedKpis {
  const tcam = percent(powMinusOne(div(data.total_prod_expl, data.ca_n_minus_1), inv(data.n)));
  const va = sub(data.total_prod_expl, sum(data.achats_march, data.achats_mp, data.ace));
  const ebitda = sub(va, sum(data.impots_taxes, data.salaires, data.charges_soc));
  const marge_ebitda = percent(div(ebitda, data.total_prod_expl));
  const charges_var = sum(data.achats_march, data.achats_mp, data.var_stock_march, data.var_stock_mp);
  const mscv = sub(data.total_prod_expl, charges_var);
  const tmscv = div(mscv, data.total_prod_expl);
  const charges_fixes = sum(data.ace, data.salaires, data.charges_soc, data.dap);
  const point_mort = div(charges_fixes, tmscv);
  const ratio_immo = div(data.total_actif_immo, data.total_actif);
  const bfr = sub(sum(data.total_stocks, data.creances), sum(data.fournisseurs, data.dettes_fisc_soc));
  const rot_bfr = mul(div(bfr, mul(data.total_prod_expl, 1.2)), 365);
  const dso = div(mul(data.clients, 365), mul(data.total_prod_expl, 1.2));
  const dpo = div(mul(data.fournisseurs, 365), mul(sum(data.achats_march, data.ace), 1.2));
  const rot_stocks = div(mul(data.total_stocks, 365), data.total_prod_expl);
  const caf = sum(data.res_net, data.dap);
  const fte = sub(caf, data.delta_bfr);
  const tn = sub(data.dispo, data.emprunts);
  const solvabilite = div(data.total_cp, data.total_passif);
  const gearing = div(sub(data.emprunts, data.dispo), ebitda);
  const liq_gen = div(data.total_actif_circ, sum(data.fournisseurs, data.dettes_fisc_soc));
  const liq_red = div(sum(data.creances, data.dispo), sum(data.fournisseurs, data.dettes_fisc_soc));
  const liq_imm = div(data.dispo, sum(data.fournisseurs, data.dettes_fisc_soc));
  const roce = div(mul(data.ebit, 0.75), sum(data.total_actif_immo, bfr));
  const roe = div(data.res_net, data.total_cp);
  const effet_levier = sub(roe, roce);

  const grossMarginRate = percent(tmscv);
  const netProfit = data.res_net ?? data.resultat_exercice;
  const workingCapital = bfr;
  const monthlyBurnRate = netProfit !== null && netProfit < 0 ? round(Math.abs(netProfit) / 12) : 0;
  const cashRunwayMonths = monthlyBurnRate > 0 ? div(data.dispo, monthlyBurnRate) : null;

  return {
    tcam: roundOrNull(tcam),
    va: roundOrNull(va),
    ebitda: roundOrNull(ebitda),
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
    roce: roundOrNull(roce),
    roe: roundOrNull(roe),
    effet_levier: roundOrNull(effet_levier),
    grossMarginRate: roundOrNull(grossMarginRate),
    netProfit: roundOrNull(netProfit),
    workingCapital: roundOrNull(workingCapital),
    monthlyBurnRate: roundOrNull(monthlyBurnRate),
    cashRunwayMonths: roundOrNull(cashRunwayMonths),
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
