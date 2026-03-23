import { describe, expect, it } from "vitest";
import {
  applyLegacyFinancialFactsToMappedData,
  createEmptyMappedFinancialData,
  createEmptyRawAnalysisData,
  mapMappedDataToFinancialFacts,
  mapRawDataToMappedFinancialData,
  mergeRawAnalysisData
} from "@/services/mapping/financialDataMapper";

describe("financialDataMapper", () => {
  it("maps raw data by variable and line codes then applies transformations", () => {
    const rawData = {
      byVariableCode: {
        achats_march: 100,
        achats_mp: 50,
        ace: 20,
        prod_biens: 300,
        prod_serv: 200
      },
      byLineCode: {
        "068": 150,
        "072": 30,
        "084": 90,
        "166": 70,
        "172": 20
      },
      byLabel: {}
    };

    const mapped = mapRawDataToMappedFinancialData(rawData);

    expect(mapped.achats_march).toBe(100);
    expect(mapped.clients).toBe(150);
    expect(mapped.autres_creances).toBe(30);
    expect(mapped.creances).toBe(180);
    expect(mapped.prod_vendue).toBe(500);
    expect(mapped.total_prod_expl).toBe(500);
    expect(mapped.n).toBe(1);
  });

  it("merges raw payloads and preserves all buckets", () => {
    const merged = mergeRawAnalysisData([
      {
        byVariableCode: { total_prod_expl: 10 },
        byLineCode: { "232": 10 },
        byLabel: { total_prod_expl: 10 }
      },
      {
        byVariableCode: { total_prod_expl: 15 },
        byLineCode: { "232": 15 },
        byLabel: { total_prod_expl: 15 }
      }
    ]);

    expect(merged.byVariableCode.total_prod_expl).toBe(25);
    expect(merged.byLineCode["232"]).toBe(25);
    expect(merged.byLabel.total_prod_expl).toBe(25);
  });

  it("fills mapped data from legacy facts when source fields are missing", () => {
    const mapped = applyLegacyFinancialFactsToMappedData(createEmptyMappedFinancialData(), {
      revenue: 1000,
      expenses: 400,
      payroll: 200,
      treasury: 120,
      receivables: 80,
      payables: 50,
      inventory: 40
    });

    expect(mapped.total_prod_expl).toBe(1000);
    expect(mapped.total_charges_expl).toBe(400);
    expect(mapped.salaires).toBe(200);
    expect(mapped.dispo).toBe(120);
    expect(mapped.creances).toBe(80);
    expect(mapped.fournisseurs).toBe(50);
    expect(mapped.total_stocks).toBe(40);
  });

  it("maps mapped data back to legacy financial facts", () => {
    const mapped = {
      ...createEmptyMappedFinancialData(),
      total_prod_expl: 1000,
      total_charges_expl: 400,
      salaires: 150,
      charges_soc: 50,
      dispo: 100,
      creances: 70,
      fournisseurs: 30,
      dettes_fisc_soc: 10,
      total_stocks: 90
    };

    expect(mapMappedDataToFinancialFacts(mapped)).toEqual({
      revenue: 1000,
      expenses: 400,
      payroll: 200,
      treasury: 100,
      receivables: 70,
      payables: 40,
      inventory: 90
    });
  });

  it("provides an empty raw analysis data structure", () => {
    expect(createEmptyRawAnalysisData()).toEqual({
      byVariableCode: {},
      byLineCode: {},
      byLabel: {}
    });
  });
});
