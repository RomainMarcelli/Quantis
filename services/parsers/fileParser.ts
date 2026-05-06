import { parseExcelBuffer } from "@/services/parsers/excelParser";
import { looksLikeFec } from "@/services/parsers/fecParser";
import type { FileDescriptor, ParsedFileData, SupportedUploadType } from "@/types/analysis";

export type UploadedBinaryFile = FileDescriptor & {
  buffer: Buffer;
};

export async function parseUploadedFile(file: UploadedBinaryFile): Promise<ParsedFileData> {
  if (file.type === "excel") {
    return parseExcelBuffer(file.buffer, file.name);
  }

  if (file.type === "fec") {
    // Le FEC ne passe PAS par le pipeline ParsedFileData — il alimente directement
    // les agrégateurs unifiés (pcgAggregator → dailyAccounting + balanceSheetSnapshot)
    // dans `analysisPipeline`. On retourne ici un ParsedFileData minimal pour que la
    // chaîne legacy (mappedData/kpis statique) ne casse pas si on tombe en fallback.
    return {
      fileName: file.name,
      fileType: "fec",
      extractedAt: new Date().toISOString(),
      fiscalYear: null,
      metrics: [],
      previewRows: [],
      rawData: { byVariableCode: {}, byLineCode: {}, byLabel: {} },
    };
  }

  if (file.type === "pdf") {
    try {
      const { parsePdfBuffer } = await import("@/services/parsers/pdfParser");
      return parsePdfBuffer(file.buffer, file.name);
    } catch {
      throw new Error(
        "Le parsing PDF n'est pas disponible dans cet environnement. Merci d'utiliser un fichier Excel."
      );
    }
  }

  throw new Error(`Type de fichier non supporte pour ${file.name}`);
}

/**
 * Détecte le type d'upload. L'extension .csv/.txt déclenche un sniff FEC : si la
 * première ligne contient les en-têtes obligatoires, on classe "fec" — sinon on
 * retombe sur "excel" (qui sait déjà parser un CSV générique).
 */
export function detectSupportedUploadType(
  fileName: string,
  mimeType: string,
  buffer?: Buffer
): SupportedUploadType | null {
  const name = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();

  // Sniff FEC : .txt ou .csv avec en-têtes officiels en première ligne.
  if ((name.endsWith(".txt") || name.endsWith(".csv")) && buffer) {
    const head = buffer.slice(0, 4096).toString("utf8");
    if (looksLikeFec(head)) return "fec";
  }

  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv") ||
    mime.includes("sheet") ||
    mime.includes("excel") ||
    mime.includes("csv")
  ) {
    return "excel";
  }

  if (name.endsWith(".pdf") || mime.includes("pdf")) {
    return "pdf";
  }

  return null;
}
