import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const {
  processPdfWithDocumentAIMock,
  analyzeFinancialDocumentMock,
  mapToQuantisDataMock,
  verifyIdTokenMock,
  saveAnalysisMock,
  getUserAnalysesMock
} = vi.hoisted(() => ({
  processPdfWithDocumentAIMock: vi.fn(),
  analyzeFinancialDocumentMock: vi.fn(),
  mapToQuantisDataMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
  saveAnalysisMock: vi.fn(),
  getUserAnalysesMock: vi.fn()
}));
vi.mock("@/services/documentAI", () => ({
  processPdfWithDocumentAI: processPdfWithDocumentAIMock,
  isPdfPageLimitExceededError: (value: unknown) =>
    typeof value === "object" &&
    value !== null &&
    (value as { code?: string }).code === "PDF_PAGE_LIMIT_EXCEEDED"
}));
vi.mock("@/services/pdfAnalysis", () => ({
  analyzeFinancialDocument: analyzeFinancialDocumentMock
}));
vi.mock("@/services/financialMapping", () => ({
  mapToQuantisData: mapToQuantisDataMock
}));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  getFirebaseAdminAuth: () => ({
    verifyIdToken: verifyIdTokenMock
  })
}));
vi.mock("@/services/pdfAnalysisStore", () => ({
  saveAnalysis: saveAnalysisMock,
  getUserAnalyses: getUserAnalysesMock
}));
import { GET, POST } from "@/app/api/pdf-parser/route";
describe("POST /api/pdf-parser", () => {
  const previousDebugEnv = process.env.PDF_PARSER_DEBUG;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PDF_PARSER_DEBUG = "false";
    processPdfWithDocumentAIMock.mockResolvedValue({
      rawText: "Extracted text",
      pages: [{ pageNumber: 1 }],
      entities: [{ type: "amount" }],
      tables: [{ headerRows: [] }]
    });
    mapToQuantisDataMock.mockReturnValue({
      ca: 300,
      totalCharges: 400,
      netResult: -100,
      totalAssets: 1000,
      equity: 600,
      debts: 400
    });
    analyzeFinancialDocumentMock.mockReturnValue({
      parsedFinancialData: {
        incomeStatement: {
          revenue: 100,
          production: 200,
          totalProducts: 300,
          totalCharges: 400,
          netResult: -100
        },
        balanceSheet: {
          totalAssets: 1000,
          equity: 600,
          debts: 400
        }
      },
      detectedSections: {
        incomeStatement: true,
        balanceSheet: true
      },
      diagnostics: {
        confidenceScore: 0.75,
        warnings: ["Resultat net non trouve."],
        fieldScores: {},
        consistencyChecks: []
      },
      traces: [],
      rows: []
    });
    verifyIdTokenMock.mockResolvedValue({
      uid: "user-1"
    });
    saveAnalysisMock.mockResolvedValue({
      id: "analysis-pdf-1"
    });
    getUserAnalysesMock.mockResolvedValue([]);
  });
  afterEach(() => {
    if (previousDebugEnv === undefined) {
      delete process.env.PDF_PARSER_DEBUG;
    } else {
      process.env.PDF_PARSER_DEBUG = previousDebugEnv;
    }
  });

  it("retourne 401 sans token", async () => {
    const formData = new FormData();
    formData.append("file", createFile("liasse.pdf", "application/pdf", "fake-pdf-content"));

    const response = await POST(createRequest(formData, { withAuth: false }));
    const payload = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(401);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Non autorise");
  });

  it("retourne 400 sans fichier", async () => {
    const response = await POST(createRequest(new FormData()));
    const payload = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Aucun fichier PDF");
    expect(processPdfWithDocumentAIMock).not.toHaveBeenCalled();
  });

  it("retourne 403 si userId du formulaire ne correspond pas au token", async () => {
    const formData = new FormData();
    formData.append("userId", "another-user");
    formData.append("file", createFile("liasse.pdf", "application/pdf", "fake-pdf-content"));

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Acces interdit");
  });

  it("retourne 400 si le fichier n'est pas un PDF", async () => {
    const formData = new FormData();
    formData.append("file", createFile("report.txt", "text/plain", "hello"));

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("doit etre un PDF");
    expect(processPdfWithDocumentAIMock).not.toHaveBeenCalled();
  });

  it("retourne la reponse frontend allegee", async () => {
    const formData = new FormData();
    formData.append("file", createFile("liasse.pdf", "application/pdf", "fake-pdf-content"));

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as {
      success: boolean;
      debugData?: unknown;
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      parserVersion: "analysis-engine-v2",
      quantisData: {
        ca: 300,
        totalCharges: 400,
        netResult: -100,
        totalAssets: 1000,
        equity: 600,
        debts: 400
      },
      confidenceScore: 0.75,
      warnings: ["Resultat net non trouve."],
      persistence: {
        saved: true,
        analysisId: "analysis-pdf-1",
        warning: null
      }
    });
    expect(payload.debugData).toBeUndefined();
    expect(processPdfWithDocumentAIMock).toHaveBeenCalledTimes(1);
    expect(analyzeFinancialDocumentMock).toHaveBeenCalledTimes(1);
    expect(mapToQuantisDataMock).toHaveBeenCalledTimes(1);
    expect(saveAnalysisMock).toHaveBeenCalledTimes(1);
    expect(saveAnalysisMock).toHaveBeenCalledWith(
      "user-1",
      {
        ca: 300,
        totalCharges: 400,
        netResult: -100,
        totalAssets: 1000,
        equity: 600,
        debts: 400
      },
      expect.objectContaining({
        rawText: "Extracted text",
        confidenceScore: 0.75,
        warnings: ["Resultat net non trouve."]
      })
    );
    expect(processPdfWithDocumentAIMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "liasse.pdf",
        mimeType: "application/pdf",
        pdfBuffer: expect.any(Buffer)
      })
    );
  });

  it("retourne debugData si PDF_PARSER_DEBUG=true", async () => {
    process.env.PDF_PARSER_DEBUG = "true";
    const formData = new FormData();
    formData.append("file", createFile("liasse.pdf", "application/pdf", "fake-pdf-content"));

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as {
      success: boolean;
      debugData?: {
        rawText: string;
        pages: unknown[];
        tables: unknown[];
      };
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.debugData).toEqual(
      expect.objectContaining({
        rawText: "Extracted text",
        pages: [{ pageNumber: 1 }],
        tables: [{ headerRows: [] }]
      })
    );
  });

  it("retourne 500 quand le service Document AI echoue", async () => {
    processPdfWithDocumentAIMock.mockRejectedValueOnce(new Error("Document AI unavailable"));
    const formData = new FormData();
    formData.append("file", createFile("liasse.pdf", "application/pdf", "fake-pdf-content"));

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as {
      success: boolean;
      error: string;
      detail: string;
    };

    expect(response.status).toBe(500);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Document AI");
    expect(payload.detail).toContain("Document AI unavailable");
  });

  it("retourne 422 avec erreur metier quand le PDF depasse la limite de pages", async () => {
    processPdfWithDocumentAIMock.mockRejectedValueOnce(
      new Error("3 INVALID_ARGUMENT: Document pages exceed the limit: 30 got 35")
    );
    const formData = new FormData();
    formData.append("file", createFile("liasse-complete.pdf", "application/pdf", "fake-pdf-content"));

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as {
      success: boolean;
      error: string;
      detail: string;
      code?: string;
      pageCount?: number;
      maxPages?: number;
    };

    expect(response.status).toBe(422);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("PDF trop long");
    expect(payload.code).toBe("PDF_PAGE_LIMIT_EXCEEDED");
    expect(payload.pageCount).toBe(35);
    expect(payload.maxPages).toBe(30);
  });

  it("ne casse pas la reponse si la sauvegarde Firestore echoue", async () => {
    saveAnalysisMock.mockRejectedValueOnce(new Error("Firestore unavailable"));
    const formData = new FormData();
    formData.append("file", createFile("liasse.pdf", "application/pdf", "fake-pdf-content"));

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as {
      success: boolean;
      persistence: {
        saved: boolean;
        analysisId: string | null;
        warning: string | null;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.persistence.saved).toBe(false);
    expect(payload.persistence.analysisId).toBeNull();
    expect(payload.persistence.warning).toContain("sauvegarde Firestore");
  });

  it("ajoute un warning si le CA calcule est negatif", async () => {
    mapToQuantisDataMock.mockReturnValueOnce({
      ca: -7105,
      totalCharges: 400,
      netResult: -100,
      totalAssets: 1000,
      equity: 600,
      debts: 400
    });
    const formData = new FormData();
    formData.append("file", createFile("liasse.pdf", "application/pdf", "fake-pdf-content"));

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as {
      success: boolean;
      warnings: string[];
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.warnings).toContain("CA negatif detecte, verification recommandee.");
  });
});

describe("GET /api/pdf-parser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({
      uid: "user-1"
    });
    processPdfWithDocumentAIMock.mockResolvedValue({
      rawText: "Extracted text",
      pages: [{ pageNumber: 1 }],
      entities: [{ type: "amount" }],
      tables: [{ headerRows: [] }]
    });
    mapToQuantisDataMock.mockReturnValue({
      ca: 300,
      totalCharges: 400,
      netResult: -100,
      totalAssets: 1000,
      equity: 600,
      debts: 400
    });
    analyzeFinancialDocumentMock.mockReturnValue({
      parsedFinancialData: {
        incomeStatement: {
          revenue: 100,
          production: 200,
          totalProducts: 300,
          totalCharges: 400,
          netResult: -100
        },
        balanceSheet: {
          totalAssets: 1000,
          equity: 600,
          debts: 400
        }
      },
      detectedSections: {
        incomeStatement: true,
        balanceSheet: true
      },
      diagnostics: {
        confidenceScore: 0.75,
        warnings: [],
        fieldScores: {},
        consistencyChecks: []
      },
      traces: [],
      rows: []
    });
    saveAnalysisMock.mockResolvedValue({
      id: "analysis-pdf-1"
    });
    getUserAnalysesMock.mockResolvedValue([
      {
        id: "analysis-1",
        createdAt: "2026-04-08T10:00:00.000Z",
        source: "pdf",
        quantisData: {
          ca: 1200000,
          totalCharges: 900000,
          netResult: 300000,
          totalAssets: 5000000,
          equity: 2000000,
          debts: 3000000
        },
        rawData: {
          rawText: "raw",
          confidenceScore: 0.82,
          warnings: ["Resultat net non trouve."],
          detectedSections: {
            incomeStatement: true,
            balanceSheet: true
          },
          financialData: {
            incomeStatement: {
              revenue: 700000,
              production: 500000,
              totalProducts: 1200000,
              totalCharges: 900000,
              netResult: 300000
            },
            balanceSheet: {
              totalAssets: 5000000,
              equity: 2000000,
              debts: 3000000
            }
          }
        }
      }
    ]);
  });

  it("retourne 401 sans token", async () => {
    const response = await GET(createRequest(undefined, { withAuth: false }));
    const payload = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(401);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Non autorise");
  });

  it("retourne les analyses de l'utilisateur authentifie", async () => {
    const response = await GET(createRequest());
    const payload = (await response.json()) as {
      success: boolean;
      analyses: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.analyses).toHaveLength(1);
    expect(payload.analyses[0]?.id).toBe("analysis-1");
    expect(payload.analyses[0]).toEqual(
      expect.objectContaining({
        confidenceScore: 0.82,
        warnings: ["Resultat net non trouve."]
      })
    );
    expect(getUserAnalysesMock).toHaveBeenCalledWith("user-1");
  });

  it("retourne un etat d'initialisation si aucune progression n'est disponible", async () => {
    const response = await GET(createRequest(undefined, { query: "requestId=missing-request" }));
    const payload = (await response.json()) as {
      success: boolean;
      progress: number;
      status: string;
      currentStep: string;
      error: string | null;
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.progress).toBe(0);
    expect(payload.status).toBe("running");
    expect(payload.currentStep).toContain("Initialisation");
    expect(payload.error).toBeNull();
  });

  it("retourne la progression d'une requete existante", async () => {
    const requestId = "request-progress-1";
    const formData = new FormData();
    formData.append("requestId", requestId);
    formData.append("file", createFile("liasse.pdf", "application/pdf", "fake-pdf-content"));

    const postResponse = await POST(createRequest(formData));
    expect(postResponse.status).toBe(200);

    const response = await GET(createRequest(undefined, { query: `requestId=${requestId}` }));
    const payload = (await response.json()) as {
      success: boolean;
      progress: number;
      status: string;
      currentStep: string;
      error: string | null;
    };
    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.progress).toBe(100);
    expect(payload.status).toBe("completed");
    expect(payload.currentStep).toContain("termine");
    expect(payload.error).toBeNull();
  });

  it("retourne 403 si la progression appartient a un autre utilisateur", async () => {
    const requestId = "request-progress-2";
    const formData = new FormData();
    formData.append("requestId", requestId);
    formData.append("file", createFile("liasse.pdf", "application/pdf", "fake-pdf-content"));

    const postResponse = await POST(createRequest(formData));
    expect(postResponse.status).toBe(200);

    verifyIdTokenMock.mockResolvedValueOnce({
      uid: "user-2"
    });
    const response = await GET(createRequest(undefined, { query: `requestId=${requestId}` }));
    const payload = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(403);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain("Acces interdit");
  });
});

function createRequest(
  formData?: FormData,
  options?: {
    withAuth?: boolean;
    query?: string;
  }
): NextRequest {
  const withAuth = options?.withAuth ?? true;
  const query = options?.query ? `?${options.query}` : "";
  return new NextRequest(`http://localhost:3000/api/pdf-parser${query}`, {
    method: formData ? "POST" : "GET",
    headers: withAuth ? { Authorization: "Bearer token-123" } : undefined,
    body: formData
  });
}

function createFile(name: string, mimeType: string, content: string): File {
  return new File([content], name, { type: mimeType });
}
