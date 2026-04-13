import { describe, expect, it } from "vitest";
import {
  buildParserDiagnostic,
  buildParserDiagnosticSummaryText
} from "@/app/pdf-parser-test/parserDiagnosticExport";
import type { ParserSuccessPayload } from "@/app/pdf-parser-test/types";

describe("parserDiagnosticExport", () => {
  it("classifie les champs manquants et les KPI bloques avec raisons explicites", () => {
    const payload: ParserSuccessPayload = {
      success: true,
      parserVersion: "analysis-engine-v2",
      quantisData: {
        ca: 3_370_595,
        totalCharges: 7_736_512,
        netResult: -2_657_615,
        totalAssets: 9_808_846,
        equity: 4_002_315,
        debts: 5_806_530
      },
      mappedData: {
        ventes_march: 3_370_595,
        prod_vendue: null,
        total_stocks: 2_486_682,
        creances: 9_307,
        fournisseurs: 1_680_299,
        dettes_fisc_soc: null,
        autres_creances: null,
        total_actif_immo: 6_987_710,
        total_actif_immo_net: 6_987_710,
        total_actif_immo_brut: 13_208_608
      },
      kpis: {
        bfr: null,
        workingCapital: null,
        ratio_immo: 0.53
      },
      confidenceScore: 0.71,
      warnings: [],
      persistence: {
        saved: true,
        analysisId: "analysis-1",
        warning: null
      },
      debugData: {
        traces: [
          {
            field: "otherReceivables",
            selected: null
          },
          {
            field: "taxSocialPayables",
            selected: null
          }
        ],
        reconstructedRows: [
          {
            page: 1,
            rowNumber: 95,
            section: "balanceSheet",
            label: "Autres créances",
            lineCode: null,
            amountCandidates: []
          },
          {
            page: 1,
            rowNumber: 229,
            section: "balanceSheet",
            label: "Dettes fiscales et sociales",
            lineCode: null,
            amountCandidates: []
          }
        ],
        diagnostics: {
          fieldScores: {
            otherReceivables: 0,
            taxSocialPayables: 0
          }
        }
      }
    };

    const diagnostic = buildParserDiagnostic({
      responsePayload: payload,
      statusCode: 200,
      networkError: null,
      apiErrorMessage: null,
      elapsedSeconds: 14,
      estimatedDurationSeconds: 12
    });

    const byField = Object.fromEntries(
      diagnostic.dataQuality.missingFieldDiagnostics.map((item) => [item.field, item])
    );

    expect(byField.autres_creances?.status).toBe("missing_label_without_amount");
    expect(byField.dettes_fisc_soc?.status).toBe("missing_label_without_amount");
    expect(byField.prod_vendue?.status).toBe("missing_intentional_null");
    expect(byField.dettes_fisc_soc?.blockingImpact.blockedKpis).toContain("bfr");

    const blocked = Object.fromEntries(diagnostic.kpiStatus.blocked.map((item) => [item.kpi, item]));
    expect(blocked.bfr?.status).toBe("blocked_missing_inputs");
    expect(blocked.bfr?.missingSources).toContain("dettes_fisc_soc");
    expect(blocked.workingCapital?.status).toBe("blocked_missing_inputs");

    const ratio = diagnostic.kpiStatus.important.find((item) => item.kpi === "ratio_immo");
    expect(ratio?.status).toBe("calculated");

    const summary = buildParserDiagnosticSummaryText(diagnostic);
    expect(summary).toContain("=== CHAMPS MANQUANTS JUSTIFIES ===");
    expect(summary).toContain("=== KPI BLOQUES DETAIL ===");
  });
});

