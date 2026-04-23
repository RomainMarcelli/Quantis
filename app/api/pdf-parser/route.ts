import { NextRequest, NextResponse } from "next/server";
import {
  isPdfPageLimitExceededError,
  processPdfWithDocumentAI
} from "@/services/documentAI";
import { mapToQuantisData, type QuantisFinancialData } from "@/services/financialMapping";
import { computeKpis } from "@/services/kpiEngine";
import { mapParsedFinancialDataToMappedFinancialData } from "@/services/mapping/parsedFinancialDataBridge";
import { getFirebaseAdminAuth } from "@/lib/server/firebaseAdmin";
import { AuthError, requireAdmin } from "@/lib/auth/requireAdmin";
import {
  analyzeFinancialDocument,
  type FieldSelectionTrace,
  type DetectedFinancialSections,
  type ParsedFinancialData
} from "@/services/pdfAnalysis";
import { extractFinancialPages } from "@/services/pdf-analysis/pdfPageExtractor";
import {
  extractWithVision,
  mergeVisionWithDocumentAI,
  buildExistingDataForVision
} from "@/services/pdf-analysis/visionExtractor";
import { logVisionCall } from "@/services/pdf-analysis/visionLogger";
import {
  deleteReducedPdf,
  storeReducedPdf
} from "@/services/pdf-analysis/reducedPdfStore";
import {
  getUserAnalyses,
  saveAnalysis
} from "@/services/pdfAnalysisStore";
import {
  completePdfParserProgress,
  failPdfParserProgress,
  getPdfParserProgress,
  startPdfParserProgress,
  updatePdfParserProgress
} from "@/services/pdfParserProgressStore";

export const runtime = "nodejs";
export const maxDuration = 60;

type PdfExtractionSummary = {
  originalPages: number;
  extractedPages: number;
};

type PdfParserSuccessResponse = {
  success: true;
  parserVersion: "analysis-engine-v2";
  requestId: string | null;
  quantisData: QuantisFinancialData;
  mappedData: Record<string, number | null>;
  kpis: Record<string, number | null>;
  confidenceScore: number;
  warnings: string[];
  pdfExtraction: PdfExtractionSummary | null;
  persistence: {
    saved: boolean;
    analysisId: string | null;
    warning: string | null;
  };
  debugData?: {
    rawText: string;
    pages: Record<string, unknown>[];
    entities: Record<string, unknown>[];
    tables: Record<string, unknown>[];
    detectedSections: DetectedFinancialSections;
    financialData: ParsedFinancialData;
    traces: FieldSelectionTrace[];
    reconstructedRows: Array<{
      source: "table" | "text";
      page: number;
      rowNumber: number;
      section: "incomeStatement" | "balanceSheet" | "unknown";
      label: string;
      lineCode: string | null;
      amountCandidates: Array<{
        value: number;
        columnIndex: number;
        headerHint: string | null;
      }>;
    }>;
    diagnostics: {
      fieldScores: Record<string, number>;
      consistencyChecks: Array<{
        name: string;
        status: "ok" | "warning";
        message: string;
      }>;
    };
    mappedData: Record<string, number | null>;
    kpis: Record<string, number | null>;
  };
};

type PdfParserErrorResponse = {
  success: false;
  error: string;
  detail?: string;
  code?: string;
  pageCount?: number;
  maxPages?: number;
};

type PdfParserHistoryResponse =
  | {
      success: true;
      analyses: Array<{
        id: string;
        createdAt: string;
        source: "pdf";
        quantisData: QuantisFinancialData;
        confidenceScore: number;
        warnings: string[];
      }>;
    }
  | {
      success: true;
      progress: number;
      currentStep: string;
      status: "running" | "completed" | "failed";
      error: string | null;
    }
  | PdfParserErrorResponse;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json<PdfParserHistoryResponse>(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    throw error;
  }

  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json<PdfParserHistoryResponse>(
      {
        success: false,
        error: "Non autorise."
      },
      { status: 401 }
    );
  }

  const requestId = request.nextUrl.searchParams.get("requestId")?.trim();
  if (requestId) {
    const progressRecord = getPdfParserProgress(requestId);
    if (!progressRecord) {
      return NextResponse.json<PdfParserHistoryResponse>(
        {
          success: true,
          progress: 0,
          currentStep: "Initialisation du traitement...",
          status: "running",
          error: null
        },
        { status: 200 }
      );
    }

    if (progressRecord.userId !== userId) {
      return NextResponse.json<PdfParserHistoryResponse>(
        {
          success: false,
          error: "Acces interdit."
        },
        { status: 403 }
      );
    }

    return NextResponse.json<PdfParserHistoryResponse>(
      {
        success: true,
        progress: progressRecord.progress,
        currentStep: progressRecord.currentStep,
        status: progressRecord.status,
        error: progressRecord.error
      },
      { status: 200 }
    );
  }

  try {
    const analyses = await getUserAnalyses(userId);
    const summarizedAnalyses = analyses.map((analysis) => ({
      id: analysis.id,
      createdAt: analysis.createdAt,
      source: analysis.source,
      quantisData: analysis.quantisData,
      confidenceScore: analysis.rawData.confidenceScore,
      warnings: analysis.rawData.warnings
    }));

    return NextResponse.json<PdfParserHistoryResponse>(
      {
        success: true,
        analyses: summarizedAnalyses
      },
      { status: 200 }
    );
  } catch (error) {
    const detail = toErrorMessage(error);
    console.error("[api/pdf-parser] Failed to list analyses", { userId, detail });
    return NextResponse.json<PdfParserHistoryResponse>(
      {
        success: false,
        error: "Impossible de recuperer l'historique des analyses PDF.",
        detail
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json<PdfParserErrorResponse>(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    throw error;
  }

  const userId = await resolveAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json<PdfParserErrorResponse>(
      {
        success: false,
        error: "Non autorise."
      },
      { status: 401 }
    );
  }

  let progressRequestId: string | null = null;

  try {
    const formData = await request.formData();
    progressRequestId = String(formData.get("requestId") ?? "").trim() || null;
    if (progressRequestId) {
      startPdfParserProgress(progressRequestId, userId);
    }

    const userIdFromFormData = String(formData.get("userId") ?? "").trim();
    if (userIdFromFormData && userIdFromFormData !== userId) {
      return NextResponse.json<PdfParserErrorResponse>(
        {
          success: false,
          error: "Acces interdit."
        },
        { status: 403 }
      );
    }

    const file = resolveUploadedFile(formData);

    if (!file) {
      return NextResponse.json<PdfParserErrorResponse>(
        {
          success: false,
          error: "Aucun fichier PDF recu. Envoyez un champ `file`."
        },
        { status: 400 }
      );
    }

    if (!isPdfFile(file)) {
      return NextResponse.json<PdfParserErrorResponse>(
        {
          success: false,
          error: "Le fichier envoye doit etre un PDF."
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const originalPdfBuffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || "application/pdf";


    if (progressRequestId) {
      updatePdfParserProgress(progressRequestId, {
        progress: 10,
        currentStep: "Pré-traitement PDF (pages financières)..."
      });
    }

    const pageExtraction = await extractFinancialPages(originalPdfBuffer);
    const pdfBuffer = pageExtraction.buffer;
    const useImagelessMode = pageExtraction.imagelessMode;
    const pdfExtractionSummary: PdfExtractionSummary | null =
      pageExtraction.originalPages > 0
        ? {
            originalPages: pageExtraction.originalPages,
            extractedPages: pageExtraction.extractedPages
          }
        : null;

    const hasReduction =
      pdfExtractionSummary !== null &&
      pdfExtractionSummary.extractedPages < pdfExtractionSummary.originalPages;
    if (hasReduction && progressRequestId) {
      storeReducedPdf(progressRequestId, pdfBuffer);
    }

    if (progressRequestId) {
      updatePdfParserProgress(progressRequestId, {
        progress: 20,
        currentStep: pageExtraction.isScanned
          ? "Traitement Document AI (OCR scan)..."
          : "Traitement Document AI..."
      });
    }

    const extraction = await processPdfWithDocumentAI({
      pdfBuffer,
      fileName: file.name,
      mimeType,
      imagelessMode: useImagelessMode
    });
    if (progressRequestId) {
      updatePdfParserProgress(progressRequestId, {
        progress: 70,
        currentStep: "Analyse et mapping des donnees..."
      });
    }
    const analysis = analyzeFinancialDocument(extraction);
    const detectedSections = analysis.detectedSections;
    const financialData = analysis.parsedFinancialData;
    let mappedData = mapParsedFinancialDataToMappedFinancialData(financialData);
    let kpis = computeKpis(mappedData);
    let quantisData = mapToQuantisData(financialData);
    const diagnostics = analysis.diagnostics;
    const warnings = [...diagnostics.warnings];
    if (quantisData.ca !== null && quantisData.ca < 0) {
      warnings.push("CA negatif detecte, verification recommandee.");
    }

    const useVisionFallback =
      process.env.ANTHROPIC_API_KEY &&
      diagnostics.confidenceScore < 0.80;

    if (useVisionFallback) {
      const confidenceBefore = diagnostics.confidenceScore;
      const existingData = buildExistingDataForVision(financialData);
      const visionResult = await extractWithVision(pdfBuffer, file.name, existingData);
      if (visionResult.success && visionResult.data) {
        mergeVisionWithDocumentAI(financialData, visionResult.data, diagnostics.fieldScores);
        mappedData = mapParsedFinancialDataToMappedFinancialData(financialData);
        kpis = computeKpis(mappedData);
        quantisData = mapToQuantisData(financialData);
        warnings.push(`Vision LLM appliqué (score avant: ${confidenceBefore}, après: ${visionResult.confidenceScore})`);
      }
    } else {
      logVisionCall({
        timestamp: new Date().toISOString(),
        analysisId: "",
        pdfName: file.name,
        triggered: false,
        confidenceScoreBefore: diagnostics.confidenceScore
      });
    }

    if (progressRequestId) {
      updatePdfParserProgress(progressRequestId, {
        progress: 90,
        currentStep: "Finalisation et sauvegarde..."
      });
    }
    let persistence: PdfParserSuccessResponse["persistence"] = {
      saved: false,
      analysisId: null,
      warning: null
    };

    try {
      const saved = await saveAnalysis(userId, quantisData, {
        financialData,
        mappedData,
        kpis,
        detectedSections,
        rawText: extraction.rawText,
        confidenceScore: diagnostics.confidenceScore,
        warnings
      });
      persistence = {
        saved: true,
        analysisId: saved.id,
        warning: null
      };
    } catch (saveError) {
      const detail = toErrorMessage(saveError);
      console.error("[api/pdf-parser] Failed to persist analysis", {
        userId,
        fileName: file.name,
        detail
      });
      persistence = {
        saved: false,
        analysisId: null,
        warning: "Extraction reussie mais sauvegarde Firestore indisponible."
      };
    }

    const responseBody: PdfParserSuccessResponse = {
      success: true,
      parserVersion: "analysis-engine-v2",
      requestId: progressRequestId,
      quantisData,
      mappedData,
      kpis,
      confidenceScore: diagnostics.confidenceScore,
      warnings,
      pdfExtraction: pdfExtractionSummary,
      persistence
    };

    if (isPdfParserDebugEnabled()) {
      responseBody.debugData = {
        rawText: extraction.rawText,
        pages: extraction.pages,
        entities: extraction.entities,
        tables: extraction.tables,
        detectedSections,
        financialData,
        traces: analysis.traces,
        reconstructedRows: analysis.rows.slice(0, 150).map((row) => ({
          source: row.source,
          page: row.page,
          rowNumber: row.rowNumber,
          section: row.section,
          label: row.label,
          lineCode: row.lineCode,
          amountCandidates: row.amountCandidates.map((candidate) => ({
            value: candidate.value,
            columnIndex: candidate.columnIndex,
            headerHint: candidate.headerHint
          }))
        })),
        diagnostics: {
          fieldScores: analysis.diagnostics.fieldScores,
          consistencyChecks: analysis.diagnostics.consistencyChecks
        },
        mappedData,
        kpis
      };
    }

    if (progressRequestId) {
      completePdfParserProgress(progressRequestId, {
        currentStep: "Traitement termine."
      });
    }

    return NextResponse.json<PdfParserSuccessResponse>(responseBody, {
      status: 200,
      headers: {
        "x-pdf-parser-engine": "analysis-engine-v2"
      }
    });
  } catch (error) {
    const mappedError = mapPdfParserError(error);
    if (progressRequestId) {
      failPdfParserProgress(progressRequestId, {
        currentStep: "Echec du traitement.",
        error: mappedError.detail ?? mappedError.error
      });
      deleteReducedPdf(progressRequestId);
    }
    console.error("[api/pdf-parser] Processing failed", {
      detail: mappedError.detail,
      code: mappedError.code
    });

    return NextResponse.json<PdfParserErrorResponse>(
      {
        success: false,
        error: mappedError.error,
        detail: mappedError.detail,
        code: mappedError.code,
        pageCount: mappedError.pageCount,
        maxPages: mappedError.maxPages
      },
      { status: mappedError.status }
    );
  }
}

function resolveUploadedFile(formData: FormData): File | null {
  const fileField = formData.get("file");
  if (fileField instanceof File) {
    return fileField;
  }

  const firstFileCandidate = Array.from(formData.values())
    .find((candidate): candidate is File => candidate instanceof File);

  return firstFileCandidate ?? null;
}

function isPdfFile(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  return mimeType === "application/pdf" || fileName.endsWith(".pdf");
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erreur inconnue";
}

async function resolveAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const bearerToken = extractBearerToken(request.headers.get("authorization"));
  if (!bearerToken) {
    return null;
  }

  try {
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(bearerToken);
    return decodedToken.uid;
  } catch {
    return null;
  }
}

function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function isPdfParserDebugEnabled(): boolean {
  return process.env.PDF_PARSER_DEBUG === "true";
}

function mapPdfParserError(error: unknown): {
  status: number;
  error: string;
  detail?: string;
  code?: string;
  pageCount?: number;
  maxPages?: number;
} {
  if (isPdfPageLimitExceededError(error)) {
    return {
      status: 422,
      code: error.code,
      error: "PDF trop long pour le traitement en ligne.",
      detail: `Le document contient ${error.pageCount} pages, mais la limite actuelle est ${error.maxPages} pages.`,
      pageCount: error.pageCount,
      maxPages: error.maxPages
    };
  }

  const detail = toErrorMessage(error);
  const pageLimitMatch = detail.match(/Document pages exceed the limit:\s*(\d+)\s*got\s*(\d+)/i);
  if (pageLimitMatch?.[1] && pageLimitMatch[2]) {
    const maxPages = Number.parseInt(pageLimitMatch[1], 10);
    const pageCount = Number.parseInt(pageLimitMatch[2], 10);

    return {
      status: 422,
      code: "PDF_PAGE_LIMIT_EXCEEDED",
      error: "PDF trop long pour le traitement en ligne.",
      detail: `Le document contient ${pageCount} pages, mais la limite actuelle est ${maxPages} pages.`,
      pageCount,
      maxPages
    };
  }

  return {
    status: 500,
    error: "Echec de l'extraction PDF via Document AI.",
    detail
  };
}
