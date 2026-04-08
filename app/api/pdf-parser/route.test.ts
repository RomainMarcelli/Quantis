import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  processPdfWithDocumentAIMock,
  detectFinancialSectionsMock,
  extractFinancialDataMock,
  mapToQuantisDataMock,
  verifyIdTokenMock,
  saveAnalysisMock,
  getUserAnalysesMock
} = vi.hoisted(() => ({
  processPdfWithDocumentAIMock: vi.fn(),
  detectFinancialSectionsMock: vi.fn(),
  extractFinancialDataMock: vi.fn(),
  mapToQuantisDataMock: vi.fn(),
  verifyIdTokenMock: vi.fn(),
  saveAnalysisMock: vi.fn(),
  getUserAnalysesMock: vi.fn()
}));

vi.mock("@/services/documentAI", () => ({
  processPdfWithDocumentAI: processPdfWithDocumentAIMock
}));

vi.mock("@/services/pdfAnalysis", () => ({
  detectFinancialSections: detectFinancialSectionsMock,
  extractFinancialData: extractFinancialDataMock
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
  beforeEach(() => {
    vi.clearAllMocks();
    processPdfWithDocumentAIMock.mockResolvedValue({
      rawText: "Extracted text",
      pages: [{ pageNumber: 1 }],
      entities: [{ type: "amount" }],
      tables: [{ headerRows: [] }]
    });
    detectFinancialSectionsMock.mockReturnValue({
      incomeStatement: true,
      balanceSheet: true
    });
    extractFinancialDataMock.mockReturnValue({
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
    });
    mapToQuantisDataMock.mockReturnValue({
      ca: 300,
      totalCharges: 400,
      netResult: -100,
      totalAssets: 1000,
      equity: 600,
      debts: 400
    });
    verifyIdTokenMock.mockResolvedValue({
      uid: "user-1"
    });
    saveAnalysisMock.mockResolvedValue({
      id: "analysis-pdf-1"
    });
    getUserAnalysesMock.mockResolvedValue([]);
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

  it("retourne les donnees brutes de Document AI", async () => {
    const formData = new FormData();
    formData.append("file", createFile("liasse.pdf", "application/pdf", "fake-pdf-content"));

    const response = await POST(createRequest(formData));
    const payload = (await response.json()) as {
      success: boolean;
      rawText: string;
      pages: unknown[];
      entities: unknown[];
      tables: unknown[];
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      rawText: "Extracted text",
      pages: [{ pageNumber: 1 }],
      entities: [{ type: "amount" }],
      tables: [{ headerRows: [] }],
      detectedSections: {
        incomeStatement: true,
        balanceSheet: true
      },
      financialData: {
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
      quantisData: {
        ca: 300,
        totalCharges: 400,
        netResult: -100,
        totalAssets: 1000,
        equity: 600,
        debts: 400
      },
      persistence: {
        saved: true,
        analysisId: "analysis-pdf-1",
        warning: null
      }
    });
    expect(processPdfWithDocumentAIMock).toHaveBeenCalledTimes(1);
    expect(detectFinancialSectionsMock).toHaveBeenCalledTimes(1);
    expect(extractFinancialDataMock).toHaveBeenCalledTimes(1);
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
        rawText: "Extracted text"
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
});

describe("GET /api/pdf-parser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({
      uid: "user-1"
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
    expect(getUserAnalysesMock).toHaveBeenCalledWith("user-1");
  });
});

function createRequest(
  formData?: FormData,
  options?: {
    withAuth?: boolean;
  }
): NextRequest {
  const withAuth = options?.withAuth ?? true;
  return new NextRequest("http://localhost:3000/api/pdf-parser", {
    method: formData ? "POST" : "GET",
    headers: withAuth ? { Authorization: "Bearer token-123" } : undefined,
    body: formData
  });
}

function createFile(name: string, mimeType: string, content: string): File {
  return new File([content], name, { type: mimeType });
}
