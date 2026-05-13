import { describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import { analyzeFinancialDocument } from "@/services/pdfAnalysis";
import { mapToVyzorData } from "@/services/financialMapping";

describe("live parser debug", () => {
  it("prints latest suspicious analyses", async () => {
    loadDotEnv();
    const db = getFirebaseAdminFirestore();
    const users = await db.collection("users").limit(30).get();
    const rows: Array<{
      path: string;
      createdAt: string | null;
      quantisData: Record<string, any> | null;
      warnings: string[];
      confidenceScore: number | null;
      rawTextLength: number | null;
      financialData: Record<string, any> | null;
    }> = [];

    for (const userDoc of users.docs) {
      const analyses = await userDoc.ref.collection("analyses").orderBy("createdAt", "desc").limit(5).get();
      analyses.docs.forEach((doc) => {
        const data = doc.data() as Record<string, any>;
        rows.push({
          path: doc.ref.path,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
          quantisData: data.quantisData ?? null,
          warnings: data.rawData?.warnings ?? [],
          confidenceScore: data.rawData?.confidenceScore ?? null,
          rawTextLength: typeof data.rawData?.rawText === "string" ? data.rawData.rawText.length : null,
          financialData: data.rawData?.financialData ?? null
        });
      });
    }

    const suspicious = rows.filter((row) => {
      const ca = row.quantisData?.ca;
      return ca === 2614 || row.confidenceScore !== null && row.confidenceScore < 0.2;
    });

    console.log("latestRowsCount", rows.length);
    console.log("suspiciousCount", suspicious.length);
    console.log(JSON.stringify(suspicious.slice(0, 5), null, 2));

    for (const entry of suspicious.slice(0, 2)) {
      const snapshot = await db.doc(entry.path).get();
      const data = snapshot.data() as Record<string, any> | undefined;
      const rawText = typeof data?.rawData?.rawText === "string" ? data.rawData.rawText : "";
      if (!rawText) {
        continue;
      }

      const rerun = analyzeFinancialDocument({
        rawText,
        pages: [],
        tables: []
      });
      const rerunQuantis = mapToVyzorData(rerun.parsedFinancialData);
      const targetFields = new Set([
        "netTurnover",
        "totalOperatingCharges",
        "totalProducts",
        "totalCharges",
        "netResult",
        "totalAssets",
        "equity",
        "debts"
      ]);

      console.log("rerunPath", entry.path);
      const lines = rawText
        .split(/\r?\n/g)
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
      console.log("rawTextStats", {
        length: rawText.length,
        lines: lines.length,
        firstLines: lines.slice(0, 12)
      });
      console.log(
        "keywordContexts",
        JSON.stringify(extractKeywordContexts(lines), null, 2)
      );
      console.log(
        "rerunSummary",
        JSON.stringify(
          {
            parserVersion: "analysis-engine-v2",
            quantisData: rerunQuantis,
            confidenceScore: rerun.diagnostics.confidenceScore,
            warnings: rerun.diagnostics.warnings,
            fieldScores: rerun.diagnostics.fieldScores
          },
          null,
          2
        )
      );

      const traceSlice = rerun.traces
        .filter((trace) => targetFields.has(trace.field))
        .map((trace) => ({
          field: trace.field,
          selected: trace.selected,
          alternatives: trace.alternatives.slice(0, 3)
        }));

      console.log("rerunTraces", JSON.stringify(traceSlice, null, 2));
      console.log(
        "rerunTotalRows",
        JSON.stringify(
          rerun.rows
            .filter((row) => {
              const normalized = row.normalizedLabel;
              return normalized.includes("total (1)") || normalized.includes("total (iv)") ||
                normalized.includes("capitaux propres") || normalized.includes("emprunts et dettes");
            })
            .slice(0, 20)
            .map((row) => ({
              page: row.page,
              rowNumber: row.rowNumber,
              section: row.section,
              label: row.label,
              normalizedLabel: row.normalizedLabel,
              amounts: row.amountCandidates.map((candidate) => candidate.value)
            })),
          null,
          2
        )
      );
    }
  });
});

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  const content = readFileSync(path, "utf8");
  const lines = content.split(/\r?\n/g);

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) {
      return;
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  });
}

function extractKeywordContexts(lines: string[]) {
  const contexts: Array<{ index: number; line: string; next?: string; next2?: string }> = [];
  const keywordPattern =
    /\b(chiffre|affaires|ventes|production|resultat|charges|produits|capitaux|dettes|actif|passif|total)\b/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!keywordPattern.test(line)) {
      continue;
    }

    contexts.push({
      index: index + 1,
      line,
      next: lines[index + 1],
      next2: lines[index + 2]
    });

    if (contexts.length >= 60) {
      break;
    }
  }

  return contexts;
}
