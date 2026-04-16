import { readFileSync } from "fs";
import { extractFinancialPages } from "../services/pdf-analysis/pdfPageExtractor";

const pdfPath = "docs/docs-compta/BI-PLANS - Comptes sociaux 2024.pdf";
const pdfBuffer = Buffer.from(readFileSync(pdfPath));

console.log(`\n[test] PDF loaded: ${pdfPath} (${pdfBuffer.length} bytes)\n`);

const result = await extractFinancialPages(pdfBuffer);

console.log(`\n[test] === RESULT ===`);
console.log(`[test] originalPages: ${result.originalPages}`);
console.log(`[test] extractedPages: ${result.extractedPages}`);
console.log(`[test] isScanned: ${result.isScanned}`);
console.log(`[test] imagelessMode: ${result.imagelessMode}`);
console.log(`[test] reducedPdfSize: ${result.buffer.length} bytes`);
