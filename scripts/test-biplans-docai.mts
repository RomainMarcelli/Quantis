import { readFileSync } from "fs";

// Load .env + .env.local manually without dotenv
for (const envFile of [".env", ".env.local"]) {
  try {
    const envContent = readFileSync(envFile, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      process.env[key] = value;
    }
  } catch {}
}

import { extractFinancialPages } from "../services/pdf-analysis/pdfPageExtractor";
import { processPdfWithDocumentAI } from "../services/documentAI";
import { analyzeFinancialDocument } from "../services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "../services/mapping/parsedFinancialDataBridge";
import { mapToQuantisData } from "../services/financialMapping";
import { computeKpis } from "../services/kpiEngine";
import { extractWithVision, mergeVisionWithDocumentAI } from "../services/pdf-analysis/visionExtractor";

const pdfPath = "docs/docs-compta/BI-PLANS - Comptes sociaux 2024.pdf";
const pdfBuffer = Buffer.from(readFileSync(pdfPath));

console.log(`\n[test] PDF loaded: ${pdfPath} (${pdfBuffer.length} bytes)\n`);

// Step 1: Extract financial pages
const extraction = await extractFinancialPages(pdfBuffer);
console.log(`\n[test] extractedPages: ${extraction.extractedPages}`);
console.log(`[test] isScanned: ${extraction.isScanned}`);
console.log(`[test] imagelessMode: ${extraction.imagelessMode}`);

// Step 2: Send to Document AI
console.log(`\n[test] Calling Document AI (imagelessMode: ${extraction.imagelessMode})...`);
const docaiResult = await processPdfWithDocumentAI({
  pdfBuffer: extraction.buffer,
  fileName: "BI-PLANS.pdf",
  mimeType: "application/pdf",
  imagelessMode: extraction.imagelessMode
});
console.log(`[test] Document AI returned ${docaiResult.rawText.length} chars rawText, ${docaiResult.pages.length} pages`);

// Step 3: Analyze
const analysis = analyzeFinancialDocument(docaiResult);
const financialData = analysis.parsedFinancialData;

// Step 3b: Vision LLM fallback
const useVisionFallback =
  process.env.ANTHROPIC_API_KEY &&
  analysis.diagnostics.confidenceScore < 0.80;

console.log(`\n[test] confidenceScore: ${analysis.diagnostics.confidenceScore}`);
console.log(`[test] Vision LLM fallback: ${useVisionFallback ? "OUI" : "NON"}`);

if (useVisionFallback) {
  console.log("[test] Calling Vision LLM...");
  const visionResult = await extractWithVision(extraction.buffer);
  console.log(`[test] Vision LLM: success=${visionResult.success}, pages=${visionResult.pagesAnalyzed}, score=${visionResult.confidenceScore}`);
  if (visionResult.success && visionResult.data) {
    mergeVisionWithDocumentAI(financialData, visionResult.data, analysis.diagnostics.fieldScores);
    console.log("[test] Vision merge applied");
  } else {
    console.log(`[test] Vision LLM failed: ${visionResult.error}`);
  }
}

// Recompute after potential merge
const mappedData = mapParsedFinancialDataToMappedFinancialData(financialData);
const kpis = computeKpis(mappedData);
const quantisData = mapToQuantisData(financialData);

console.log(`\n[test] === principalFinancials ===`);
console.log(`  ca:           ${quantisData.ca}`);
console.log(`  totalCharges: ${financialData.incomeStatement.totalCharges}`);
console.log(`  netResult:    ${financialData.incomeStatement.netResult}`);
console.log(`  totalAssets:  ${financialData.balanceSheet.totalAssets}`);
console.log(`  equity:       ${financialData.balanceSheet.equity}`);
console.log(`  debts:        ${financialData.balanceSheet.debts}`);

console.log(`\n[test] === KPI ===`);
console.log(`  va:      ${kpis.va}`);
console.log(`  ebitda:  ${kpis.ebitda}`);
console.log(`  ebe:     ${kpis.ebe}`);
console.log(`  ca:      ${kpis.ca}`);
console.log(`  bfr:     ${kpis.bfr}`);
console.log(`  caf:     ${kpis.caf}`);
console.log(`  roe:     ${kpis.roe}`);
console.log(`  roce:    ${kpis.roce}`);
const kpiEntries = Object.entries(kpis);
const filled = kpiEntries.filter(([, v]) => v !== null).length;
const missing = kpiEntries.filter(([, v]) => v === null).length;
console.log(`  kpiFilledCount:  ${filled}`);
console.log(`  kpiMissingCount: ${missing}`);

console.log(`\n[test] === Validation ===`);
console.log(`  ca expected 752298:      ${quantisData.ca === 752298 ? "✅" : "❌"} (got ${quantisData.ca})`);
console.log(`  equity expected 233349:  ${financialData.balanceSheet.equity === 233349 ? "✅" : "❌"} (got ${financialData.balanceSheet.equity})`);
console.log(`  va expected 482660:      ${kpis.va === 482660 ? "✅" : "❌"} (got ${kpis.va})`);
console.log(`  ebitda expected 53307:   ${kpis.ebitda === 53307 ? "✅" : "❌"} (got ${kpis.ebitda})`);
