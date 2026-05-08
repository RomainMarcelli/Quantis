// File: services/reports/financialReportPdf.ts
// Role: orchestre la génération d'un rapport (PDF ou Word) financier
// modulaire. Le payload (synthèse 8 pages OU dashboard dynamique) est
// sérialisé en JSON et envoyé sur stdin à un script Python — le binaire
// (PDF ou DOCX) arrive sur stdout.
//
// Format = "pdf" → financial_report.py (reportlab)
// Format = "docx" → financial_report_docx.py (python-docx)

import { spawn } from "node:child_process";
import path from "node:path";
import type { AnalysisRecord } from "@/types/analysis";
import {
  buildSyntheseReportPayload,
  type CompanyInfo,
  type SyntheseReportPayload,
} from "@/services/reports/buildSyntheseReportPayload";
import type { DashboardLayout } from "@/types/dashboard";

export type ReportFormat = "pdf" | "docx";

const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const SCRIPT_PDF = path.join(process.cwd(), "services", "reports", "python", "financial_report.py");
const SCRIPT_DOCX = path.join(process.cwd(), "services", "reports", "python", "financial_report_docx.py");
const LOGO_PATH = path.join(process.cwd(), "public", "images", "LogoV3.png");
const SUBPROCESS_TIMEOUT_MS = 30_000;

export const REPORT_MIME: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const REPORT_EXTENSION: Record<ReportFormat, string> = {
  pdf: "pdf",
  docx: "docx",
};

// ─── Spawn Python ───────────────────────────────────────────────────────────

function runPython(payload: object, format: ReportFormat): Promise<Buffer> {
  const scriptPath = format === "docx" ? SCRIPT_DOCX : SCRIPT_PDF;
  // Magic bytes pour valider la sortie : %PDF- pour PDF, PK\x03\x04 (zip) pour DOCX.
  const expectedMagic = format === "docx" ? "PK\x03\x04" : "%PDF-";

  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, [scriptPath], { stdio: ["pipe", "pipe", "pipe"] });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Python report generation timed out after ${SUBPROCESS_TIMEOUT_MS}ms`));
    }, SUBPROCESS_TIMEOUT_MS);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn ${PYTHON_BIN}: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        reject(new Error(`Python report process exited with code ${code}. Stderr: ${stderr.slice(0, 800)}`));
        return;
      }
      const buf = Buffer.concat(stdoutChunks);
      if (buf.length === 0) {
        reject(new Error("Python produced no output"));
        return;
      }
      if (buf.slice(0, expectedMagic.length).toString("binary") !== expectedMagic) {
        reject(new Error(`Python output does not match expected ${format} magic. Stderr: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve(buf);
    });

    proc.stdin.write(JSON.stringify(payload), "utf8");
    proc.stdin.end();
  });
}

// ─── API publique ───────────────────────────────────────────────────────────

export type GenerateOptions = {
  companyName: string;
  companyInfo?: CompanyInfo;
  /** Layout synthèse de l'utilisateur — pour reproduire ses widgets KPI dans
   *  la grille "Indicateurs clés" du rapport. Null = layout par défaut. */
  syntheseLayout?: DashboardLayout | null;
  /** Format de sortie (PDF par défaut). */
  format?: ReportFormat;
};

/**
 * Génère le rapport mode "synthèse" (8 pages fixes), au format PDF ou DOCX.
 */
export async function generateFinancialReportPdf(
  analysis: AnalysisRecord,
  options: GenerateOptions
): Promise<{ buffer: Buffer; format: ReportFormat }> {
  const format: ReportFormat = options.format ?? "pdf";
  const payload: SyntheseReportPayload = buildSyntheseReportPayload(analysis, {
    companyName: options.companyName,
    logoPath: LOGO_PATH,
    companyInfo: options.companyInfo,
    syntheseLayout: options.syntheseLayout ?? null,
  });
  const buffer = await runPython(payload, format);
  return { buffer, format };
}

/**
 * Génère le rapport mode "dashboard" — cover + sommaire + une section
 * par tableau de bord sélectionné. Le payload est construit à part par
 * l'appelant (le service ne connaît pas le format des widgets).
 */
export async function generateDashboardReportPdf(
  payload: object,
  format: ReportFormat = "pdf",
): Promise<{ buffer: Buffer; format: ReportFormat }> {
  const buffer = await runPython(payload, format);
  return { buffer, format };
}

/** Nom de fichier suggéré : rapport-financier-YYYY-MM.{pdf|docx}. */
export function suggestReportFilename(analysis: AnalysisRecord, format: ReportFormat = "pdf"): string {
  const meta = analysis.sourceMetadata;
  const ref = meta?.periodEnd ?? analysis.createdAt;
  const ext = REPORT_EXTENSION[format];
  const d = new Date(ref);
  if (Number.isNaN(d.getTime())) return `rapport-financier.${ext}`;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `rapport-financier-${yyyy}-${mm}.${ext}`;
}
