import { Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebaseAdmin";
import type { AnalysisRecord, NewAnalysisRecord } from "@/types/analysis";

const COLLECTION = "analyses";

export async function saveAnalysis(record: NewAnalysisRecord): Promise<AnalysisRecord> {
  const db = getAdminFirestore();
  const ref = db.collection(COLLECTION).doc();

  await ref.set({
    ...record,
    createdAt: Timestamp.fromDate(new Date(record.createdAt))
  });

  return {
    ...record,
    id: ref.id
  };
}

export async function listAnalysesByUser(userId: string, fiscalYear?: number): Promise<AnalysisRecord[]> {
  const db = getAdminFirestore();
  const snapshot = await db.collection(COLLECTION).where("userId", "==", userId).get();

  const records = snapshot.docs.map((doc) => {
    const data = doc.data();
    return toAnalysisRecord(doc.id, data);
  });

  const filteredByYear =
    typeof fiscalYear === "number" ? records.filter((record) => record.fiscalYear === fiscalYear) : records;

  return filteredByYear.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAnalysisById(id: string): Promise<AnalysisRecord | null> {
  const db = getAdminFirestore();
  const snapshot = await db.collection(COLLECTION).doc(id).get();

  if (!snapshot.exists) {
    return null;
  }

  return toAnalysisRecord(snapshot.id, snapshot.data() ?? {});
}

function toAnalysisRecord(id: string, raw: Record<string, unknown>): AnalysisRecord {
  const createdAtField = raw.createdAt;
  const createdAt =
    createdAtField instanceof Timestamp ? createdAtField.toDate().toISOString() : String(raw.createdAt ?? new Date().toISOString());

  return {
    id,
    userId: String(raw.userId ?? ""),
    createdAt,
    fiscalYear: typeof raw.fiscalYear === "number" ? raw.fiscalYear : null,
    sourceFiles: Array.isArray(raw.sourceFiles) ? (raw.sourceFiles as AnalysisRecord["sourceFiles"]) : [],
    parsedData: Array.isArray(raw.parsedData) ? (raw.parsedData as AnalysisRecord["parsedData"]) : [],
    financialFacts:
      raw.financialFacts && typeof raw.financialFacts === "object"
        ? (raw.financialFacts as AnalysisRecord["financialFacts"])
        : {
            revenue: null,
            expenses: null,
            payroll: null,
            treasury: null,
            receivables: null,
            payables: null,
            inventory: null
          },
    kpis:
      raw.kpis && typeof raw.kpis === "object"
        ? (raw.kpis as AnalysisRecord["kpis"])
        : {
            grossMarginRate: null,
            netProfit: null,
            workingCapital: null,
            monthlyBurnRate: null,
            cashRunwayMonths: null,
            healthScore: null
          }
  };
}
