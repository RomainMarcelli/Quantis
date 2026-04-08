import { NextRequest, NextResponse } from "next/server";
import { processPdfWithDocumentAI } from "@/services/documentAI";
import { mapToQuantisData, type QuantisFinancialData } from "@/services/financialMapping";
import { getFirebaseAdminAuth } from "@/lib/server/firebaseAdmin";
import {
  detectFinancialSections,
  extractFinancialData,
  type DetectedFinancialSections,
  type ParsedFinancialData
} from "@/services/pdfAnalysis";
import {
  getUserAnalyses,
  saveAnalysis,
  type SavedPdfAnalysisRecord
} from "@/services/pdfAnalysisStore";

export const runtime = "nodejs";

type PdfParserSuccessResponse = {
  success: true;
  rawText: string;
  pages: Record<string, unknown>[];
  entities: Record<string, unknown>[];
  tables: Record<string, unknown>[];
  detectedSections: DetectedFinancialSections;
  financialData: ParsedFinancialData;
  quantisData: QuantisFinancialData;
  persistence: {
    saved: boolean;
    analysisId: string | null;
    warning: string | null;
  };
};

type PdfParserErrorResponse = {
  success: false;
  error: string;
  detail?: string;
};

type PdfParserHistoryResponse =
  | {
      success: true;
      analyses: SavedPdfAnalysisRecord[];
    }
  | PdfParserErrorResponse;

export async function GET(request: NextRequest) {
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

  try {
    const analyses = await getUserAnalyses(userId);
    return NextResponse.json<PdfParserHistoryResponse>(
      {
        success: true,
        analyses
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

  try {
    const formData = await request.formData();
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
    const pdfBuffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || "application/pdf";

    console.info("[api/pdf-parser] PDF upload received", {
      fileName: file.name,
      mimeType,
      fileSizeBytes: file.size
    });

    const extraction = await processPdfWithDocumentAI({
      pdfBuffer,
      fileName: file.name,
      mimeType
    });
    const detectedSections = detectFinancialSections(extraction);
    const financialData = extractFinancialData(extraction);
    const quantisData = mapToQuantisData(financialData);
    let persistence: PdfParserSuccessResponse["persistence"] = {
      saved: false,
      analysisId: null,
      warning: null
    };

    try {
      const saved = await saveAnalysis(userId, quantisData, {
        financialData,
        detectedSections,
        rawText: extraction.rawText
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
      rawText: extraction.rawText,
      pages: extraction.pages,
      entities: extraction.entities,
      tables: extraction.tables,
      detectedSections,
      financialData,
      quantisData,
      persistence
    };

    return NextResponse.json<PdfParserSuccessResponse>(responseBody, { status: 200 });
  } catch (error) {
    const detail = toErrorMessage(error);
    console.error("[api/pdf-parser] Processing failed", { detail });

    return NextResponse.json<PdfParserErrorResponse>(
      {
        success: false,
        error: "Echec de l'extraction PDF via Document AI.",
        detail
      },
      { status: 500 }
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
