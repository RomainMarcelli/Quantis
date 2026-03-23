import { parseExcelBuffer } from "@/services/parsers/excelParser";
import type { FileDescriptor, ParsedFileData, SupportedUploadType } from "@/types/analysis";

export type UploadedBinaryFile = FileDescriptor & {
  buffer: Buffer;
};

export async function parseUploadedFile(file: UploadedBinaryFile): Promise<ParsedFileData> {
  if (file.type === "excel") {
    return parseExcelBuffer(file.buffer, file.name);
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

export function detectSupportedUploadType(fileName: string, mimeType: string): SupportedUploadType | null {
  const name = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();

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
