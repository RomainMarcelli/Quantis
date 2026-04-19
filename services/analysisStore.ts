// File: services/analysisStore.ts
// Role: gere la persistance Firestore des analyses (creation, lecture, suppression, gestion de dossiers).
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
  updateDoc,
  where
} from "firebase/firestore";
import { firestoreDb } from "@/lib/firebase";
import { applyHistoricalKpiCorrections } from "@/services/kpiHistoryEngine";
import type { AnalysisDraft, AnalysisRecord, MappedFinancialData } from "@/types/analysis";

const COLLECTION = "analyses";

const EMPTY_MAPPED_DATA: MappedFinancialData = {
  immob_incorp: null,
  immob_corp: null,
  immob_fin: null,
  total_actif_immo: null,
  total_actif_immo_brut: null,
  total_actif_immo_net: null,
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
  ebe: null,
  marge_ebitda: null,
  charges_var: null,
  mscv: null,
  tmscv: null,
  ca: null,
  charges_fixes: null,
  point_mort: null,
  ratio_immo: null,
  ratio_immo_usure: null,
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
  disponibilites: null,
  roce: null,
  roe: null,
  effet_levier: null,
  resultat_net: null,
  grossMarginRate: null,
  netProfit: null,
  workingCapital: null,
  monthlyBurnRate: null,
  cashRunwayMonths: null,
  capacite_remboursement_annees: null,
  etat_materiel_indice: null,
  healthScore: null
};

const EMPTY_QUANTIS_SCORE: NonNullable<AnalysisRecord["quantisScore"]> = {
  quantis_score: 50,
  piliers: {
    rentabilite: 50,
    solvabilite: 50,
    liquidite: 50,
    efficacite: 50
  },
  alerte_investissement: false
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
  const sortedByCreatedAt = analyses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return applyHistoricalKpiCorrections(sortedByCreatedAt);
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

// Supprime une analyse precise si elle appartient bien a l'utilisateur courant.
export async function deleteUserAnalysisById(
  userId: string,
  analysisId: string
): Promise<boolean> {
  const analysis = await getUserAnalysisById(userId, analysisId);
  if (!analysis) {
    return false;
  }

  await deleteDoc(doc(firestoreDb, COLLECTION, analysisId));
  return true;
}

// Deplace toutes les analyses d'un dossier vers un autre en recreant les documents.
// Cette approche reste compatible avec les regles Firestore actuelles (update interdit).
export async function renameUserFolder(
  userId: string,
  previousFolderName: string,
  nextFolderName: string
): Promise<AnalysisRecord[]> {
  const trimmedNextFolderName = nextFolderName.trim();
  if (!trimmedNextFolderName) {
    return [];
  }

  const analyses = await listUserAnalyses(userId);
  const analysesToMove = analyses.filter((analysis) =>
    isSameFolderName(analysis.folderName, previousFolderName)
  );

  if (!analysesToMove.length) {
    return [];
  }

  const collectionRef = collection(firestoreDb, COLLECTION);
  const movedAnalyses: AnalysisRecord[] = [];

  for (const analysis of analysesToMove) {
    const createdAtDate = new Date(analysis.createdAt);
    const payload = {
      userId: analysis.userId,
      folderName: trimmedNextFolderName,
      createdAt: Number.isNaN(createdAtDate.getTime())
        ? serverTimestamp()
        : Timestamp.fromDate(createdAtDate),
      fiscalYear: analysis.fiscalYear,
      sourceFiles: analysis.sourceFiles,
      parsedData: analysis.parsedData,
      rawData: analysis.rawData,
      mappedData: analysis.mappedData,
      financialFacts: analysis.financialFacts,
      kpis: analysis.kpis
    };

    const newDocRef = await addDoc(collectionRef, payload);
    await deleteDoc(doc(firestoreDb, COLLECTION, analysis.id));

    movedAnalyses.push({
      ...analysis,
      id: newDocRef.id,
      folderName: trimmedNextFolderName
    });
  }

  return movedAnalyses;
}

// Supprime toutes les analyses d'un dossier utilisateur.
export async function deleteUserFolderAnalyses(userId: string, folderName: string): Promise<number> {
  const analyses = await listUserAnalyses(userId);
  const analysesToDelete = analyses.filter((analysis) =>
    isSameFolderName(analysis.folderName, folderName)
  );

  await Promise.all(
    analysesToDelete.map((analysis) => deleteDoc(doc(firestoreDb, COLLECTION, analysis.id)))
  );

  return analysesToDelete.length;
}

function isSameFolderName(leftFolderName: string, rightFolderName: string): boolean {
  return leftFolderName.trim().toLowerCase() === rightFolderName.trim().toLowerCase();
}

function toAnalysisRecord(id: string, data: Record<string, unknown>): AnalysisRecord {
  const createdAt =
    data.createdAt instanceof Timestamp
      ? data.createdAt.toDate().toISOString()
      : new Date().toISOString();

  return {
    id,
    userId: String(data.userId ?? ""),
    folderName: String(data.folderName ?? "Dossier principal"),
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
        ? { ...EMPTY_MAPPED_DATA, ...(data.mappedData as Partial<AnalysisRecord["mappedData"]>) }
        : { ...EMPTY_MAPPED_DATA },
    financialFacts:
      data.financialFacts && typeof data.financialFacts === "object"
        ? { ...EMPTY_FINANCIAL_FACTS, ...(data.financialFacts as Partial<AnalysisRecord["financialFacts"]>) }
        : { ...EMPTY_FINANCIAL_FACTS },
    kpis:
      data.kpis && typeof data.kpis === "object"
        ? { ...EMPTY_KPIS, ...(data.kpis as Partial<AnalysisRecord["kpis"]>) }
        : { ...EMPTY_KPIS },
    quantisScore:
      data.quantisScore && typeof data.quantisScore === "object"
        ? {
            ...EMPTY_QUANTIS_SCORE,
            ...(data.quantisScore as Partial<NonNullable<AnalysisRecord["quantisScore"]>>),
            piliers: {
              ...EMPTY_QUANTIS_SCORE.piliers,
              ...((data.quantisScore as { piliers?: Partial<NonNullable<AnalysisRecord["quantisScore"]>["piliers"]> })
                .piliers ?? {})
            }
          }
        : null,
    uploadContext:
      data.uploadContext && typeof data.uploadContext === "object"
        ? {
            companySize: toNullableString((data.uploadContext as { companySize?: unknown }).companySize),
            sector: toNullableString((data.uploadContext as { sector?: unknown }).sector),
            source: resolveUploadSource((data.uploadContext as { source?: unknown }).source)
          }
        : null,
    parserVersion: data.parserVersion === "v2" ? "v2" : "v1",
    pdfType: (data.pdfType === "scanned_text" || data.pdfType === "image_only") ? data.pdfType : "native_text"
  };
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function resolveUploadSource(
  value: unknown
): NonNullable<NonNullable<AnalysisRecord["uploadContext"]>["source"]> {
  if (value === "dashboard" || value === "analysis" || value === "upload" || value === "manual") {
    return value;
  }
  return "dashboard";
}

export async function moveAnalysisToFolder(
  userId: string,
  analysisId: string,
  targetFolderName: string
): Promise<void> {
  const analysisRef = doc(firestoreDb, COLLECTION, analysisId);
  const snapshot = await getDoc(analysisRef);
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  if (String(data.userId ?? "") !== userId) return;
  await updateDoc(analysisRef, { folderName: targetFolderName.trim() });
}
