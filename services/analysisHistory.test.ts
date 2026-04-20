import { describe, expect, it } from "vitest";
import {
  findPreviousAnalysisByFiscalYear,
  resolveAnalysisFiscalYear,
  sortAnalysesByFiscalYear
} from "@/services/analysisHistory";
import type { AnalysisRecord } from "@/types/analysis";

function makeAnalysis(params: {
  id: string;
  fiscalYear: number | null;
  createdAt: string;
  folderName: string;
  parsedData?: AnalysisRecord["parsedData"];
  sourceFiles?: AnalysisRecord["sourceFiles"];
}): AnalysisRecord {
  return {
    id: params.id,
    fiscalYear: params.fiscalYear,
    createdAt: params.createdAt,
    folderName: params.folderName,
    parsedData: params.parsedData ?? [],
    sourceFiles: params.sourceFiles ?? []
  } as unknown as AnalysisRecord;
}

describe("analysisHistory", () => {
  it("prioritizes fiscalYear over createdAt when both exist", () => {
    const analysis = makeAnalysis({
      id: "a1",
      fiscalYear: 2025,
      createdAt: "2026-01-01T00:00:00.000Z",
      folderName: "Dossier principal"
    });

    expect(resolveAnalysisFiscalYear(analysis)).toBe(2025);
  });

  it("finds previous analysis by fiscal year with folder preference", () => {
    const current = makeAnalysis({
      id: "a3",
      fiscalYear: 2025,
      createdAt: "2026-01-10T00:00:00.000Z",
      folderName: "Dossier A"
    });
    const history = [
      makeAnalysis({
        id: "a1",
        fiscalYear: 2023,
        createdAt: "2024-01-10T00:00:00.000Z",
        folderName: "Dossier B"
      }),
      makeAnalysis({
        id: "a2",
        fiscalYear: 2024,
        createdAt: "2025-01-10T00:00:00.000Z",
        folderName: "Dossier A"
      }),
      current
    ];

    const sorted = sortAnalysesByFiscalYear(history, "desc");
    const previous = findPreviousAnalysisByFiscalYear({
      analyses: sorted,
      currentAnalysis: current,
      preferSameFolder: true
    });

    expect(previous?.id).toBe("a2");
  });

  it("falls back to parsed file name year when parsed fiscalYear is null", () => {
    const analysis = makeAnalysis({
      id: "a-filename",
      fiscalYear: null,
      createdAt: "2026-01-10T00:00:00.000Z",
      folderName: "Dossier principal",
      parsedData: [
        {
          fileName: "Quantis_Full_Liasse_31-12-2025.xlsx",
          fileType: "excel",
          extractedAt: "2026-04-01T00:00:00.000Z",
          fiscalYear: null,
          metrics: [],
          previewRows: [],
          rawData: {
            byVariableCode: {},
            byLineCode: {},
            byLabel: {}
          }
        }
      ]
    });

    expect(resolveAnalysisFiscalYear(analysis)).toBe(2025);
  });

  it("falls back to preview header year when fiscalYear is missing everywhere else", () => {
    const analysis = makeAnalysis({
      id: "a-preview",
      fiscalYear: null,
      createdAt: "2026-01-10T00:00:00.000Z",
      folderName: "Dossier principal",
      parsedData: [
        {
          fileName: "liasse.xlsx",
          fileType: "excel",
          extractedAt: "2026-04-01T00:00:00.000Z",
          fiscalYear: null,
          metrics: [],
          previewRows: [
            {
              "Exercice N clos le 31/12/2024": "Libellé Source",
              "__EMPTY_1": "Variable Code",
              "__EMPTY_2": "Brut",
              "__EMPTY_3": "Net"
            }
          ],
          rawData: {
            byVariableCode: {},
            byLineCode: {},
            byLabel: {}
          }
        }
      ]
    });

    expect(resolveAnalysisFiscalYear(analysis)).toBe(2024);
  });
});
