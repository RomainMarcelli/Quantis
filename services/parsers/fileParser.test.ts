import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/parsers/excelParser", () => ({
  parseExcelBuffer: vi.fn()
}));

vi.mock("@/services/parsers/pdfParser", () => ({
  parsePdfBuffer: vi.fn()
}));

import { parseExcelBuffer } from "@/services/parsers/excelParser";
import { parsePdfBuffer } from "@/services/parsers/pdfParser";
import { detectSupportedUploadType, parseUploadedFile } from "@/services/parsers/fileParser";

describe("parseUploadedFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates excel files to parseExcelBuffer", async () => {
    vi.mocked(parseExcelBuffer).mockReturnValue({
      fileName: "balance.xlsx",
      fileType: "excel",
      extractedAt: "2026-03-19T10:00:00.000Z",
      fiscalYear: 2024,
      metrics: [],
      previewRows: [],
      rawData: {
        byVariableCode: {},
        byLineCode: {},
        byLabel: {}
      }
    });

    const result = await parseUploadedFile({
      name: "balance.xlsx",
      mimeType: "application/vnd.ms-excel",
      size: 1024,
      type: "excel",
      buffer: Buffer.from("excel")
    });

    expect(parseExcelBuffer).toHaveBeenCalledWith(expect.any(Buffer), "balance.xlsx");
    expect(result.fileType).toBe("excel");
  });

  it("delegates pdf files to parsePdfBuffer", async () => {
    vi.mocked(parsePdfBuffer).mockResolvedValue({
      fileName: "report.pdf",
      fileType: "pdf",
      extractedAt: "2026-03-19T10:00:00.000Z",
      fiscalYear: 2024,
      metrics: [],
      previewRows: [],
      rawData: {
        byVariableCode: {},
        byLineCode: {},
        byLabel: {}
      }
    });

    const result = await parseUploadedFile({
      name: "report.pdf",
      mimeType: "application/pdf",
      size: 1024,
      type: "pdf",
      buffer: Buffer.from("pdf")
    });

    expect(parsePdfBuffer).toHaveBeenCalledWith(expect.any(Buffer), "report.pdf");
    expect(result.fileType).toBe("pdf");
  });

  it("throws for unsupported file type", async () => {
    await expect(
      parseUploadedFile({
        name: "unknown.txt",
        mimeType: "text/plain",
        size: 10,
        type: "txt" as never,
        buffer: Buffer.from("txt")
      })
    ).rejects.toThrow("Type de fichier non supporte pour unknown.txt");
  });
});

describe("detectSupportedUploadType", () => {
  it("detects excel files", () => {
    expect(detectSupportedUploadType("balance.xlsx", "application/vnd.ms-excel")).toBe("excel");
    expect(detectSupportedUploadType("export.csv", "text/csv")).toBe("excel");
  });

  it("detects pdf files", () => {
    expect(detectSupportedUploadType("report.pdf", "application/pdf")).toBe("pdf");
  });

  it("returns null for unsupported formats", () => {
    expect(detectSupportedUploadType("photo.png", "image/png")).toBeNull();
  });

  it("detects FEC files via header sniff (.txt extension + FEC headers)", () => {
    const fecHeader =
      "JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise\n";
    expect(detectSupportedUploadType("export.txt", "text/plain", Buffer.from(fecHeader))).toBe("fec");
    expect(detectSupportedUploadType("export.csv", "text/csv", Buffer.from(fecHeader))).toBe("fec");
  });

  it("falls back to excel for .csv without FEC headers", () => {
    const generic = Buffer.from("date,libelle,montant\n2026-01-01,test,100");
    expect(detectSupportedUploadType("export.csv", "text/csv", generic)).toBe("excel");
  });

  it("returns null for .txt without FEC headers (no buffer or non-FEC content)", () => {
    expect(detectSupportedUploadType("notes.txt", "text/plain")).toBeNull();
    expect(detectSupportedUploadType("notes.txt", "text/plain", Buffer.from("Hello world"))).toBeNull();
  });
});
