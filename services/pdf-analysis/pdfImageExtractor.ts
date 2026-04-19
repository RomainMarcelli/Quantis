import { PDFDocument } from "pdf-lib";

export function selectFinancialPageIndices(
  totalPages: number,
  maxPages: number = 6
): number[] {
  if (totalPages <= maxPages) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const start = Math.max(1, Math.floor(totalPages * 0.10));
  const end = Math.min(totalPages, start + maxPages);
  return Array.from({ length: end - start }, (_, i) => start + i);
}

export async function buildReducedPdfForVision(
  pdfBuffer: Buffer,
  maxPages: number = 6
): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = srcDoc.getPageCount();
  const indices = selectFinancialPageIndices(totalPages, maxPages);

  if (indices.length === totalPages) return pdfBuffer;

  const newDoc = await PDFDocument.create();
  const copied = await newDoc.copyPages(srcDoc, indices);
  for (const page of copied) {
    newDoc.addPage(page);
  }

  console.log(`[VisionImages] PDF ${totalPages}p → ${indices.length}p (pages ${indices[0]! + 1}-${indices[indices.length - 1]! + 1})`);
  return Buffer.from(await newDoc.save());
}
