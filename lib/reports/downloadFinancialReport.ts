// File: lib/reports/downloadFinancialReport.ts
// Role: helper côté navigateur — POST /api/reports/financial, récupère le PDF
// binaire, déclenche un download via Blob URL. Lit le Content-Disposition pour
// utiliser le nom de fichier proposé par le serveur.

import { firebaseAuthGateway } from "@/services/auth";
import type { CalculatedKpis } from "@/types/analysis";

export type DownloadFinancialReportInput = {
  analysisId: string;
  /**
   * KPIs effectifs côté client (avec overrides Bridge / slider temporalité).
   * Quand fournis, le serveur les utilise au lieu de `analysis.kpis` —
   * garantit la parité score / valeurs entre l'écran et le PDF.
   */
  effectiveKpis?: CalculatedKpis | null;
  /** Format de sortie (PDF par défaut). */
  format?: "pdf" | "docx";
};

export type DownloadFinancialReportError =
  | { kind: "unauthenticated" }
  | { kind: "http"; status: number; message: string }
  | { kind: "network"; message: string };

/**
 * Déclenche le téléchargement du rapport PDF financier 4 pages pour l'analyse
 * donnée. Retourne null en cas de succès, ou un objet d'erreur typé sinon
 * (laisse le caller décider du UX feedback).
 */
export async function downloadFinancialReport(
  input: DownloadFinancialReportInput
): Promise<DownloadFinancialReportError | null> {
  const idToken = await firebaseAuthGateway.getIdToken();
  if (!idToken) return { kind: "unauthenticated" };

  let res: Response;
  try {
    res = await fetch("/api/reports/financial", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        analysisId: input.analysisId,
        effectiveKpis: input.effectiveKpis ?? null,
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
  const fallbackName = `rapport-financier.${input.format ?? "pdf"}`;
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

function parseFilenameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}
