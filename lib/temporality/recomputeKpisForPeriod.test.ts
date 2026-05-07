// Tests : recomputeKpisForPeriod doit exposer un `disponibilites` dynamique
// quand le dailyAccounting fournit `cashBalance`. Régression du 08/05/2026 :
// avant fix, le widget Disponibilités sur /synthese ne réagissait pas à la
// TemporalityBar — `recomputeKpisForPeriod` retournait toujours la valeur
// snapshot annuelle (`mappedData.dispo`).

import { describe, expect, it } from "vitest";
import { recomputeKpisForPeriod } from "@/lib/temporality/recomputeKpisForPeriod";
import type { AnalysisRecord, MappedFinancialData } from "@/types/analysis";
import type { DailyAccountingEntry, PnlVariableCode } from "@/types/connectors";

const PNL_CODES: readonly PnlVariableCode[] = [
  "ventes_march", "prod_biens", "prod_serv", "prod_vendue",
  "prod_stockee", "prod_immo", "subv_expl", "autres_prod_expl",
  "total_prod_expl", "achats_march", "var_stock_march", "achats_mp",
  "var_stock_mp", "ace", "impots_taxes", "salaires", "charges_soc",
  "dap", "dprov", "autres_charges_expl", "total_charges_expl", "ebit",
  "prod_fin", "charges_fin", "prod_excep", "charges_excep", "is_impot",
  "resultat_exercice",
];

function emptyValues(): Record<PnlVariableCode, number> {
  const v = {} as Record<PnlVariableCode, number>;
  for (const code of PNL_CODES) v[code] = 0;
  return v;
}

function mkDay(date: string, cashBalance: number, ventes = 0): DailyAccountingEntry {
  const values = emptyValues();
  values.ventes_march = ventes;
  values.total_prod_expl = ventes;
  return { date, values, entryCount: 1, cashBalance };
}

function mkAnalysis(
  daily: DailyAccountingEntry[] | null,
  snapshotDispo: number | null = 999_999
): AnalysisRecord {
  const mappedData = {
    ventes_march: 0, prod_vendue: 0, total_prod_expl: 0,
    achats_march: 0, achats_mp: 0, ace: 0, impots_taxes: 0,
    salaires: 0, charges_soc: 0, dap: 0,
    dispo: snapshotDispo,
    clients: 0, fournisseurs: 0, total_stocks: 0, creances: 0,
    dettes_fisc_soc: 0, total_actif_circ: 0, total_passif: 0, total_cp: 0,
    emprunts: 0, resultat_exercice: 0,
  } as unknown as MappedFinancialData;
  return {
    id: "test", userId: "u", folderName: "f",
    createdAt: "2026-01-01T00:00:00.000Z",
    fiscalYear: 2026, sourceFiles: [], parsedData: [],
    rawData: { byVariableCode: {}, byLineCode: {}, byLabel: {} },
    mappedData, financialFacts: {},
    kpis: { disponibilites: snapshotDispo } as never,
    quantisScore: { score: 0 } as never,
    uploadContext: { companySize: null, sector: null, source: "manual" },
    dailyAccounting: daily,
  } as unknown as AnalysisRecord;
}

describe("recomputeKpisForPeriod — disponibilites dynamique via cashBalance", () => {
  it("retourne le cashBalance du dernier jour filtré pour la période sélectionnée", () => {
    // Trois jours de données : solde cumulé 12k → 7,5k → 10,7k
    const daily = [
      mkDay("2026-03-01", 12000, 1000),
      mkDay("2026-03-15", 7500, 0),
      mkDay("2026-03-31", 10700, 500),
    ];
    const analysis = mkAnalysis(daily, 999_999);

    // Sélection : tout mars → dispo = solde du dernier jour (31 mars) = 10 700
    const result = recomputeKpisForPeriod(analysis, "2026-03-01", "2026-03-31");
    expect(result.kpis.disponibilites).toBe(10700);
    expect(result.mappedData.dispo).toBe(10700);
  });

  it("affiche un dispo différent selon la période sélectionnée (sensibilité TemporalityBar)", () => {
    const daily = [
      mkDay("2026-03-01", 12000),
      mkDay("2026-03-15", 7500),
      mkDay("2026-03-31", 10700),
    ];
    const analysis = mkAnalysis(daily, 999_999);

    const wholeMonth = recomputeKpisForPeriod(analysis, "2026-03-01", "2026-03-31");
    const firstHalf = recomputeKpisForPeriod(analysis, "2026-03-01", "2026-03-14");
    const middleSlot = recomputeKpisForPeriod(analysis, "2026-03-10", "2026-03-20");

    // Trois fenêtres → trois soldes différents (pas de valeur figée)
    expect(wholeMonth.kpis.disponibilites).toBe(10700);
    expect(firstHalf.kpis.disponibilites).toBe(12000);
    expect(middleSlot.kpis.disponibilites).toBe(7500);
  });

  it("fallback sur le snapshot annuel si dailyAccounting absent (analyse statique PDF)", () => {
    const analysis = mkAnalysis(null, 261_083);
    const result = recomputeKpisForPeriod(analysis, "2026-01-01", "2026-12-31");
    // Pas de daily → on garde la valeur annuelle pour ne pas casser les analyses PDF.
    expect(result.kpis.disponibilites).toBe(261_083);
  });

  it("fallback sur le snapshot si la période sélectionnée n'a aucune écriture", () => {
    const daily = [mkDay("2026-03-01", 12000)];
    const analysis = mkAnalysis(daily, 999_999);
    // Période antérieure aux données → filtered.length === 0 → snapshot conservé.
    const result = recomputeKpisForPeriod(analysis, "2024-01-01", "2024-12-31");
    expect(result.kpis.disponibilites).toBe(999_999);
  });
});
