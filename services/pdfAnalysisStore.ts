import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import type { VyzorFinancialData } from "@/services/financialMapping";
import {
  createEmptyParsedFinancialData,
  type DetectedFinancialSections,
  type ParsedFinancialData
} from "@/services/pdfAnalysis";
import {
  createEmptyMappedFinancialData
} from "@/services/mapping/financialDataMapper";
import type { CalculatedKpis, MappedFinancialData } from "@/types/analysis";

export type SavedPdfAnalysisRawData = {
  financialData: ParsedFinancialData;
  mappedData?: MappedFinancialData;
  kpis?: CalculatedKpis;
  detectedSections: DetectedFinancialSections;
  rawText: string;
  confidenceScore: number;
  warnings: string[];
};

export type SavedPdfAnalysisRecord = {
  id: string;
  createdAt: string;
  source: "pdf";
  quantisData: VyzorFinancialData;
  rawData: SavedPdfAnalysisRawData;
};

type PersistedPdfAnalysis = {
  createdAt: Timestamp | FieldValue;
  source: "pdf";
  quantisData: VyzorFinancialData;
  rawData: SavedPdfAnalysisRawData;
};

export async function saveAnalysis(
  userId: string,
  data: VyzorFinancialData,
  rawData: SavedPdfAnalysisRawData
): Promise<{ id: string }> {
  const firestore = getFirebaseAdminFirestore();
  const payload: PersistedPdfAnalysis = {
    createdAt: FieldValue.serverTimestamp(),
    source: "pdf",
    quantisData: data,
    rawData
  };

  const docRef = await firestore.collection("users").doc(userId).collection("analyses").add(payload);
  return { id: docRef.id };
}

export async function getUserAnalyses(userId: string): Promise<SavedPdfAnalysisRecord[]> {
  const firestore = getFirebaseAdminFirestore();
  const snapshot = await firestore
    .collection("users")
    .doc(userId)
    .collection("analyses")
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((docSnapshot) => toSavedPdfAnalysisRecord(docSnapshot.id, docSnapshot.data()));
}

function toSavedPdfAnalysisRecord(
  id: string,
  data: Partial<PersistedPdfAnalysis>
): SavedPdfAnalysisRecord {
  const createdAt =
    data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date().toISOString();

  return {
    id,
    createdAt,
    source: "pdf",
    quantisData:
      data.quantisData && typeof data.quantisData === "object"
        ? {
            ca: toNullableNumber(data.quantisData.ca),
            totalCharges: toNullableNumber(data.quantisData.totalCharges),
            netResult: toNullableNumber(data.quantisData.netResult),
            totalAssets: toNullableNumber(data.quantisData.totalAssets),
            equity: toNullableNumber(data.quantisData.equity),
            debts: toNullableNumber(data.quantisData.debts)
          }
        : {
            ca: null,
            totalCharges: null,
            netResult: null,
            totalAssets: null,
            equity: null,
            debts: null
          },
    rawData:
      data.rawData && typeof data.rawData === "object"
        ? {
            financialData:
              data.rawData.financialData && typeof data.rawData.financialData === "object"
                ? data.rawData.financialData
                : createEmptyFinancialData(),
            mappedData:
              data.rawData.mappedData && typeof data.rawData.mappedData === "object"
                ? { ...createEmptyMappedFinancialData(), ...data.rawData.mappedData }
                : createEmptyMappedFinancialData(),
            kpis:
              data.rawData.kpis && typeof data.rawData.kpis === "object"
                ? data.rawData.kpis
                : undefined,
            detectedSections:
              data.rawData.detectedSections && typeof data.rawData.detectedSections === "object"
                ? {
                    incomeStatement: Boolean(data.rawData.detectedSections.incomeStatement),
                    balanceSheet: Boolean(data.rawData.detectedSections.balanceSheet)
                  }
                : {
                    incomeStatement: false,
                    balanceSheet: false
                  },
            rawText: typeof data.rawData.rawText === "string" ? data.rawData.rawText : "",
            confidenceScore: toConfidenceScore(data.rawData.confidenceScore),
            warnings: Array.isArray(data.rawData.warnings)
              ? data.rawData.warnings.filter((warning): warning is string => typeof warning === "string")
              : []
          }
        : {
            financialData: createEmptyFinancialData(),
            mappedData: createEmptyMappedFinancialData(),
            detectedSections: {
              incomeStatement: false,
              balanceSheet: false
            },
            rawText: "",
            confidenceScore: 0,
            warnings: []
          }
  };
}

function createEmptyFinancialData(): ParsedFinancialData {
  return createEmptyParsedFinancialData();
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toConfidenceScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return Number(value.toFixed(2));
}
