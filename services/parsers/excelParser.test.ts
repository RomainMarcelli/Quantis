import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseExcelBuffer } from "@/services/parsers/excelParser";

function buildWorkbookBuffer(rows: Record<string, unknown>[]): Buffer {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseExcelBuffer", () => {
  it("parses an excel file and infers fiscal year", () => {
    const buffer = buildWorkbookBuffer([
      { poste: "Exercice 2024", montant: null },
      { poste: "Chiffre d'affaires", montant: "3 500 000" },
      { poste: "Charges", montant: "2 100 000" },
      { poste: "Tresorerie", montant: "145 000" }
    ]);

    const result = parseExcelBuffer(buffer, "balance.xlsx");

    expect(result.fileName).toBe("balance.xlsx");
    expect(result.fileType).toBe("excel");
    expect(result.fiscalYear).toBe(2024);
    expect(result.metrics.some((metric) => metric.key === "revenue" && metric.value === 3500000)).toBe(
      true
    );
    expect(result.previewRows.length).toBeGreaterThan(0);
    expect(Object.keys(result.rawData.byLabel).length).toBeGreaterThan(0);
  });

  it("returns a fallback preview row when sheet has no data rows", () => {
    const buffer = buildWorkbookBuffer([]);

    const result = parseExcelBuffer(buffer, "empty.xlsx");

    expect(result.fileName).toBe("empty.xlsx");
    expect(result.fileType).toBe("excel");
    expect(result.fiscalYear).toBeNull();
    expect(result.previewRows).toHaveLength(1);
    expect(result.previewRows[0]).toEqual({
      revenue: 0,
      expenses: 0,
      payroll: 0,
      treasury: 0,
      receivables: 0,
      payables: 0,
      inventory: 0
    });
    expect(result.rawData).toEqual({
      byVariableCode: {},
      byLineCode: {},
      byLabel: {}
    });
  });

  it("falls back to file name to infer fiscal year when workbook text has no year", () => {
    const buffer = buildWorkbookBuffer([
      { poste: "Chiffre d'affaires", montant: "1 000 000" }
    ]);

    const result = parseExcelBuffer(buffer, "Quantis_Full_Liasse_31-12-2025.xlsx");

    expect(result.fiscalYear).toBe(2025);
  });

  it("infers fiscal year when the year is carried by column headers", () => {
    const buffer = buildWorkbookBuffer([
      {
        "Exercice N clos le 31/12/2025": "Libellé Source",
        "__EMPTY_1": "Variable Code",
        "__EMPTY_2": "Brut",
        "__EMPTY_3": "Amort",
        "__EMPTY_4": "Net"
      },
      {
        "Exercice N clos le 31/12/2025": "Total I",
        "__EMPTY_1": "total_actif_immo",
        "__EMPTY_2": 608223.53,
        "__EMPTY_3": 211956.68,
        "__EMPTY_4": 396266.85
      }
    ]);

    const result = parseExcelBuffer(buffer, "liasse.xlsx");

    expect(result.fiscalYear).toBe(2025);
  });
});
