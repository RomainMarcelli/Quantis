import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedFinancialData } from "@/services/pdfAnalysis";

const {
  addMock,
  getMock,
  orderByMock,
  analysesCollectionMock,
  userDocMock,
  usersCollectionMock,
  firestoreMock
} = vi.hoisted(() => {
  const addMock = vi.fn();
  const getMock = vi.fn();
  const orderByMock = vi.fn();
  const analysesCollectionMock = {
    add: addMock,
    orderBy: orderByMock
  };
  const userDocMock = {
    collection: vi.fn()
  };
  const usersCollectionMock = {
    doc: vi.fn()
  };
  const firestoreMock = {
    collection: vi.fn()
  };
  return {
    addMock,
    getMock,
    orderByMock,
    analysesCollectionMock,
    userDocMock,
    usersCollectionMock,
    firestoreMock
  };
});

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getFirebaseAdminFirestore: () => firestoreMock
}));

import { getUserAnalyses, saveAnalysis } from "@/services/pdfAnalysisStore";

describe("pdfAnalysisStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    firestoreMock.collection.mockReturnValue(usersCollectionMock);
    usersCollectionMock.doc.mockReturnValue(userDocMock);
    userDocMock.collection.mockReturnValue(analysesCollectionMock);
    orderByMock.mockReturnValue({
      get: getMock
    });
  });

  it("saveAnalysis enregistre une analyse sous users/{userId}/analyses", async () => {
    addMock.mockResolvedValueOnce({
      id: "analysis-123"
    });

    const saved = await saveAnalysis(
      "user-42",
      {
        ca: 1200000,
        totalCharges: 900000,
        netResult: 300000,
        totalAssets: 5000000,
        equity: 2000000,
        debts: 3000000
      },
      {
        rawText: "raw text",
        confidenceScore: 0.8,
        warnings: ["Resultat net non trouve."],
        detectedSections: {
          incomeStatement: true,
          balanceSheet: true
        },
        financialData: createFinancialData({
          incomeStatement: {
            netTurnover: 1200000,
            totalCharges: 900000,
            netResult: 300000,
            revenue: 700000,
            production: 500000
          },
          balanceSheet: {
            totalAssets: 5000000,
            equity: 2000000,
            debts: 3000000
          }
        })
      }
    );

    expect(saved.id).toBe("analysis-123");
    expect(firestoreMock.collection).toHaveBeenCalledWith("users");
    expect(usersCollectionMock.doc).toHaveBeenCalledWith("user-42");
    expect(userDocMock.collection).toHaveBeenCalledWith("analyses");
    expect(addMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "pdf",
        quantisData: expect.objectContaining({
          ca: 1200000
        }),
        rawData: expect.objectContaining({
          rawText: "raw text"
        })
      })
    );
  });

  it("getUserAnalyses retourne les analyses triees et normalisees", async () => {
    getMock.mockResolvedValueOnce({
      docs: [
        {
          id: "analysis-1",
          data: () => ({
            createdAt: Timestamp.fromDate(new Date("2026-04-08T10:00:00.000Z")),
            source: "pdf",
            quantisData: {
              ca: 1000,
              totalCharges: 700,
              netResult: 300,
              totalAssets: 5000,
              equity: 2000,
              debts: 3000
            },
            rawData: {
              rawText: "raw",
              confidenceScore: 0.75,
              warnings: ["Bilan incomplet."],
              detectedSections: {
                incomeStatement: true,
                balanceSheet: true
              },
              financialData: createFinancialData({
                incomeStatement: {
                  netTurnover: 1000,
                  totalCharges: 700,
                  netResult: 300,
                  revenue: 600,
                  production: 400
                },
                balanceSheet: {
                  totalAssets: 5000,
                  equity: 2000,
                  debts: 3000
                }
              })
            }
          })
        }
      ]
    });

    const result = await getUserAnalyses("user-42");

    expect(orderByMock).toHaveBeenCalledWith("createdAt", "desc");
    expect(result).toEqual([
      {
        id: "analysis-1",
        createdAt: "2026-04-08T10:00:00.000Z",
        source: "pdf",
        quantisData: {
          ca: 1000,
          totalCharges: 700,
          netResult: 300,
          totalAssets: 5000,
          equity: 2000,
          debts: 3000
        },
        rawData: {
          rawText: "raw",
          confidenceScore: 0.75,
          warnings: ["Bilan incomplet."],
          detectedSections: {
            incomeStatement: true,
            balanceSheet: true
          },
          financialData: expect.objectContaining({
            incomeStatement: expect.objectContaining({
              netTurnover: 1000,
              totalCharges: 700,
              netResult: 300
            }),
            balanceSheet: expect.objectContaining({
              totalAssets: 5000,
              equity: 2000,
              debts: 3000
            })
          })
        }
      }
    ]);
  });
});

function createFinancialData(overrides?: {
  incomeStatement?: Partial<ParsedFinancialData["incomeStatement"]>;
  balanceSheet?: Partial<ParsedFinancialData["balanceSheet"]>;
}): ParsedFinancialData {
  const base: ParsedFinancialData = {
    incomeStatement: {
      salesGoods: null,
      productionSoldGoods: null,
      productionSoldServices: null,
      productionSold: null,
      netTurnover: null,
      totalOperatingProducts: null,
      totalOperatingCharges: null,
      operatingResult: null,
      financialResult: null,
      ordinaryResultBeforeTax: null,
      exceptionalResult: null,
      totalProducts: null,
      totalCharges: null,
      netResult: null,
      revenue: null,
      production: null
    },
    balanceSheet: {
      intangibleAssets: null,
      tangibleAssets: null,
      financialAssets: null,
      totalFixedAssets: null,
      totalCurrentAssets: null,
      inventoriesGoods: null,
      tradeReceivables: null,
      otherReceivables: null,
      cashAndCashEquivalents: null,
      prepaidExpenses: null,
      totalAssets: null,
      equity: null,
      provisions: null,
      debts: null,
      tradePayables: null,
      taxSocialPayables: null,
      otherDebts: null,
      deferredIncome: null,
      totalLiabilities: null,
      totalAssetDepreciationProvisions: null,
      shortTermBankDebt: null,
      longTermBankDebt: null
    }
  };

  return {
    incomeStatement: {
      ...base.incomeStatement,
      ...overrides?.incomeStatement
    },
    balanceSheet: {
      ...base.balanceSheet,
      ...overrides?.balanceSheet
    }
  };
}
