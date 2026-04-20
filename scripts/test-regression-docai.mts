import { readFileSync } from "fs";

const envContent = readFileSync(".env", "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

import { extractFinancialPages } from "../services/pdf-analysis/pdfPageExtractor";
import { processPdfWithDocumentAI } from "../services/documentAI";
import { analyzeFinancialDocument } from "../services/pdfAnalysis";
import { mapToQuantisData } from "../services/financialMapping";

const pdfs = [
  { name: "AG FRANCE", file: "docs/docs-compta/AG FRANCE - Comptes sociaux 2024.pdf" },
  { name: "BEL AIR", file: "docs/docs-compta/BEL AIR FASHION B. AIR - Comptes sociaux 2024réduis.pdf" },
  { name: "TROIS V", file: "docs/docs-compta/TROISV - Comptes sociaux 2025.pdf" },
];

for (const pdf of pdfs) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[test] ${pdf.name}`);
  console.log(`${"=".repeat(60)}`);

  const pdfBuffer = Buffer.from(readFileSync(pdf.file));
  console.log(`[test] PDF loaded: ${pdfBuffer.length} bytes`);

  const extraction = await extractFinancialPages(pdfBuffer);
  console.log(`[test] extractedPages: ${extraction.extractedPages}, isScanned: ${extraction.isScanned}, imagelessMode: ${extraction.imagelessMode}`);

  const docaiResult = await processPdfWithDocumentAI({
    pdfBuffer: extraction.buffer,
    fileName: pdf.name + ".pdf",
    mimeType: "application/pdf",
    imagelessMode: extraction.imagelessMode
  });
  console.log(`[test] Document AI: ${docaiResult.rawText.length} chars, ${docaiResult.pages.length} pages, ${(docaiResult as any).tables?.length ?? 0} tables`);

  const analysis = analyzeFinancialDocument(docaiResult);
  const financialData = analysis.parsedFinancialData;
  const quantisData = mapToQuantisData(financialData);

  console.log(`\n[test] === principalFinancials ===`);
  console.log(`  ca:           ${quantisData.ca}`);
  console.log(`  totalCharges: ${financialData.incomeStatement.totalCharges}`);
  console.log(`  netResult:    ${financialData.incomeStatement.netResult}`);
  console.log(`  totalAssets:  ${financialData.balanceSheet.totalAssets}`);
  console.log(`  equity:       ${financialData.balanceSheet.equity}`);
  console.log(`  debts:        ${financialData.balanceSheet.debts}`);
  console.log(`  confidenceScore: ${analysis.diagnostics.confidenceScore}`);
}
