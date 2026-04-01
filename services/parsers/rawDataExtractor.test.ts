import { describe, expect, it } from "vitest";
import {
  buildRawDataFromMetrics,
  extractRawDataFromSheetRows,
  mergeRawDataForSheets
} from "@/services/parsers/rawDataExtractor";

describe("rawDataExtractor", () => {
  it("extracts by variable code and line code from tabular sheet rows", () => {
    const rows: unknown[][] = [
      ["Libelle Source", "Code", "Variable Code", "Valeur"],
      ["Total des produits d'expl. (I)", "232", "total_prod_expl", 1000],
      ["Achat de marchandises", "234", "achats_march", 400]
    ];

    const raw = extractRawDataFromSheetRows(rows);

    expect(raw.byVariableCode.total_prod_expl).toBe(1000);
    expect(raw.byVariableCode.achats_march).toBe(400);
    expect(raw.byLineCode["232"]).toBe(1000);
    expect(raw.byLineCode["234"]).toBe(400);
    expect(Object.keys(raw.byLabel).length).toBe(2);
  });

  it("merges raw data from multiple sheets", () => {
    const merged = mergeRawDataForSheets([
      {
        byVariableCode: { total_prod_expl: 1000 },
        byLineCode: { "232": 1000 },
        byLabel: {}
      },
      {
        byVariableCode: { achats_march: 400 },
        byLineCode: { "234": 400 },
        byLabel: {}
      }
    ]);

    expect(merged.byVariableCode.total_prod_expl).toBe(1000);
    expect(merged.byVariableCode.achats_march).toBe(400);
    expect(merged.byLineCode["232"]).toBe(1000);
    expect(merged.byLineCode["234"]).toBe(400);
  });

  it("builds raw data from parser metrics fallback", () => {
    const raw = buildRawDataFromMetrics([
      { key: "revenue", label: "CA", value: 1200, confidence: "high" },
      { key: "treasury", label: "Tresorerie", value: 300, confidence: "medium" }
    ]);

    expect(raw.byVariableCode.total_prod_expl).toBe(1200);
    expect(raw.byVariableCode.dispo).toBe(300);
  });

  it("captures brut/net values when dedicated columns exist", () => {
    const rows: unknown[][] = [
      ["Libelle Source", "Code", "Variable Code", "Brut", "Amort", "Net"],
      ["Total I", "044", "total_actif_immo", 608223.53, 211956.68, 396266.85]
    ];

    const raw = extractRawDataFromSheetRows(rows);

    expect(raw.byVariableCode.total_actif_immo).toBe(396266.85);
    expect(raw.byVariableCode.total_actif_immo_brut).toBe(608223.53);
    expect(raw.byVariableCode.total_actif_immo_net).toBe(396266.85);
    expect(raw.byLineCode["044"]).toBe(396266.85);
  });
});
