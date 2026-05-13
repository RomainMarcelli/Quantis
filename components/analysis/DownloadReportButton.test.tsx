import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DownloadReportButton } from "@/components/analysis/DownloadReportButton";
import type { DownloadSyntheseReportInput } from "@/lib/synthese/downloadSyntheseReport";

vi.mock("@/lib/synthese/downloadSyntheseReport", () => ({
  downloadSyntheseReport: vi.fn()
}));

const fakeInputGetter = (): DownloadSyntheseReportInput => ({
  companyName: "Vyzor",
  greetingName: "Romain",
  analysisCreatedAt: "2026-04-20T10:00:00.000Z",
  selectedYearLabel: "2025",
  synthese: {
    score: 70,
    scoreLabel: "Solide",
    scorePiliers: { rentabilite: 70, solvabilite: 70, liquidite: 70, efficacite: 70 },
    alerteInvestissement: false,
    metrics: [],
    actions: [],
    alerts: []
  }
});

describe("DownloadReportButton", () => {
  it("rend un bouton disabled avec tooltip quand disabled=true", () => {
    const html = renderToStaticMarkup(
      <DownloadReportButton disabled getDownloadInput={fakeInputGetter} />
    );
    expect(html).toContain('disabled=""');
    expect(html).toContain('title="Aucune analyse disponible"');
    expect(html).toContain("Télécharger le rapport");
  });

  it("rend un bouton actif par défaut avec label complet et aria-label", () => {
    const html = renderToStaticMarkup(
      <DownloadReportButton getDownloadInput={fakeInputGetter} />
    );
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-label="Télécharger le rapport"');
    expect(html).toContain("Télécharger le rapport");
  });

  it("rend le label court 'Rapport' quand size=sm", () => {
    const html = renderToStaticMarkup(
      <DownloadReportButton getDownloadInput={fakeInputGetter} size="sm" />
    );
    expect(html).toContain(">Rapport<");
    expect(html).not.toContain(">Télécharger le rapport<");
  });

  it("applique les classes secondaires par défaut (variant secondary)", () => {
    const html = renderToStaticMarkup(
      <DownloadReportButton getDownloadInput={fakeInputGetter} />
    );
    expect(html).toContain("border-white/25");
    expect(html).toContain("bg-white/5");
    expect(html).toContain("text-white/90");
    expect(html).not.toContain("bg-quantis-gold/10");
  });

  it("applique les classes dorées quand variant=primary", () => {
    const html = renderToStaticMarkup(
      <DownloadReportButton getDownloadInput={fakeInputGetter} variant="primary" />
    );
    expect(html).toContain("border-quantis-gold/30");
    expect(html).toContain("bg-quantis-gold/10");
    expect(html).toContain("text-quantis-gold");
  });

  it("concatène la className custom au bouton", () => {
    const html = renderToStaticMarkup(
      <DownloadReportButton getDownloadInput={fakeInputGetter} className="custom-extra" />
    );
    expect(html).toContain("custom-extra");
  });
});
