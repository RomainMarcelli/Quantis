// File: types/benchmark.ts
// Role: types pour le benchmark Vyzor (vue Supabase v_vyzor_global_stats_360_full).

// Tous les KPIs disponibles dans la vue Vyzor, repérés par leur préfixe.
// Chaque préfixe correspond à un triplet de colonnes <prefix>_bas / <prefix>_median / <prefix>_haut
// (sauf cas spéciaux listés ci-dessous où le suffixe diffère).
export type VyzorKpiPrefix =
  // Performance (€)
  | "ca"
  | "marge_brute"
  | "ebitda"
  | "res_exploit"
  | "res_net"
  // Croissance & marges (%)
  | "croissance_ca"
  | "marge_brute_pct"
  | "marge_ebitda"
  | "marge_ope"
  // Gestion BFR
  | "bfr"
  | "bfr_exploit"
  | "bfr_hors_exploit"
  | "bfr_jours"
  | "bfr_exploit_jours"
  | "bfr_hors_exploit_jours"
  | "dso"
  | "dpo"
  | "rot_stocks"
  // Autonomie financière
  | "caf"
  | "caf_ca_pct"
  | "frng"
  | "couv_bfr"
  | "treso"
  | "dettes"
  | "cap_remboursement"
  | "gearing"
  | "solvabilite"
  | "levier"
  // Solvabilité
  | "dettes_court_terme"
  | "liq_gen"
  | "couv_dettes"
  | "fonds_propres"
  // Rentabilité
  | "marge_nette"
  | "roe"
  | "roce"
  | "va"
  | "taux_va"
  // Structure d'activité
  | "effectif"
  | "salaires"
  | "ratio_sal_ca"
  | "impots"
  | "export";

// Forme brute de la vue (single-row). Toutes les colonnes sont nullables côté Supabase.
export type VyzorBenchmarkRow = {
  ca_bas: number | null;
  ca_median: number | null;
  ca_haut: number | null;
  marge_brute_bas: number | null;
  marge_brute_median: number | null;
  marge_brute_haut: number | null;
  ebitda_bas: number | null;
  ebitda_median: number | null;
  ebitda_haut: number | null;
  res_exploit_bas: number | null;
  res_exploit_median: number | null;
  res_exploit_haut: number | null;
  res_net_bas: number | null;
  res_net_median: number | null;
  res_net_haut: number | null;
  croissance_ca_bas: number | null;
  croissance_ca_median: number | null;
  croissance_ca_haut: number | null;
  marge_brute_pct_bas: number | null;
  marge_brute_pct_median: number | null;
  marge_brute_pct_haut: number | null;
  marge_ebitda_bas: number | null;
  marge_ebitda_median: number | null;
  marge_ebitda_haut: number | null;
  marge_ope_bas: number | null;
  marge_ope_median: number | null;
  marge_ope_haut: number | null;
  bfr_bas: number | null;
  bfr_median: number | null;
  bfr_haut: number | null;
  bfr_exploit_bas: number | null;
  bfr_exploit_median: number | null;
  bfr_exploit_haut: number | null;
  bfr_hors_exploit_bas: number | null;
  bfr_hors_exploit_median: number | null;
  bfr_hors_exploit_haut: number | null;
  bfr_jours_bas: number | null;
  bfr_jours_median: number | null;
  bfr_jours_haut: number | null;
  bfr_exploit_jours_bas: number | null;
  bfr_exploit_jours_median: number | null;
  bfr_exploit_jours_haut: number | null;
  bfr_hors_exploit_jours_bas: number | null;
  bfr_hors_exploit_jours_median: number | null;
  bfr_hors_exploit_jours_haut: number | null;
  dso_bas: number | null;
  dso_median: number | null;
  dso_haut: number | null;
  dpo_bas: number | null;
  dpo_median: number | null;
  dpo_haut: number | null;
  rot_stocks_bas: number | null;
  rot_stocks_median: number | null;
  rot_stocks_haut: number | null;
  caf_bas: number | null;
  caf_median: number | null;
  caf_haut: number | null;
  caf_ca_pct_bas: number | null;
  caf_ca_pct_median: number | null;
  caf_ca_pct_haut: number | null;
  frng_bas: number | null;
  frng_median: number | null;
  frng_haut: number | null;
  couv_bfr_bas: number | null;
  couv_bfr_median: number | null;
  couv_bfr_haut: number | null;
  treso_bas: number | null;
  treso_median: number | null;
  treso_haut: number | null;
  dettes_bas: number | null;
  dettes_median: number | null;
  dettes_haut: number | null;
  cap_remboursement_bas: number | null;
  cap_remboursement_median: number | null;
  cap_remboursement_haut: number | null;
  gearing_bas: number | null;
  gearing_median: number | null;
  gearing_haut: number | null;
  solvabilite_bas: number | null;
  solvabilite_median: number | null;
  solvabilite_haut: number | null;
  levier_bas: number | null;
  levier_median: number | null;
  levier_haut: number | null;
  dettes_court_terme_bas: number | null;
  dettes_court_terme_median: number | null;
  dettes_court_terme_haut: number | null;
  liq_gen_bas: number | null;
  liq_gen_median: number | null;
  liq_gen_haut: number | null;
  couv_dettes_bas: number | null;
  couv_dettes_median: number | null;
  couv_dettes_haut: number | null;
  fonds_propres_bas: number | null;
  fonds_propres_median: number | null;
  fonds_propres_haut: number | null;
  marge_nette_bas: number | null;
  marge_nette_median: number | null;
  marge_nette_haut: number | null;
  roe_bas: number | null;
  roe_median: number | null;
  roe_haut: number | null;
  roce_bas: number | null;
  roce_median: number | null;
  roce_haut: number | null;
  va_bas: number | null;
  va_median: number | null;
  va_haut: number | null;
  taux_va_bas: number | null;
  taux_va_median: number | null;
  taux_va_haut: number | null;
  effectif_bas: number | null;
  effectif_median: number | null;
  effectif_haut: number | null;
  salaires_bas: number | null;
  salaires_median: number | null;
  salaires_haut: number | null;
  ratio_sal_ca_bas: number | null;
  ratio_sal_ca_median: number | null;
  ratio_sal_ca_haut: number | null;
  impots_bas: number | null;
  impots_median: number | null;
  impots_haut: number | null;
  export_bas: number | null;
  export_median: number | null;
  export_haut: number | null;
};

export type VyzorPercentiles = {
  p25: number;
  p50: number;
  p75: number;
};

// Position de la valeur de l'entreprise par rapport aux percentiles du marché.
// "above_p75" = top quartile, "below_p25" = bottom quartile, etc.
export type BenchmarkPosition =
  | "above_p75"
  | "between_p50_p75"
  | "between_p25_p50"
  | "below_p25";

// Format d'affichage de la valeur dans le tooltip du composant indicateur.
export type BenchmarkValueFormat = "currency" | "percent" | "days" | "ratio" | "headcount";

// Résultat consolidé pour une carte KPI : valeur de l'entreprise + percentiles + position calculée.
export type KpiBenchmark = {
  value: number;
  percentiles: VyzorPercentiles;
  position: BenchmarkPosition;
  // Écart relatif (%) entre la valeur et la médiane P50. Positif = au-dessus de la médiane.
  deltaVsP50Pct: number;
};
