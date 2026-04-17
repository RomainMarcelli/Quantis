import type { AnalysisRecord } from "@/types/analysis";

export function exportAnalysisDataAsJson(input: {
  analysis: AnalysisRecord;
  companyName: string;
}): void {
  const { analysis, companyName } = input;

  const score = analysis.quantisScore;
  const level =
    score && score.quantis_score >= 80
      ? "Excellent"
      : score && score.quantis_score >= 65
        ? "Bon"
        : score && score.quantis_score >= 50
          ? "Fragile"
          : "Critique";

  const payload = {
    analysisId: analysis.id,
    generatedAt: new Date().toISOString(),
    entreprise: companyName,
    fiscalYear: analysis.fiscalYear,
    principalFinancials: {
      ca: analysis.kpis.ca,
      totalAssets: analysis.mappedData.total_actif,
      netResult: analysis.kpis.resultat_net,
      equity: analysis.mappedData.total_cp,
      debts: analysis.mappedData.total_dettes
    },
    mappedData: analysis.mappedData,
    kpis: analysis.kpis,
    quantisScore: score
      ? {
          score: score.quantis_score,
          level,
          piliers: score.piliers
        }
      : null
  };

  const sanitized = companyName
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `quantis-data-${sanitized}-${date}.json`;

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
