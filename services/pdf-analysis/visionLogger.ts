export type VisionLogEntry = {
  timestamp: string;
  analysisId: string;
  pdfName: string;
  triggered: boolean;
  confidenceScoreBefore: number;
  confidenceScoreAfter?: number;
  pagesAnalyzed?: number;
  model?: string;
  fieldsFilledByVision?: string[];
  tokensInput?: number;
  tokensOutput?: number;
  estimatedCost?: number;
  error?: string;
  errorStack?: string;
  durationMs?: number;
};

const visionLogs: VisionLogEntry[] = [];

export function logVisionCall(entry: VisionLogEntry): void {
  visionLogs.push(entry);
  if (visionLogs.length > 500) {
    visionLogs.splice(0, visionLogs.length - 500);
  }
}

export function getVisionLogs(): VisionLogEntry[] {
  return [...visionLogs];
}

export function clearVisionLogs(): void {
  visionLogs.length = 0;
}

export function formatLogsAsText(): string {
  if (visionLogs.length === 0) return "Aucun log Vision LLM enregistré.\n";

  const lines: string[] = [
    `=== Logs Vision LLM — ${visionLogs.length} entrée(s) ===`,
    ""
  ];

  for (const entry of visionLogs) {
    lines.push(`[${entry.timestamp}] ${entry.pdfName}`);
    lines.push(`  Déclenché: ${entry.triggered ? "OUI" : "NON"}`);
    lines.push(`  Score avant: ${entry.confidenceScoreBefore}`);
    if (entry.confidenceScoreAfter !== undefined) {
      lines.push(`  Score après: ${entry.confidenceScoreAfter}`);
    }
    if (entry.model) lines.push(`  Modèle: ${entry.model}`);
    if (entry.pagesAnalyzed !== undefined) lines.push(`  Pages analysées: ${entry.pagesAnalyzed}`);
    if (entry.fieldsFilledByVision?.length) {
      lines.push(`  Champs remplis: ${entry.fieldsFilledByVision.join(", ")}`);
    }
    if (entry.tokensInput !== undefined || entry.tokensOutput !== undefined) {
      lines.push(`  Tokens: ${entry.tokensInput ?? "?"} in / ${entry.tokensOutput ?? "?"} out`);
    }
    if (entry.estimatedCost !== undefined) {
      lines.push(`  Coût estimé: $${entry.estimatedCost.toFixed(4)}`);
    }
    if (entry.durationMs !== undefined) {
      lines.push(`  Durée: ${(entry.durationMs / 1000).toFixed(1)}s`);
    }
    if (entry.error) {
      lines.push(`  ERREUR: ${entry.error}`);
      if (entry.errorStack) lines.push(`  Stack: ${entry.errorStack.split("\n")[0]}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
