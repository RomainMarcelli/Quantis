// File: lib/synthese/pdfReportModel.test.ts
// Role: valide le mapping du rapport PDF et la génération du document sans crash.

import { describe, expect, it } from "vitest";
import { buildPdfReportData, resolveScoreLevel } from "@/lib/synthese/pdfReportModel";
import { renderSyntheseReportBlob } from "@/lib/synthese/downloadSyntheseReport";
import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";

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
      trend: {
        direction: "up",
        changePercent: 5.2,
        label: "+5,2%",
        tone: "positive"
      }
    },
    {
      id: "ebe",
      title: "Rentabilité opérationnelle",
      subtitle: "EBE",
      value: 25000,
      status: "medium",
      missingMessage: null,
      benchmarkLabel: "3% inférieur à la moyenne du secteur",
      trend: {
        direction: "down",
        changePercent: -1.2,
        label: "-1,2%",
        tone: "negative"
      }
    },
    {
      id: "cash",
      title: "Cash disponible",
      subtitle: "Disponibilités",
      value: 18000,
      status: "medium",
      missingMessage: null,
      benchmarkLabel: "8% inférieur à la moyenne du secteur",
      trend: {
        direction: "flat",
        changePercent: 0,
        label: "Stable",
        tone: "neutral"
      }
    }
  ],
  actions: ["Sécuriser la trésorerie hebdomadaire."],
  alerts: [{ id: "a1", label: "BFR élevé", severity: "medium" }]
};

describe("pdfReportModel", () => {
  it("résout correctement les niveaux de score", () => {
    expect(resolveScoreLevel(85)).toBe("excellent");
    expect(resolveScoreLevel(70)).toBe("bon");
    expect(resolveScoreLevel(52)).toBe("fragile");
    expect(resolveScoreLevel(30)).toBe("critique");
    expect(resolveScoreLevel(null)).toBe("na");
  });

  it("affiche N/A pour les données KPI manquantes", () => {
    const data = buildPdfReportData({
      companyName: "Quantis",
      greetingName: "Romain",
      analysisCreatedAt: "2026-03-23T11:00:00.000Z",
      selectedYearLabel: "Année en cours (2026)",
      synthese: {
        ...baseSynthese,
        metrics: [
          {
            ...baseSynthese.metrics[0],
            value: null,
            trend: { direction: "na", changePercent: null, label: "N/D", tone: "neutral" }
          },
          baseSynthese.metrics[1],
          baseSynthese.metrics[2]
        ]
      }
    });

    expect(data.kpis[0]?.valueLabel).toBe("N/A");
    expect(data.kpis[0]?.trendLabel).toBe("N/D");
  });

  it("génère un PDF sans crash", async () => {
    const blob = await renderSyntheseReportBlob(
      {
        companyName: "Quantis",
        greetingName: "Romain",
        analysisCreatedAt: "2026-03-23T11:00:00.000Z",
        selectedYearLabel: "Année en cours (2026)",
        synthese: baseSynthese
      },
      { logoSrc: undefined }
    );

    expect(blob.size).toBeGreaterThan(5000);
    expect(blob.type).toContain("pdf");
  });
});

