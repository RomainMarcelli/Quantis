import { describe, expect, it } from "vitest";
import { analyzeFinancialDocument, extractFinancialData, type DocumentAIResponse } from "@/services/pdfAnalysis";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { computeKpis } from "@/services/kpiEngine";

describe("pdf parser lot 1 consolidation", () => {
  it("extracts priority fields with OCR-degraded line codes and unblocks core KPIs", () => {
    const sample: DocumentAIResponse = {
      rawText: [
        "COMPTE DE RESULTAT",
        "Autres charges externes 242 980 000",
        "Achats de marchandises 234 1 250 300",
        "",
        "BILAN ACTIF",
        "Matieres premieres, approvisionnements, en cours de production 050 200 000",
        "Marchandises 060 310 000",
        "Creances clients et comptes rattaches 068 290 000",
        "Autres creances 072 160 000",
        "TOTAL II - ACTIF CIRCULANT 096 960 000",
        "TOTAL I - ACTIF IMMOBILISE 044 7 000 000",
        "",
        "BILAN PASSIF",
        "Dettes fournisseurs et comptes rattaches 166 260 000",
        "Dettes fiscales et sociales 172 190 000"
      ].join("\n"),
      pages: [],
      tables: []
    };

    const analysis = analyzeFinancialDocument(sample);
    const parsed = analysis.parsedFinancialData;
    const mapped = mapParsedFinancialDataToMappedFinancialData(parsed);
    const kpis = computeKpis(mapped);

    // Debug guard for OCR-like regressions.
    const externalChargesTrace = analysis.traces.find((trace) => trace.field === "externalCharges");
    expect(externalChargesTrace?.selected?.value).toBe(980_000);

    expect(parsed.incomeStatement.externalCharges).toBe(980_000);
    expect(parsed.balanceSheet.taxSocialPayables).toBe(190_000);
    expect(parsed.balanceSheet.otherReceivables).toBe(160_000);
    expect(parsed.balanceSheet.totalCurrentAssets).toBe(960_000);
    expect(parsed.balanceSheet.totalFixedAssets).toBe(7_000_000);

    expect(mapped.ace).toBe(980_000);
    expect(mapped.dettes_fisc_soc).toBe(190_000);
    expect(mapped.autres_creances).toBe(160_000);
    expect(mapped.total_actif_circ).toBe(960_000);
    expect(mapped.total_actif_immo).toBe(7_000_000);

    expect(kpis.bfr).toBe(510_000);
    expect(kpis.workingCapital).toBe(510_000);
    expect(kpis.dpo).toBe(35.46);
    expect(kpis.ratio_immo).toBeNull();
  });
});
