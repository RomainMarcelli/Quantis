// File: lib/benchmark/kpiMapping.ts
// Role: relie chaque KPI Vyzor (CalculatedKpis) à son triplet de colonnes dans la vue Vyzor.
import type { CalculatedKpis } from "@/types/analysis";
import type { VyzorBenchmarkRow, BenchmarkValueFormat, VyzorKpiPrefix } from "@/types/benchmark";

export type BenchmarkableKpiKey = keyof CalculatedKpis;

type ColumnTriple = {
  bas: keyof VyzorBenchmarkRow;
  median: keyof VyzorBenchmarkRow;
  haut: keyof VyzorBenchmarkRow;
};

export type KpiBenchmarkMapping = {
  prefix: VyzorKpiPrefix;
  columns: ColumnTriple;
  format: BenchmarkValueFormat;
  // Pour les KPIs où "plus c'est haut" est négatif (ex: DSO, BFR jours, gearing, dettes…),
  // on inverse l'interprétation visuelle : être au-dessus de P75 devient rouge.
  invertSentiment: boolean;
};

// Helper interne : un seul prefix engendre les trois colonnes par convention <prefix>_<bas|median|haut>.
function triple(prefix: VyzorKpiPrefix): ColumnTriple {
  return {
    bas: `${prefix}_bas` as keyof VyzorBenchmarkRow,
    median: `${prefix}_median` as keyof VyzorBenchmarkRow,
    haut: `${prefix}_haut` as keyof VyzorBenchmarkRow
  };
}

// Mapping explicite. KPI Vyzor non listé = pas d'indicateur (graceful fallback côté UI).
// Choix de mapping documentés dans le plan : EBE→ebitda, MSCV→marge_brute, FTE→effectif…
export const KPI_BENCHMARK_MAPPING: Partial<Record<BenchmarkableKpiKey, KpiBenchmarkMapping>> = {
  // Performance
  ca: { prefix: "ca", columns: triple("ca"), format: "currency", invertSentiment: false },
  ebe: { prefix: "ebitda", columns: triple("ebitda"), format: "currency", invertSentiment: false },
  ebitda: { prefix: "ebitda", columns: triple("ebitda"), format: "currency", invertSentiment: false },
  resultat_net: { prefix: "res_net", columns: triple("res_net"), format: "currency", invertSentiment: false },
  va: { prefix: "va", columns: triple("va"), format: "currency", invertSentiment: false },
  mscv: { prefix: "marge_brute", columns: triple("marge_brute"), format: "currency", invertSentiment: false },

  // Croissance & marges
  tcam: { prefix: "croissance_ca", columns: triple("croissance_ca"), format: "percent", invertSentiment: false },
  marge_ebitda: { prefix: "marge_ebitda", columns: triple("marge_ebitda"), format: "percent", invertSentiment: false },

  // BFR & gestion (sentiment inversé : plus c'est haut, plus c'est mauvais)
  bfr: { prefix: "bfr", columns: triple("bfr"), format: "currency", invertSentiment: true },
  rot_bfr: { prefix: "bfr_jours", columns: triple("bfr_jours"), format: "days", invertSentiment: true },
  dso: { prefix: "dso", columns: triple("dso"), format: "days", invertSentiment: true },
  dpo: { prefix: "dpo", columns: triple("dpo"), format: "days", invertSentiment: false },
  rot_stocks: { prefix: "rot_stocks", columns: triple("rot_stocks"), format: "days", invertSentiment: true },

  // Autonomie financière
  caf: { prefix: "caf", columns: triple("caf"), format: "currency", invertSentiment: false },
  disponibilites: { prefix: "treso", columns: triple("treso"), format: "currency", invertSentiment: false },
  capacite_remboursement_annees: {
    prefix: "cap_remboursement",
    columns: triple("cap_remboursement"),
    format: "ratio",
    invertSentiment: true
  },
  gearing: { prefix: "gearing", columns: triple("gearing"), format: "ratio", invertSentiment: true },
  solvabilite: { prefix: "solvabilite", columns: triple("solvabilite"), format: "ratio", invertSentiment: false },

  // Solvabilité & liquidité
  liq_gen: { prefix: "liq_gen", columns: triple("liq_gen"), format: "ratio", invertSentiment: false },

  // Rentabilité
  roe: { prefix: "roe", columns: triple("roe"), format: "percent", invertSentiment: false },
  roce: { prefix: "roce", columns: triple("roce"), format: "percent", invertSentiment: false },

  // Structure d'activité
  fte: { prefix: "effectif", columns: triple("effectif"), format: "headcount", invertSentiment: false }
};

export function getMappingFor(kpiKey: BenchmarkableKpiKey): KpiBenchmarkMapping | null {
  return KPI_BENCHMARK_MAPPING[kpiKey] ?? null;
}
