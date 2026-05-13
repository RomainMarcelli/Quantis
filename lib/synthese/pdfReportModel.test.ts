import { describe, expect, it } from "vitest";
import { buildPdfReportData, resolveScoreLevel } from "@/lib/synthese/pdfReportModel";
import { renderSyntheseReportBlob } from "@/lib/synthese/downloadSyntheseReport";
import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";
import type { CalculatedKpis } from "@/types/analysis";

const baseSynthese: SyntheseViewModel = {
  score: 72,
  scoreLabel: "Santé globale sous surveillance",
  scorePiliers: {
    rentabilite: 74,
    solvabilite: 69,
    liquidite: 70,
    efficacite: 71
  },
  alerteInvestissement: false,
  metrics: [
    {
      id: "ca",
      title: "Chiffre d'affaires",
      subtitle: "Performance commerciale",
      value: 125000,
      status: "good",
      missingMessage: null,
      benchmarkLabel: "12% supérieur à la moyenne du secteur",
      trend: { direction: "up", changePercent: 5.2, label: "+5,2%", tone: "positive" }
    },
    {
      id: "ebe",
      title: "Rentabilité opérationnelle",
      subtitle: "EBE",
      value: 25000,
      status: "medium",
      missingMessage: null,
      benchmarkLabel: "3% inférieur à la moyenne du secteur",
      trend: { direction: "down", changePercent: -1.2, label: "-1,2%", tone: "negative" }
    },
    {
      id: "cash",
      title: "Cash disponible",
      subtitle: "Disponibilités",
      value: 18000,
      status: "medium",
      missingMessage: null,
      benchmarkLabel: "8% inférieur à la moyenne du secteur",
      trend: { direction: "flat", changePercent: 0, label: "Stable", tone: "neutral" }
    }
  ],
  actions: ["Sécuriser la trésorerie hebdomadaire."],
  alerts: [{ id: "a1", label: "BFR élevé", severity: "medium" }],
  fiscalTiles: []
};

const baseKpis: CalculatedKpis = {
  tcam: null,
  va: 450000,
  ebitda: 120000,
  ebe: 25000,
  marge_ebitda: 0.0865,
  charges_var: null,
  mscv: null,
  tmscv: 0.42,
  ca: 125000,
  charges_fixes: null,
  point_mort: 95000,
  ratio_immo: 0.35,
  ratio_immo_usure: null,
  bfr: 85000,
  rot_bfr: 106,
  dso: 45,
  dpo: 52,
  rot_stocks: 30,
  caf: 110000,
  fte: null,
  tn: 35000,
  solvabilite: 0.28,
  gearing: 0.72,
  liq_gen: 1.85,
  liq_red: 1.42,
  liq_imm: 0.35,
  disponibilites: 18000,
  roce: 0.11,
  roe: 0.14,
  effet_levier: 1.27,
  resultat_net: 42000,
  grossMarginRate: null,
  netProfit: null,
  workingCapital: null,
  monthlyBurnRate: null,
  cashRunwayMonths: null,
  capacite_remboursement_annees: 1.8,
  etat_materiel_indice: null,
  healthScore: 72
};

describe("pdfReportModel", () => {
  it("résout correctement les niveaux de score", () => {
    expect(resolveScoreLevel(85)).toBe("excellent");
    expect(resolveScoreLevel(70)).toBe("bon");
    expect(resolveScoreLevel(45)).toBe("fragile");
    expect(resolveScoreLevel(30)).toBe("critique");
    expect(resolveScoreLevel(null)).toBe("na");
  });

  it("construit les 6 sections du rapport avec KPIs complets", () => {
    const data = buildPdfReportData({
      companyName: "Test Corp",
      greetingName: "Romain",
      analysisCreatedAt: "2026-03-23T11:00:00.000Z",
      selectedYearLabel: "2025",
      synthese: baseSynthese,
      kpis: baseKpis
    });

    expect(data.cover.scoreValueLabel).toBe("72 / 100");
    expect(data.cover.pillars).toHaveLength(4);
    expect(data.synthese.heroKpis).toHaveLength(3);
    expect(data.synthese.summaryRows).toHaveLength(5);
    expect(data.valueCreation.items).toHaveLength(6);
    expect(data.investment.items).toHaveLength(6);
    expect(data.financing.items).toHaveLength(8);
    expect(data.profitability.items).toHaveLength(4);
    expect(data.profitability.strengths.length).toBeGreaterThan(0);
    expect(data.profitability.improvements.length).toBeGreaterThan(0);
  });

  it("affiche N/D pour les KPI manquants (sans kpis)", () => {
    const data = buildPdfReportData({
      companyName: "Vyzor",
      greetingName: "Romain",
      analysisCreatedAt: "2026-03-23T11:00:00.000Z",
      selectedYearLabel: "2025",
      synthese: baseSynthese
    });

    expect(data.valueCreation.items[0]?.valueLabel).toBe("N/D");
    expect(data.investment.items[0]?.valueLabel).toBe("N/D");
    expect(data.financing.items[0]?.valueLabel).toBe("N/D");
    expect(data.profitability.items[0]?.valueLabel).toBe("N/D");
  });

  it("génère un PDF 6 pages sans crash", async () => {
    const blob = await renderSyntheseReportBlob(
      {
        companyName: "Vyzor",
        greetingName: "Romain",
        analysisCreatedAt: "2026-03-23T11:00:00.000Z",
        selectedYearLabel: "2025",
        synthese: baseSynthese,
        kpis: baseKpis
      },
      { logoSrc: undefined }
    );

    expect(blob.size).toBeGreaterThan(5000);
    expect(blob.type).toContain("pdf");
  });
});
