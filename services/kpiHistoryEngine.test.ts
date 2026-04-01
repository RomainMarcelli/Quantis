import { describe, expect, it } from "vitest";
import { createEmptyMappedFinancialData, createEmptyRawAnalysisData } from "@/services/mapping/financialDataMapper";
import { applyHistoricalKpiCorrections } from "@/services/kpiHistoryEngine";
import type { AnalysisRecord, CalculatedKpis } from "@/types/analysis";

function makeKpis(overrides: Partial<CalculatedKpis> = {}): CalculatedKpis {
  return {
    tcam: null,
    va: null,
    ebitda: null,
    ebe: null,
    marge_ebitda: null,
    charges_var: null,
    mscv: null,
    tmscv: null,
    ca: null,
    charges_fixes: null,
    point_mort: null,
    ratio_immo: null,
    ratio_immo_usure: null,
    bfr: null,
    rot_bfr: null,
    dso: null,
    dpo: null,
    rot_stocks: null,
    caf: null,
    fte: null,
    tn: null,
    solvabilite: null,
    gearing: null,
    liq_gen: null,
    liq_red: null,
    liq_imm: null,
    disponibilites: null,
    roce: null,
    roe: null,
    effet_levier: null,
    resultat_net: null,
    grossMarginRate: null,
    netProfit: null,
    workingCapital: null,
    monthlyBurnRate: null,
    cashRunwayMonths: null,
    capacite_remboursement_annees: null,
    etat_materiel_indice: null,
    healthScore: null,
    ...overrides
  };
}

function makeAnalysis(params: {
  id: string;
  fiscalYear: number;
  ca: number;
  bfr: number;
  caf: number;
  folderName?: string;
  createdAt?: string;
  mappedData?: Partial<AnalysisRecord["mappedData"]>;
  parsedData?: AnalysisRecord["parsedData"];
}): AnalysisRecord {
  return {
    id: params.id,
    userId: "u1",
    folderName: params.folderName ?? "Dossier principal",
    createdAt: params.createdAt ?? `${params.fiscalYear}-12-31T00:00:00.000Z`,
    fiscalYear: params.fiscalYear,
    sourceFiles: [],
    parsedData: params.parsedData ?? [],
    rawData: createEmptyRawAnalysisData(),
    mappedData: {
      ...createEmptyMappedFinancialData(),
      total_prod_expl: params.ca,
      ...params.mappedData
    },
    financialFacts: {
      revenue: params.ca,
      expenses: null,
      payroll: null,
      treasury: null,
      receivables: null,
      payables: null,
      inventory: null
    },
    kpis: makeKpis({
      ca: params.ca,
      bfr: params.bfr,
      caf: params.caf
    }),
    quantisScore: null,
    uploadContext: null
  };
}

describe("applyHistoricalKpiCorrections", () => {
  it("recalcule le TCAM multi-annees en triant les exercices", () => {
    const analyses = [
      makeAnalysis({ id: "a-2025", fiscalYear: 2025, ca: 300000, bfr: 12000, caf: 50000 }),
      makeAnalysis({ id: "a-2023", fiscalYear: 2023, ca: 100000, bfr: 7000, caf: 30000 }),
      makeAnalysis({ id: "a-2024", fiscalYear: 2024, ca: 200000, bfr: 9000, caf: 40000 })
    ];

    const corrected = applyHistoricalKpiCorrections(analyses);
    const byId = new Map(corrected.map((analysis) => [analysis.id, analysis]));

    expect(byId.get("a-2023")?.kpis.tcam).toBeNull();
    expect(byId.get("a-2024")?.kpis.tcam).toBe(100);
    expect(byId.get("a-2025")?.kpis.tcam).toBe(73.21);
  });

  it("calcule delta BFR et cash reel (fte) avec fallback safe", () => {
    const analyses = [
      makeAnalysis({ id: "b-2024", fiscalYear: 2024, ca: 100000, bfr: 8000, caf: 30000 }),
      makeAnalysis({ id: "b-2025", fiscalYear: 2025, ca: 120000, bfr: 10000, caf: 35000 })
    ];

    const corrected = applyHistoricalKpiCorrections(analyses);
    const byId = new Map(corrected.map((analysis) => [analysis.id, analysis]));

    expect(byId.get("b-2024")?.mappedData.delta_bfr).toBe(0);
    expect(byId.get("b-2024")?.kpis.fte).toBe(30000);
    expect(byId.get("b-2025")?.mappedData.delta_bfr).toBe(2000);
    expect(byId.get("b-2025")?.kpis.fte).toBe(33000);
  });

  it("hydrates immobilization brut/net from preview rows for legacy analyses", () => {
    const analysis = makeAnalysis({
      id: "legacy-immo",
      fiscalYear: 2025,
      ca: 200000,
      bfr: 12000,
      caf: 30000,
      mappedData: {
        total_actif_immo: 396266.85,
        total_actif_immo_brut: null,
        total_actif_immo_net: null
      },
      parsedData: [
        {
          fileName: "Quantis_Full_Liasse_31-12-2025.xlsx",
          fileType: "excel",
          extractedAt: "2026-04-01T00:00:00.000Z",
          fiscalYear: null,
          metrics: [],
          previewRows: [
            {
              "__EMPTY_1": "Variable Code",
              "__EMPTY_2": "Brut",
              "__EMPTY_3": "Amort",
              "__EMPTY_4": "Net"
            },
            {
              "__EMPTY_1": "total_actif_immo",
              "__EMPTY_2": 608223.53,
              "__EMPTY_3": 211956.68,
              "__EMPTY_4": 396266.85
            }
          ],
          rawData: {
            byVariableCode: {},
            byLineCode: {},
            byLabel: {}
          }
        }
      ]
    });

    const corrected = applyHistoricalKpiCorrections([analysis]);
    const patched = corrected[0];

    expect(patched?.mappedData.total_actif_immo_brut).toBe(608223.53);
    expect(patched?.mappedData.total_actif_immo_net).toBe(396266.85);
    expect(patched?.kpis.ratio_immo).toBe(0.65);
    expect(patched?.kpis.etat_materiel_indice).toBe(65.15);
  });

  it("replaces stale stored BFR KPIs with recomputed values from mapped data", () => {
    const analysis = makeAnalysis({
      id: "legacy-bfr",
      fiscalYear: 2025,
      ca: 1898394.68,
      bfr: 313087.85,
      caf: 481756.36,
      mappedData: {
        total_prod_expl: 1898394.68,
        total_stocks: 147448.12,
        creances: 226701.5,
        fournisseurs: 30530.88
      }
    });

    const corrected = applyHistoricalKpiCorrections([analysis]);
    const patched = corrected[0];

    expect(patched?.kpis.bfr).toBe(343618.74);
    expect(patched?.kpis.workingCapital).toBe(343618.74);
    expect(patched?.kpis.rot_bfr).toBe(55.06);
  });
});
