import { describe, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { analyzeFinancialDocument } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { computeKpis } from "@/services/kpiEngine";

describe("live priority fields debug", () => {
  it("inspects latest live analyses for priority null fields", async () => {
    loadDotEnvFile(".env");
    loadDotEnvFile(".env.local");

    const db = getFirebaseAdminFirestore();
    const users = await db.collection("users").limit(30).get();
    const rows: Array<{
      path: string;
      userId: string;
      createdAt: string;
      fileHint: string | null;
      confidenceScore: number | null;
      mapped: Record<string, number | null>;
      kpis: Record<string, number | null>;
      rawText: string;
    }> = [];

    for (const userDoc of users.docs) {
      const analyses = await userDoc.ref.collection("analyses").orderBy("createdAt", "desc").limit(5).get();
      for (const analysisDoc of analyses.docs) {
        const data = analysisDoc.data() as Record<string, any>;
        const mapped = (data.rawData?.mappedData ?? {}) as Record<string, number | null>;
        const kpis = (data.rawData?.kpis ?? {}) as Record<string, number | null>;
        const rawText = typeof data.rawData?.rawText === "string" ? data.rawData.rawText : "";
        rows.push({
          path: analysisDoc.ref.path,
          userId: userDoc.id,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? "",
          fileHint: extractFileHint(rawText),
          confidenceScore: typeof data.rawData?.confidenceScore === "number" ? data.rawData.confidenceScore : null,
          mapped: {
            dettes_fisc_soc: toNumber(mapped.dettes_fisc_soc),
            ace: toNumber(mapped.ace),
            autres_creances: toNumber(mapped.autres_creances),
            total_actif_circ: toNumber(mapped.total_actif_circ),
            total_actif_immo: toNumber(mapped.total_actif_immo)
          },
          kpis: {
            bfr: toNumber(kpis.bfr),
            workingCapital: toNumber(kpis.workingCapital),
            dpo: toNumber(kpis.dpo),
            ratio_immo: toNumber(kpis.ratio_immo)
          },
          rawText
        });
      }
    }

    const sorted = rows
      .filter((row) => row.createdAt.length > 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    console.log("analysisCount", sorted.length);
    console.log(
      "latestSnapshots",
      JSON.stringify(
        sorted.slice(0, 5).map((row) => ({
          path: row.path,
          userId: row.userId,
          createdAt: row.createdAt,
          fileHint: row.fileHint,
          confidenceScore: row.confidenceScore,
          mapped: row.mapped,
          kpis: row.kpis
        })),
        null,
        2
      )
    );

    const latest = sorted[0];
    if (!latest || !latest.rawText) {
      console.log("no_latest_analysis_or_raw_text");
      return;
    }

    const rerun = analyzeFinancialDocument({
      rawText: latest.rawText,
      pages: [],
      tables: []
    });
    const rerunMapped = mapParsedFinancialDataToMappedFinancialData(rerun.parsedFinancialData);
    const rerunKpis = computeKpis(rerunMapped);

    const traceTargets = new Set([
      "taxSocialPayables",
      "externalCharges",
      "otherReceivables",
      "totalCurrentAssets",
      "totalFixedAssets"
    ]);

    console.log(
      "latestRerunSummary",
      JSON.stringify(
        {
          path: latest.path,
          createdAt: latest.createdAt,
          mapped: {
            dettes_fisc_soc: rerunMapped.dettes_fisc_soc,
            ace: rerunMapped.ace,
            autres_creances: rerunMapped.autres_creances,
            total_actif_circ: rerunMapped.total_actif_circ,
            total_actif_immo: rerunMapped.total_actif_immo
          },
          kpis: {
            bfr: rerunKpis.bfr,
            workingCapital: rerunKpis.workingCapital,
            dpo: rerunKpis.dpo,
            ratio_immo: rerunKpis.ratio_immo
          },
          fieldScores: {
            taxSocialPayables: rerun.diagnostics.fieldScores.taxSocialPayables ?? null,
            externalCharges: rerun.diagnostics.fieldScores.externalCharges ?? null,
            otherReceivables: rerun.diagnostics.fieldScores.otherReceivables ?? null,
            totalCurrentAssets: rerun.diagnostics.fieldScores.totalCurrentAssets ?? null,
            totalFixedAssets: rerun.diagnostics.fieldScores.totalFixedAssets ?? null
          },
          traces: rerun.traces
            .filter((trace) => traceTargets.has(trace.field))
            .map((trace) => ({
              field: trace.field,
              selected: trace.selected,
              alternatives: trace.alternatives.slice(0, 3)
            })),
          rowCandidates: rerun.rows
            .filter((row) => {
              const label = row.normalizedLabel;
              return (
                label.includes("charges externes") ||
                label.includes("dettes fiscales") ||
                label.includes("autres creances") ||
                label.includes("total ii") ||
                label.includes("actif circulant") ||
                label.includes("total i") ||
                label.includes("actif immobilise") ||
                (row.lineCode !== null && ["242", "172", "072", "096", "044"].includes(row.lineCode))
              );
            })
            .slice(0, 30)
            .map((row) => ({
              page: row.page,
              rowNumber: row.rowNumber,
              section: row.section,
              label: row.label,
              normalizedLabel: row.normalizedLabel,
              lineCode: row.lineCode,
              amounts: row.amountCandidates.map((candidate) => candidate.value)
            })),
          expectedLineCodesPresence: ["242", "172", "072", "096", "044"].map((lineCode) => ({
            lineCode,
            matches: rerun.rows
              .filter((row) => row.lineCode === lineCode)
              .slice(0, 5)
              .map((row) => ({
                rowNumber: row.rowNumber,
                label: row.label,
                amounts: row.amountCandidates.map((candidate) => candidate.value)
              }))
          })),
          totalRowsWithAmounts: rerun.rows
            .filter((row) => row.normalizedLabel.includes("total") && row.amountCandidates.length > 0)
            .slice(0, 20)
            .map((row) => ({
              rowNumber: row.rowNumber,
              label: row.label,
              lineCode: row.lineCode,
              amounts: row.amountCandidates.map((candidate) => candidate.value)
            })),
          liabilitiesWindow: rerun.rows
            .filter((row) => row.rowNumber >= 220 && row.rowNumber <= 242)
            .map((row) => ({
              rowNumber: row.rowNumber,
              label: row.label,
              normalizedLabel: row.normalizedLabel,
              lineCode: row.lineCode,
              amounts: row.amountCandidates.map((candidate) => candidate.value)
            }))
        },
        null,
        2
      )
    );
  });
});

function loadDotEnvFile(fileName: string) {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, "utf8");
  const lines = content.split(/\r?\n/g);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const index = trimmed.indexOf("=");
    if (index <= 0) {
      return;
    }

    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    if (!key || process.env[key]) {
      return;
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  });
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractFileHint(rawText: string): string | null {
  if (!rawText) {
    return null;
  }

  const first = rawText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return first ?? null;
}
