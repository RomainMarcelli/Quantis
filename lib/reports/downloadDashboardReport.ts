// File: lib/reports/downloadDashboardReport.ts
// Role: helper côté navigateur pour le rapport PDF mode "dashboard".
// POST /api/reports/dashboard avec analysisId + liste de dashboardIds,
// déclenche un download du PDF.

import { firebaseAuthGateway } from "@/services/auth";
import type { CalculatedKpis } from "@/types/analysis";

export type DownloadDashboardReportInput = {
  analysisId: string;
  dashboardIds: string[];
  /** Format de sortie (PDF par défaut). */
  format?: "pdf" | "docx";
  /** KPIs effectifs côté client — pour parité écran ↔ rapport. */
  effectiveKpis?: CalculatedKpis | null;
};

export type DownloadDashboardReportError =
  | { kind: "unauthenticated" }
  | { kind: "http"; status: number; message: string }
  | { kind: "network"; message: string };

export async function downloadDashboardReport(
  input: DownloadDashboardReportInput
): Promise<DownloadDashboardReportError | null> {
  const idToken = await firebaseAuthGateway.getIdToken();
  if (!idToken) return { kind: "unauthenticated" };

  let res: Response;
  try {
    res = await fetch("/api/reports/dashboard", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        analysisId: input.analysisId,
        dashboardIds: input.dashboardIds,
        format: input.format ?? "pdf",
        effectiveKpis: input.effectiveKpis ?? null,
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
      // ignore
    }
    return { kind: "http", status: res.status, message: detail };
  }

  const blob = await res.blob();
  const fallbackName = `rapport-tableau-de-bord.${input.format ?? "pdf"}`;
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
