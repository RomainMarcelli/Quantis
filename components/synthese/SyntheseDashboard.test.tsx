// File: components/synthese/SyntheseDashboard.test.tsx
// Role: tests unitaires de rendu de la vue Synthèse (score, KPI, actions, alertes).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SyntheseDashboard } from "@/components/synthese/SyntheseDashboard";
import type { SyntheseViewModel } from "@/lib/synthese/syntheseViewModel";

const sampleSynthese: SyntheseViewModel = {
  score: 74,
  scoreLabel: "Santé globale solide",
  scorePiliers: {
    rentabilite: 78,
    solvabilite: 69,
    liquidite: 72,
    efficacite: 75
  },
  alerteInvestissement: false,
  metrics: [
    {
      id: "ca",
      title: "Chiffre d'affaires",
      subtitle: "Performance commerciale",
      value: 120000,
      status: "good",
      missingMessage: null,
      benchmarkLabel: "20.0% supérieur à la moyenne du secteur",
      trend: { direction: "up", changePercent: 20, label: "+20.0%", tone: "positive" }
    },
    {
      id: "ebe",
      title: "Rentabilité opérationnelle",
      subtitle: "EBE",
      value: 22000,
      status: "medium",
      missingMessage: null,
      benchmarkLabel: "3.0% inférieur à la moyenne du secteur",
      trend: { direction: "down", changePercent: -5, label: "-5.0%", tone: "negative" }
    },
    {
      id: "cash",
      title: "Cash disponible",
      subtitle: "Disponibilités",
      value: 18000,
      status: "medium",
      missingMessage: null,
      benchmarkLabel: "10.0% inférieur à la moyenne du secteur",
      trend: { direction: "flat", changePercent: 0, label: "Stable", tone: "neutral" }
    }
  ],
  actions: ["Sécuriser la trésorerie."],
  alerts: [{ id: "bfr", label: "BFR élevé", severity: "high" }]
};

describe("SyntheseDashboard", () => {
  it("affiche le bloc Quantis Score", () => {
    const html = renderToStaticMarkup(
      <SyntheseDashboard
        greetingName="Romain"
        companyName="Quantis"
        analysisCreatedAt="2026-03-20T10:00:00.000Z"
        selectedYearValue="current"
        yearOptions={[
          { value: "current", label: "Année en cours (2026)" },
          { value: "2025", label: "2025" }
        ]}
        onYearChange={() => {}}
        onDownloadReport={() => {}}
        onReupload={() => {}}
        onManualEntry={() => {}}
        synthese={sampleSynthese}
      />
    );

    expect(html).toContain("Quantis Score");
    expect(html).toContain("74 / 100");
    expect(html).toContain("Santé globale solide");
  });

  it("affiche les trois KPI principaux", () => {
    const html = renderToStaticMarkup(
      <SyntheseDashboard
        greetingName="Romain"
        companyName="Quantis"
        analysisCreatedAt="2026-03-20T10:00:00.000Z"
        selectedYearValue="current"
        yearOptions={[
          { value: "current", label: "Année en cours (2026)" },
          { value: "2025", label: "2025" }
        ]}
        onYearChange={() => {}}
        onDownloadReport={() => {}}
        onReupload={() => {}}
        onManualEntry={() => {}}
        synthese={sampleSynthese}
      />
    );

    expect(html).toContain("Chiffre d&#x27;affaires");
    expect(html).toContain("Rentabilité opérationnelle");
    expect(html).toContain("Cash disponible");
    expect(html).toContain("Année en cours (2026)");
  });

  it("affiche le message de donnée manquante avec actions", () => {
    const syntheseWithMissingMetric: SyntheseViewModel = {
      ...sampleSynthese,
      metrics: [
        {
          id: "ca",
          title: "Chiffre d'affaires",
          subtitle: "Performance commerciale",
          value: null,
          status: "na",
          missingMessage: "Pour visualiser votre chiffre d'affaires, uploader un document complet.",
          benchmarkLabel: "Benchmark indisponible",
          trend: { direction: "na", changePercent: null, label: "N/D", tone: "neutral" }
        },
        sampleSynthese.metrics[1],
        sampleSynthese.metrics[2]
      ]
    };

    const html = renderToStaticMarkup(
      <SyntheseDashboard
        greetingName="Romain"
        companyName="Quantis"
        analysisCreatedAt="2026-03-20T10:00:00.000Z"
        selectedYearValue="current"
        yearOptions={[
          { value: "current", label: "Année en cours (2026)" },
          { value: "2025", label: "2025" }
        ]}
        onYearChange={() => {}}
        onDownloadReport={() => {}}
        onReupload={() => {}}
        onManualEntry={() => {}}
        synthese={syntheseWithMissingMetric}
      />
    );

    expect(html).toContain("uploader un document complet");
    expect(html).toContain("Ré-uploader un fichier");
    expect(html).toContain("Saisie manuelle");
  });
});
