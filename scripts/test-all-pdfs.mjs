// scripts/test-all-pdfs.mjs
// Usage : node --import tsx scripts/test-all-pdfs.mjs
// Appelle le pipeline complet (extractFinancialPages → Document AI → analyzeFinancialDocument → KPI)
// sans passer par l'API HTTP (pas besoin d'auth Firebase).

import { readFileSync, existsSync } from "fs";

// Load env
for (const envFile of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(envFile, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      process.env[k] = v;
    }
  } catch {}
}

const { extractFinancialPages } = await import("../services/pdf-analysis/pdfPageExtractor.ts");
const { processPdfWithDocumentAI } = await import("../services/documentAI.ts");
const { analyzeFinancialDocument } = await import("../services/pdfAnalysis.ts");
const { mapParsedFinancialDataToMappedFinancialData } = await import("../services/mapping/parsedFinancialDataBridge.ts");
const { mapToQuantisData } = await import("../services/financialMapping.ts");
const { computeKpis } = await import("../services/kpiEngine.ts");
const { extractWithVision, mergeVisionWithDocumentAI } = await import("../services/pdf-analysis/visionExtractor.ts");

const REFERENCE_VALUES = {
  "AG FRANCE - Comptes sociaux 2024.pdf": {
    ca: 16064535, totalAssets: 8117151, netResult: 1173877
  },
  "BEL AIR FASHION B. AIR - Comptes sociaux 2024.pdf": {
    ca: null, totalAssets: null, netResult: null
  },
  "BI-PLANS - Comptes sociaux 2024.pdf": {
    ca: 752298, totalAssets: 454030, netResult: 24219
  },
  "CREATIONS FUSALP - Comptes sociaux 2025.pdf": {
    ca: 52945837, totalAssets: 68396331, netResult: 177197
  },
  "EURASIA TOURS - Comptes sociaux 2025.pdf": {
    ca: 3439323, totalAssets: 436066, netResult: 31658
  },
  "FIVAL - Comptes sociaux 2024.pdf": {
    ca: 29538, totalAssets: 1096308, netResult: 870432
  },
  "FUTURE PIPE - Comptes sociaux 2018.pdf": {
    ca: 738197, totalAssets: 344316, netResult: 25924
  },
  "LCL LABORATOIRE COSMETIQUE DE LECOUSSE - Comptes sociaux 2023.pdf": {
    ca: 8145093, totalAssets: 7773023, netResult: 659391
  },
  "LXA LAGARDERE X ARTEUM - Comptes sociaux 2024.pdf": {
    ca: 18078362, totalAssets: 10498434, netResult: 657398
  },
  "RIP CURL EUROPE - Comptes sociaux 2025.pdf": {
    ca: 50075143, totalAssets: 66101267, netResult: 1201318
  },
  "SMI MARILLIER INVESTISSEMENTS - Comptes sociaux 2024.pdf": {
    ca: 948636, totalAssets: 26356691, netResult: 392055
  },
  "SRJB SOC DE RESTAURATION JB - Comptes sociaux 2025.pdf": {
    ca: null, totalAssets: null, netResult: null
  },
  "TROISV - Comptes sociaux 2025.pdf": {
    ca: 263118, totalAssets: 174535, netResult: -8700
  },
  "VERACYTE - Comptes sociaux 2024.pdf": {
    ca: 27209281, totalAssets: 27311749, netResult: -19612318
  }
};

// --only=filename pour ne tester qu'un seul PDF
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const onlyFilter = onlyArg ? onlyArg.slice(7) : null;

async function testPdf(filename, index, total) {
  const filePath = `docs/docs-compta/${filename}`;
  const ref = REFERENCE_VALUES[filename] || {};
  const result = {
    filename,
    ca: null,
    totalAssets: null,
    netResult: null,
    equity: null,
    confidenceScore: null,
    kpiFilledCount: null,
    kpiMissingCount: null,
    visionTriggered: false,
    error: null,
    statuses: {}
  };

  if (!existsSync(filePath)) {
    result.error = "FILE NOT FOUND";
    console.log(`❌ PDF ${index}/${total} — ${filename} — FILE NOT FOUND`);
    return result;
  }

  try {
    const pdfBuffer = Buffer.from(readFileSync(filePath));
    const start = Date.now();

    // Step 1: Extract pages
    const extraction = await extractFinancialPages(pdfBuffer);

    // Step 2: Document AI
    const docaiResult = await processPdfWithDocumentAI({
      pdfBuffer: extraction.buffer,
      fileName: filename,
      mimeType: "application/pdf",
      imagelessMode: extraction.imagelessMode
    });

    // Step 3: Analyze
    const analysis = analyzeFinancialDocument(docaiResult);
    const financialData = analysis.parsedFinancialData;

    // Step 3b: Vision LLM fallback — DESACTIVE (credits limites)
    // const useVision = process.env.ANTHROPIC_API_KEY && analysis.diagnostics.confidenceScore < 0.80;
    // if (useVision) {
    //   result.visionTriggered = true;
    //   const visionResult = await extractWithVision(extraction.buffer);
    //   if (visionResult.success && visionResult.data) {
    //     mergeVisionWithDocumentAI(financialData, visionResult.data, analysis.diagnostics.fieldScores);
    //   }
    // }

    // Step 4: Map + KPI
    const mappedData = mapParsedFinancialDataToMappedFinancialData(financialData);
    const kpis = computeKpis(mappedData);
    const quantisData = mapToQuantisData(financialData);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const kpiEntries = Object.entries(kpis);
    const filled = kpiEntries.filter(([, v]) => v !== null).length;
    const missing = kpiEntries.filter(([, v]) => v === null).length;

    result.ca = quantisData.ca;
    result.totalAssets = quantisData.totalAssets;
    result.netResult = quantisData.netResult;
    result.equity = quantisData.equity;
    result.confidenceScore = analysis.diagnostics.confidenceScore;
    result.kpiFilledCount = filled;
    result.kpiMissingCount = missing;

    // Compare with reference
    for (const field of ["ca", "totalAssets", "netResult"]) {
      const expected = ref[field];
      const actual = result[field];
      if (expected === null || expected === undefined) {
        result.statuses[field] = "⚪";
      } else if (actual === expected) {
        result.statuses[field] = "✅";
      } else {
        result.statuses[field] = "❌";
      }
    }

    const caStatus = result.statuses.ca || "⚪";
    const caExpected = ref.ca !== null ? ` (attendu ${ref.ca})` : "";
    const vision = result.visionTriggered ? " [Vision]" : "";
    console.log(
      `${caStatus} PDF ${index}/${total} — ${filename} — ca=${result.ca}${caExpected} — score=${result.confidenceScore} — kpi=${filled}/${filled + missing}${vision} — ${elapsed}s`
    );

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    console.log(`❌ PDF ${index}/${total} — ${filename} — ERREUR: ${result.error}`);
    return result;
  }
}

function printSummary(results) {
  console.log("\n" + "=".repeat(100));
  console.log("RECAPITULATIF");
  console.log("=".repeat(100));
  console.log(
    "Statut".padEnd(6) +
      "Fichier".padEnd(55) +
      "CA".padEnd(14) +
      "TotalAssets".padEnd(14) +
      "NetResult".padEnd(14) +
      "Score".padEnd(8) +
      "KPI"
  );
  console.log("-".repeat(100));

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of results) {
    if (r.error) {
      console.log(`❌     ${r.filename.padEnd(55)}ERREUR: ${r.error}`);
      failed++;
      continue;
    }

    const allRef = REFERENCE_VALUES[r.filename] || {};
    const hasRef = allRef.ca !== null || allRef.totalAssets !== null || allRef.netResult !== null;
    const allMatch =
      (r.statuses.ca === "✅" || r.statuses.ca === "⚪") &&
      (r.statuses.totalAssets === "✅" || r.statuses.totalAssets === "⚪") &&
      (r.statuses.netResult === "✅" || r.statuses.netResult === "⚪");

    const globalStatus = !hasRef ? "⚪" : allMatch ? "✅" : "❌";
    if (globalStatus === "✅") passed++;
    else if (globalStatus === "❌") failed++;
    else skipped++;

    const caStr = r.ca !== null ? String(r.ca) : "null";
    const taStr = r.totalAssets !== null ? String(r.totalAssets) : "null";
    const nrStr = r.netResult !== null ? String(r.netResult) : "null";
    const scoreStr = r.confidenceScore !== null ? r.confidenceScore.toFixed(2) : "null";
    const kpiStr = `${r.kpiFilledCount}/${r.kpiFilledCount + r.kpiMissingCount}`;

    console.log(
      `${globalStatus}     ${r.filename.padEnd(55)}${caStr.padEnd(14)}${taStr.padEnd(14)}${nrStr.padEnd(14)}${scoreStr.padEnd(8)}${kpiStr}`
    );
  }

  console.log("-".repeat(100));
  console.log(`✅ ${passed} passes | ❌ ${failed} echecs | ⚪ ${skipped} sans reference`);
}

async function main() {
  console.log("=== TEST AUTOMATISE TOUS LES PDFs ===\n");

  const entries = Object.entries(REFERENCE_VALUES).filter(([filename]) => {
    if (onlyFilter) return filename.toLowerCase().includes(onlyFilter.toLowerCase());
    return true;
  });

  const results = [];
  for (let i = 0; i < entries.length; i++) {
    const [filename] = entries[i];
    const result = await testPdf(filename, i + 1, entries.length);
    results.push(result);
  }

  printSummary(results);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
