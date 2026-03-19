import {
  type QueryConstraint,
  Timestamp,
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";
import { firestoreDb } from "@/lib/firebase";
import type { AnalysisDraft, AnalysisRecord } from "@/types/analysis";

const COLLECTION = "analyses";

export async function saveAnalysisDraft(analysisDraft: AnalysisDraft): Promise<AnalysisRecord> {
  const collectionRef = collection(firestoreDb, COLLECTION);
  const payload = {
    ...analysisDraft,
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collectionRef, payload);

  return {
    ...analysisDraft,
    id: docRef.id
  };
}

export async function listUserAnalyses(userId: string, fiscalYear?: number): Promise<AnalysisRecord[]> {
  const collectionRef = collection(firestoreDb, COLLECTION);

  const constraints: QueryConstraint[] = [where("userId", "==", userId)];
  if (typeof fiscalYear === "number") {
    constraints.push(where("fiscalYear", "==", fiscalYear));
  }

  const snapshot = await getDocs(query(collectionRef, ...constraints));

  const analyses = snapshot.docs.map((doc) => {
    const data = doc.data();
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : new Date().toISOString();

    return {
      id: doc.id,
      userId: String(data.userId ?? ""),
      createdAt,
      fiscalYear: typeof data.fiscalYear === "number" ? data.fiscalYear : null,
      sourceFiles: Array.isArray(data.sourceFiles) ? (data.sourceFiles as AnalysisRecord["sourceFiles"]) : [],
      parsedData: Array.isArray(data.parsedData) ? (data.parsedData as AnalysisRecord["parsedData"]) : [],
      financialFacts:
        data.financialFacts && typeof data.financialFacts === "object"
          ? (data.financialFacts as AnalysisRecord["financialFacts"])
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
        data.kpis && typeof data.kpis === "object"
          ? (data.kpis as AnalysisRecord["kpis"])
          : {
              grossMarginRate: null,
              netProfit: null,
              workingCapital: null,
              monthlyBurnRate: null,
              cashRunwayMonths: null,
              healthScore: null
      }
    };
  });

  return analyses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
