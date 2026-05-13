// File: lib/reports/downloadStatementReport.ts
// Role: helper côté navigateur — POST /api/reports/statement, récupère
// le PDF / Word binaire, déclenche un download via Blob URL. Variante
// allégée de `downloadFinancialReport` : ne génère que cover + sommaire +
// l'état financier sélectionné (bilan ou compte de résultat), pas la
// synthèse Vyzor ni les pages d'analyse.

import { firebaseAuthGateway } from "@/services/auth";
import type { MappedFinancialData } from "@/types/analysis";

export type StatementKind = "bilan" | "cdr";

export type DownloadStatementReportInput = {
  analysisId: string;
  kind: StatementKind;
  /** Données mappées effectives (recomputées sur la période sélectionnée).
   *  Quand fournies, le serveur les utilise au lieu de `analysis.mappedData` —
   *  garantit que l'export reflète la TemporalityBar / sélecteur d'année. */
  effectiveMappedData?: MappedFinancialData | null;
  format?: "pdf" | "docx";
};

export type DownloadStatementReportError =
  | { kind: "unauthenticated" }
  | { kind: "http"; status: number; message: string }
  | { kind: "network"; message: string };

export async function downloadStatementReport(
  input: DownloadStatementReportInput,
): Promise<DownloadStatementReportError | null> {
  const idToken = await firebaseAuthGateway.getIdToken();
  if (!idToken) return { kind: "unauthenticated" };

  let res: Response;
  try {
    res = await fetch("/api/reports/statement", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        analysisId: input.analysisId,
        kind: input.kind,
        effectiveMappedData: input.effectiveMappedData ?? null,
        format: input.format ?? "pdf",
      }),
    });
  } catch (err) {
    return { kind: "network", message: err instanceof Error ? err.message : "unknown" };
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string; detail?: string };
      detail = data.detail ?? data.error ?? detail;
    } catch {
      // ignore — réponse non-JSON
    }
    return { kind: "http", status: res.status, message: detail };
  }

  const blob = await res.blob();
  const fallbackName = input.kind === "bilan"
    ? `rapport-bilan.${input.format ?? "pdf"}`
    : `rapport-compte-de-resultat.${input.format ?? "pdf"}`;
  const filename = parseFilenameFromContentDisposition(res.headers.get("Content-Disposition"))
    ?? fallbackName;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return null;
}

function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match?.[1] ?? null;
}
