import {
  type QueryConstraint,
  Timestamp,
  addDoc,
  doc,
  deleteDoc,
  collection,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";
import { firestoreDb } from "@/lib/firebase";
import type { AnalysisDraft, AnalysisRecord, MappedFinancialData } from "@/types/analysis";

const COLLECTION = "analyses";

const EMPTY_MAPPED_DATA: MappedFinancialData = {
  immob_incorp: null,
  immob_corp: null,
  immob_fin: null,
  total_actif_immo: null,
  stocks_mp: null,
  stocks_march: null,
  total_stocks: null,
  avances_vers_actif: null,
  clients: null,
  autres_creances: null,
  creances: null,
  vmp: null,
  dispo: null,
  cca: null,
  total_actif_circ: null,
  total_actif: null,
  capital: null,
  ecarts_reeval: null,
  reserve_legale: null,
  reserves_reglem: null,
  autres_reserves: null,
  ran: null,
  res_net: null,
  subv_invest: null,
  prov_reglem: null,
  total_cp: null,
  total_prov: null,
  emprunts: null,
  avances_recues_passif: null,
  fournisseurs: null,
  dettes_fisc_soc: null,
  cca_passif: null,
  autres_dettes: null,
  pca: null,
  total_dettes: null,
  total_passif: null,
  ventes_march: null,
  prod_biens: null,
  prod_serv: null,
  prod_vendue: null,
  prod_stockee: null,
  prod_immo: null,
  subv_expl: null,
  autres_prod_expl: null,
  total_prod_expl: null,
  achats_march: null,
  var_stock_march: null,
  achats_mp: null,
  var_stock_mp: null,
  ace: null,
  impots_taxes: null,
  salaires: null,
  charges_soc: null,
  dap: null,
  dprov: null,
  autres_charges_expl: null,
  total_charges_expl: null,
  ebit: null,
  prod_fin: null,
  charges_fin: null,
  prod_excep: null,
  charges_excep: null,
  is_impot: null,
  resultat_exercice: null,
  ca_n_minus_1: null,
  n: null,
  delta_bfr: null
};

const EMPTY_FINANCIAL_FACTS: AnalysisRecord["financialFacts"] = {
  revenue: null,
  expenses: null,
  payroll: null,
  treasury: null,
  receivables: null,
  payables: null,
  inventory: null
};

const EMPTY_KPIS: AnalysisRecord["kpis"] = {
  tcam: null,
  va: null,
  ebitda: null,
  marge_ebitda: null,
  charges_var: null,
  mscv: null,
  tmscv: null,
  charges_fixes: null,
  point_mort: null,
  ratio_immo: null,
  bfr: null,
  rot_bfr: null,
  dso: null,
  dpo: null,
  rot_stocks: null,
  caf: null,
  fte: null,
  tn: null,
  solvabilite: null,
  gearing: null,
  liq_gen: null,
  liq_red: null,
  liq_imm: null,
  roce: null,
  roe: null,
  effet_levier: null,
  grossMarginRate: null,
  netProfit: null,
  workingCapital: null,
  monthlyBurnRate: null,
  cashRunwayMonths: null,
  healthScore: null
};

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
  const analyses = snapshot.docs.map((docSnapshot) => toAnalysisRecord(docSnapshot.id, docSnapshot.data()));

  return analyses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getUserAnalysisById(
  userId: string,
  analysisId: string
): Promise<AnalysisRecord | null> {
  const analysisRef = doc(firestoreDb, COLLECTION, analysisId);
  const snapshot = await getDoc(analysisRef);

  if (!snapshot.exists()) {
    return null;
  }

  const analysis = toAnalysisRecord(snapshot.id, snapshot.data());
  if (analysis.userId !== userId) {
    return null;
  }

  return analysis;
}

export async function deleteUserAnalyses(userId: string): Promise<number> {
  const collectionRef = collection(firestoreDb, COLLECTION);
  const snapshot = await getDocs(query(collectionRef, where("userId", "==", userId)));

  await Promise.all(snapshot.docs.map((docSnapshot) => deleteDoc(docSnapshot.ref)));
  return snapshot.docs.length;
}

function toAnalysisRecord(id: string, data: Record<string, unknown>): AnalysisRecord {
  const createdAt =
    data.createdAt instanceof Timestamp
      ? data.createdAt.toDate().toISOString()
      : new Date().toISOString();

  return {
    id,
    userId: String(data.userId ?? ""),
    createdAt,
    fiscalYear: typeof data.fiscalYear === "number" ? data.fiscalYear : null,
    sourceFiles: Array.isArray(data.sourceFiles)
      ? (data.sourceFiles as AnalysisRecord["sourceFiles"])
      : [],
    parsedData: Array.isArray(data.parsedData)
      ? (data.parsedData as AnalysisRecord["parsedData"])
      : [],
    rawData:
      data.rawData && typeof data.rawData === "object"
        ? (data.rawData as AnalysisRecord["rawData"])
        : {
            byVariableCode: {},
            byLineCode: {},
            byLabel: {}
          },
    mappedData:
      data.mappedData && typeof data.mappedData === "object"
        ? (data.mappedData as AnalysisRecord["mappedData"])
        : { ...EMPTY_MAPPED_DATA },
    financialFacts:
      data.financialFacts && typeof data.financialFacts === "object"
        ? (data.financialFacts as AnalysisRecord["financialFacts"])
        : EMPTY_FINANCIAL_FACTS,
    kpis: data.kpis && typeof data.kpis === "object" ? (data.kpis as AnalysisRecord["kpis"]) : EMPTY_KPIS
  };
}
