// File: components/analysis/AnalysisDetailView.tsx
// Role: assemble la page /analysis (et /analysis/[id]) avec dashboard premium, dossiers, upload et debug.
"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  Bot,
  Folder,
  LayoutDashboard,
  Pencil,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  DashboardFinancialTestMenu,
  type DashboardTestTabId
} from "@/components/dashboard/navigation/DashboardFinancialTestMenu";
import { DashboardFinancialTestContent } from "@/components/dashboard/navigation/DashboardFinancialTestContent";
import { clearLocalAnalysisHint, setLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import {
  DEFAULT_FOLDER_NAME,
  ensureFolderName,
  getActiveFolderName,
  getKnownFolderNames,
  removeKnownFolderName,
  renameKnownFolderName,
  registerKnownFolderName,
  setActiveFolderName
} from "@/lib/folders/activeFolder";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useDelayedFlag } from "@/lib/ui/useDelayedFlag";
import {
  buildSyntheseYearOptions,
  filterAnalysesByYear,
  SYNTHESIS_CURRENT_YEAR_KEY
} from "@/lib/synthese/synthesePeriod";
import {
  deleteUserAnalysisById,
  deleteUserFolderAnalyses,
  getUserAnalysisById,
  listUserAnalyses,
  renameUserFolder,
  saveAnalysisDraft
} from "@/services/analysisStore";
import { findPreviousAnalysisByFiscalYear } from "@/services/analysisHistory";
import {
  createUserFolder,
  deleteUserFoldersByName,
  listUserFolders,
  renameUserFoldersByName
} from "@/services/folderStore";
import { firebaseAuthGateway } from "@/services/auth";
import { persistPendingAnalysisForUser } from "@/services/pendingAnalysisSync";
import { getUserProfile } from "@/services/userProfileStore";
import { useTemporality } from "@/lib/temporality/temporalityContext";
import { recomputeKpisForPeriod } from "@/lib/temporality/recomputeKpisForPeriod";
import { computePreviousPeriod } from "@/lib/temporality/computePreviousPeriod";
import { computeAvailableRange, shouldShowTemporalityBar } from "@/lib/temporality/availableRange";
import { TemporalityBar } from "@/components/temporality/TemporalityBar";
import { SourceBadge } from "@/components/analysis/SourceBadge";
import { resolveActiveAnalysis } from "@/lib/source/activeSource";
import { useActiveAnalysisId } from "@/lib/source/useActiveAnalysisId";
import type { AnalysisDraft, AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";
import {
  consumeSearchTarget,
  routeMatchesPath,
  SEARCH_NAVIGATE_EVENT,
  scrollToSearchTarget,
  type SearchNavigationTarget,
  type SearchRoute
} from "@/lib/search/globalSearch";
import {
  readSidebarCollapsedPreference,
  writeSidebarCollapsedPreference
} from "@/lib/ui/sidebarPreference";
import { exportAnalysisDataAsJson } from "@/lib/export/exportAnalysisData";
import { downloadFinancialReport } from "@/lib/reports/downloadFinancialReport";
import { useAiChat } from "@/components/ai/AiChatProvider";
import { useBridgeStatus } from "@/lib/banking/useBridgeStatus";

type AnalysisDetailViewProps = {
  analysisId?: string;
  viewMode?: "analysis" | "documents";
};

type FolderFileItem = {
  analysisId: string;
  folderName: string;
  name: string;
  createdAt: string;
};

type FolderDialogMode = "create" | "rename" | "delete" | null;

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".pdf"];
const DEFAULT_ANALYSIS_TAB: DashboardTestTabId = "creation-valeur";

export function AnalysisDetailView({ analysisId, viewMode = "analysis" }: AnalysisDetailViewProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentCalendarYear = new Date().getFullYear();
  const isDocumentsView = viewMode === "documents";

  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<AnalysisRecord[]>([]);

  // Pousse l'analyse courante au provider du chat IA — permet au backend
  // d'enrichir les réponses Claude avec les données réelles (kpis, mappedData)
  // sans que chaque tooltip ait à passer l'analysisId à la main.
  const { setAnalysisContext } = useAiChat();
  useEffect(() => {
    setAnalysisContext(analysis?.id ?? null);
    return () => setAnalysisContext(null);
  }, [analysis?.id, setAnalysisContext]);

  // L'onglet Trésorerie n'apparaît que si :
  //  - une connexion Bridge active existe (useBridgeStatus polle /status)
  //  - OU l'analyse courante porte un bankingSummary (résultat d'un sync
  //    précédent attaché à cette analyse, même si la connexion vient d'être
  //    supprimée — l'historique reste exploitable).
  const bridgeStatus = useBridgeStatus();
  // Fallback summary : si l'analyse courante n'a pas de bankingSummary
  // attaché (cas typique : sync standalone effectué depuis Documents sans
  // analysisId), on récupère celui de banking_summaries/{userId} via le
  // status endpoint.
  const bankingSummary =
    analysis?.bankingSummary ?? bridgeStatus.status?.summary ?? null;
  const showTresorerie = Boolean(bridgeStatus.status?.connected) || bankingSummary !== null;

  // L'onglet principal "Création de valeur" est affiché par défaut sur /analysis.
  const [activeDashboardTab, setActiveDashboardTab] = useState<DashboardTestTabId>(DEFAULT_ANALYSIS_TAB);
  // Le select du menu pilote l'année d'analyse affichée dans le dashboard.
  const [selectedDashboardYear, setSelectedDashboardYear] = useState<string>("");
  const [currentFolder, setCurrentFolder] = useState<string>(getActiveFolderName() ?? DEFAULT_FOLDER_NAME);
  const [knownFolders, setKnownFolders] = useState<string[]>(() => getKnownFolderNames());
  const [greetingName, setGreetingName] = useState("Utilisateur");
  const [companyName, setCompanyName] = useState("Quantis");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  // Loader visible uniquement si le chargement dépasse 400 ms (cf. hook).
  const showAnalysisLoader = useDelayedFlag(loadingAnalysis);
  const [uploading, setUploading] = useState(false);
  const [folderActionName, setFolderActionName] = useState<string | null>(null);
  const [folderDialogMode, setFolderDialogMode] = useState<FolderDialogMode>(null);
  const [folderDialogName, setFolderDialogName] = useState("");
  const [folderDialogTargetName, setFolderDialogTargetName] = useState<string | null>(null);
  const [folderDialogSubmitting, setFolderDialogSubmitting] = useState(false);
  // Etat de selection multiple pour la suppression groupee de fichiers sources.
  const [selectedSourceFileKeys, setSelectedSourceFileKeys] = useState<string[]>([]);
  // Etat de confirmation pour la suppression de fichiers (simple ou multiple).
  const [pendingSourceFilesDeletion, setPendingSourceFilesDeletion] = useState<FolderFileItem[]>([]);
  const [sourceFilesDeletionSubmitting, setSourceFilesDeletionSubmitting] = useState(false);
  const [fileActionKey, setFileActionKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarPreferenceReady, setIsSidebarPreferenceReady] = useState(false);
  const [pendingSearchTarget, setPendingSearchTarget] = useState<SearchNavigationTarget | null>(null);

  useEffect(() => {
    // Les messages de succes sont temporaires pour eviter d'encombrer l'ecran.
    if (!infoMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setInfoMessage(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [infoMessage]);

  useEffect(() => {
    setIsSidebarCollapsed(readSidebarCollapsedPreference());
    setIsSidebarPreferenceReady(true);
  }, []);

  useEffect(() => {
    if (!isSidebarPreferenceReady) {
      return;
    }
    writeSidebarCollapsedPreference(isSidebarCollapsed);
  }, [isSidebarCollapsed, isSidebarPreferenceReady]);

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((nextUser) => {
      if (!nextUser) {
        setUser(null);
        setLoadingAuth(false);
        router.replace("/login");
        return;
      }

      if (!nextUser.emailVerified) {
        void firebaseAuthGateway.signOut();
        setUser(null);
        setLoadingAuth(false);
        router.replace("/login");
        return;
      }

      setUser(nextUser);
      setLoadingAuth(false);
    });

    return unsubscribe;
  }, [router]);

  // Source active globale (localStorage `quantis.activeAnalysis`). Mise à jour
  // par le bouton "Synchroniser et activer" du panneau de connexions et par
  // "Utiliser comme source active" sur les cards de /documents. Si l'URL ne
  // pointe pas explicitement sur une analyse (analysisId dans la prop), on
  // se base dessus pour résoudre quelle analyse afficher dans le tableau de
  // bord. Sans ça, /analysis restait coincé sur la première analyse de
  // l'historique même après changement de source côté Synthèse.
  const activeAnalysisIdFromStorage = useActiveAnalysisId();

  useEffect(() => {
    if (!user) {
      return;
    }

    // Priorité 1 : l'analysisId explicite venant de l'URL (/analysis/{id}).
    // Priorité 2 : l'analyse marquée active dans localStorage.
    // Priorité 3 (fallback dans loadDashboardData) : dossier actif → history[0].
    const target = analysisId ?? activeAnalysisIdFromStorage ?? undefined;
    void loadDashboardData(user, target);
  }, [user, analysisId, activeAnalysisIdFromStorage]);

  useEffect(() => {
    if (currentFolder.trim()) {
      setActiveFolderName(currentFolder);
      setKnownFolders(registerKnownFolderName(currentFolder));
    }
  }, [currentFolder]);

  useEffect(() => {
    // Les dossiers deja utilises dans l'historique sont memorises localement
    // pour permettre de jongler entre plusieurs dossiers, meme avant nouvel upload.
    if (!allAnalyses.length) {
      return;
    }

    allAnalyses.forEach((item) => registerKnownFolderName(item.folderName));
    setKnownFolders(getKnownFolderNames());
  }, [allAnalyses]);

  useEffect(() => {
    const initialTarget = consumeSearchTarget();
    if (initialTarget) {
      setPendingSearchTarget(initialTarget);
    }

    const onSearchNavigate = (event: Event) => {
      const detail = (event as CustomEvent<SearchNavigationTarget>).detail;
      if (!detail) {
        return;
      }
      setPendingSearchTarget(detail);
    };

    window.addEventListener(SEARCH_NAVIGATE_EVENT, onSearchNavigate as EventListener);
    return () => window.removeEventListener(SEARCH_NAVIGATE_EVENT, onSearchNavigate as EventListener);
  }, []);

  const dashboardYearOptions = useMemo(
    () => buildSyntheseYearOptions(allAnalyses, currentCalendarYear),
    [allAnalyses, currentCalendarYear]
  );

  const analysesFilteredByYear = useMemo(
    () => filterAnalysesByYear(allAnalyses, selectedDashboardYear, currentCalendarYear),
    [allAnalyses, selectedDashboardYear, currentCalendarYear]
  );

  const analysesInCurrentFolder = useMemo(
    () =>
      analysesFilteredByYear.filter(
        (item) => normalizeFolderName(item.folderName) === normalizeFolderName(currentFolder)
      ),
    [analysesFilteredByYear, currentFolder]
  );

  const hasNoAnalysisForSelectedYear = allAnalyses.length > 0 && analysesFilteredByYear.length === 0;
  const previousAnalysis = useMemo(
    () =>
      analysis
        ? findPreviousAnalysisByFiscalYear({
            analyses: allAnalyses,
            currentAnalysis: analysis,
            preferSameFolder: true
          })
        : null,
    [allAnalyses, analysis]
  );

  // Filtre temporel global : si l'analyse possède du dailyAccounting (source dynamique
  // Pennylane), on recalcule les KPI flow (CA, VA, EBITDA, charges…) sur la période
  // sélectionnée par la TemporalityBar. Les KPI bilan (BFR, dispo, total_cp…) restent
  // ceux du snapshot car ils sont à un instant T.
  // Source statique (PDF) : recomputeKpisForPeriod renvoie l'annuel inchangé.
  const temporality = useTemporality();
  const effectiveAnalysis = useMemo(() => {
    if (!analysis) return null;
    return recomputeKpisForPeriod(analysis, temporality.periodStart, temporality.periodEnd);
  }, [analysis, temporality.periodStart, temporality.periodEnd]);

  // KPIs de la période ANTÉRIEURE de même durée — pour la variation
  // +/-X% sur les cartes de chaque onglet du tableau de bord.
  const previousPeriodKpis = useMemo(() => {
    if (!analysis) return null;
    if (!shouldShowTemporalityBar(analysis)) return null;
    const prev = computePreviousPeriod(temporality.periodStart, temporality.periodEnd);
    if (!prev) return null;
    return recomputeKpisForPeriod(analysis, prev.periodStart, prev.periodEnd).kpis;
  }, [analysis, temporality.periodStart, temporality.periodEnd]);

  useEffect(() => {
    if (!pendingSearchTarget) {
      return;
    }

    const currentRoute: SearchRoute = isDocumentsView ? "/documents" : "/analysis";
    if (!routeMatchesPath(currentRoute, pendingSearchTarget.route)) {
      return;
    }

    // Si la recherche cible un onglet d'analyse, on l'ouvre avant d'appliquer le scroll.
    if (!isDocumentsView && pendingSearchTarget.section) {
      const targetTab =
        pendingSearchTarget.section === "cockpit"
          ? DEFAULT_ANALYSIS_TAB
          : (pendingSearchTarget.section as DashboardTestTabId);
      if (targetTab !== activeDashboardTab) {
        setActiveDashboardTab(targetTab);
        return;
      }
    }

    if (!pendingSearchTarget.refId) {
      setPendingSearchTarget(null);
      return;
    }

    void scrollToSearchTarget(pendingSearchTarget.refId, pendingSearchTarget.query).finally(() => {
      setPendingSearchTarget(null);
    });
  }, [pendingSearchTarget, isDocumentsView, activeDashboardTab, analysis?.id, loadingAnalysis]);

  useEffect(() => {
    // Le filtre d'année revient sur une valeur valide quand la liste d'options change.
    if (!dashboardYearOptions.length) {
      return;
    }

    if (!dashboardYearOptions.some((option) => option.value === selectedDashboardYear)) {
      setSelectedDashboardYear(dashboardYearOptions[0].value);
    }
  }, [dashboardYearOptions, selectedDashboardYear]);

  useEffect(() => {
    if (!allAnalyses.length) {
      return;
    }

    if (!analysesFilteredByYear.length) {
      setAnalysis(null);
      return;
    }

    if (!analysis) {
      if (analysesInCurrentFolder.length) {
        setAnalysis(analysesInCurrentFolder[0]);
        return;
      }
      // Aucune analyse dans le dossier actif → on adopte la première analyse disponible
      // ET on bascule sur son dossier (sinon le check de folder ci-dessous nullifierait
      // l'analyse au prochain render, créant une boucle setAnalysis(null) ↔ setAnalysis(...)).
      const fallback = analysesFilteredByYear[0]!;
      setAnalysis(fallback);
      if (normalizeFolderName(fallback.folderName) !== normalizeFolderName(currentFolder)) {
        setCurrentFolder(fallback.folderName);
      }
      return;
    }

    const analysisStillInSelectedYear = analysesFilteredByYear.some((item) => item.id === analysis.id);
    if (!analysisStillInSelectedYear) {
      const fallback = analysesInCurrentFolder[0] ?? analysesFilteredByYear[0] ?? null;
      setAnalysis(fallback);
      if (fallback && normalizeFolderName(fallback.folderName) !== normalizeFolderName(currentFolder)) {
        setCurrentFolder(fallback.folderName);
      }
      return;
    }

    // Folder mismatch : si le dossier actif ne contient pas l'analyse, on switch
    // le dossier au lieu de nullifier l'analyse (sinon oscillation).
    if (normalizeFolderName(analysis.folderName) !== normalizeFolderName(currentFolder)) {
      if (analysesInCurrentFolder.length) {
        setAnalysis(analysesInCurrentFolder[0]);
      } else {
        setCurrentFolder(analysis.folderName);
      }
    }
  }, [analysis, analysesFilteredByYear, analysesInCurrentFolder, allAnalyses, currentFolder]);

  useEffect(() => {
    // Lors d'un changement d'analyse, on garde l'entrée par défaut sur "Création de valeur".
    setActiveDashboardTab(DEFAULT_ANALYSIS_TAB);
  }, [analysis?.id]);

  const folderNames = useMemo(() => {
    const set = new Set<string>();
    allAnalyses.forEach((item) => set.add(normalizeFolderName(item.folderName)));
    knownFolders.forEach((folderName) => set.add(normalizeFolderName(folderName)));
    set.add(normalizeFolderName(currentFolder));
    return Array.from(set).sort((left, right) => left.localeCompare(right, "fr"));
  }, [allAnalyses, currentFolder, knownFolders]);

  const sourceFiles = useMemo<FolderFileItem[]>(() => {
    const allFiles: FolderFileItem[] = [];
    analysesInCurrentFolder
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .forEach((item) => {
        item.sourceFiles.forEach((file) => {
          allFiles.push({
            analysisId: item.id,
            folderName: normalizeFolderName(item.folderName),
            name: file.name,
            createdAt: item.createdAt
          });
        });
      });

    return allFiles;
  }, [analysesInCurrentFolder]);

  const selectedSourceFiles = useMemo(
    () => sourceFiles.filter((file) => selectedSourceFileKeys.includes(buildSourceFileKey(file))),
    [sourceFiles, selectedSourceFileKeys]
  );

  useEffect(() => {
    // Nettoie la selection quand on change de dossier/source pour eviter des suppressions hors contexte.
    const availableKeys = new Set(sourceFiles.map((file) => buildSourceFileKey(file)));
    setSelectedSourceFileKeys((current) => current.filter((key) => availableKeys.has(key)));
  }, [sourceFiles]);

  const folderDialogAnalysesCount = useMemo(() => {
    if (!folderDialogTargetName) {
      return 0;
    }
    return allAnalyses.filter((analysisItem) =>
      isSameFolderName(analysisItem.folderName, folderDialogTargetName)
    ).length;
  }, [allAnalyses, folderDialogTargetName]);

  const pendingSourceFilesDeletionAnalysesCount = useMemo(
    () => new Set(pendingSourceFilesDeletion.map((file) => file.analysisId)).size,
    [pendingSourceFilesDeletion]
  );

  async function loadDashboardData(currentUser: AuthenticatedUser, targetAnalysisId?: string) {
    setLoadingAnalysis(true);
    setErrorMessage(null);

    try {
      // Persiste en base une éventuelle analyse locale créée avant inscription.
      // Ce raccord empêche l'utilisateur de tomber sur un dashboard vide après connexion.
      try {
        await persistPendingAnalysisForUser(currentUser.uid);
      } catch {
        // Non bloquant: on garde le chargement des analyses déjà persistées.
      }

      const [history, profile, persistedFolders] = await Promise.all([
        listUserAnalyses(currentUser.uid),
        getUserProfile(currentUser.uid),
        listUserFolders(currentUser.uid)
      ]);

      setAllAnalyses(history);
      setGreetingName(resolveFirstName(currentUser, profile?.firstName));
      setCompanyName(profile?.companyName?.trim() || "Quantis");
      const persistedFolderNames = persistedFolders.map((folder) => normalizeFolderName(folder.name));
      persistedFolderNames.forEach((folderName) => registerKnownFolderName(folderName));
      setKnownFolders(getKnownFolderNames());

      if (!history.length) {
        // Aucun historique: on retire l'indicateur local d'existence d'analyses.
        clearLocalAnalysisHint();
        setAnalysis(null);
        setCurrentFolder(getActiveFolderName() ?? persistedFolderNames[0] ?? DEFAULT_FOLDER_NAME);
        setErrorMessage(
          "Aucune analyse disponible pour le moment. Importez un fichier pour démarrer votre analyse financière."
        );
        return;
      }

      // Historique present: on force l'indicateur local pour harmoniser /dashboard.
      setLocalAnalysisHint(true);

      let selected: AnalysisRecord | null = null;
      if (targetAnalysisId) {
        selected = history.find((item) => item.id === targetAnalysisId) ?? null;
        if (!selected) {
          const fetched = await getUserAnalysisById(currentUser.uid, targetAnalysisId);
          selected = fetched;
        }
      }

      if (!selected) {
        const storedFolder = getActiveFolderName();
        if (storedFolder) {
          selected = history.find((item) => normalizeFolderName(item.folderName) === normalizeFolderName(storedFolder)) ?? null;
        }
      }

      selected = selected ?? history[0];

      setAnalysis(selected);
      setCurrentFolder(normalizeFolderName(selected.folderName));
      setActiveFolderName(normalizeFolderName(selected.folderName));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Erreur inattendue pendant le chargement."
      );
    } finally {
      setLoadingAnalysis(false);
    }
  }

  async function handleUploadFiles(files: File[]) {
    if (!user || !files.length) {
      return;
    }

    const folderName = ensureFolderName(currentFolder);
    if (!folderName) {
      setErrorMessage("Le nom de dossier est requis pour ajouter des fichiers.");
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      // Garantit la persistance du dossier en base avant la creation d'analyse.
      await createUserFolder(user.uid, folderName);

      const formData = new FormData();
      formData.append("userId", user.uid);
      formData.append("folderName", folderName);
      formData.append("source", "analysis");
      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/analyses", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { analysisDraft?: AnalysisDraft; error?: string; detail?: string };
      if (!response.ok || !payload.analysisDraft) {
        throw new Error(payload.detail ?? payload.error ?? "Le traitement du fichier a échoué.");
      }

      const saved = await saveAnalysisDraft(payload.analysisDraft);
      setAllAnalyses((current) => [saved, ...current]);
      setLocalAnalysisHint(true);
      setCurrentFolder(normalizeFolderName(saved.folderName));
      setKnownFolders(registerKnownFolderName(saved.folderName));
      setAnalysis(saved);
      setInfoMessage("Fichier traité avec succès. Dashboard mis à jour.");
      router.replace("/analysis");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erreur inattendue pendant l'ajout du fichier.");
    } finally {
      setUploading(false);
    }
  }

  function handleNewFolder() {
    // Ouvre une modale applicative au lieu d'un prompt navigateur.
    setFolderDialogMode("create");
    setFolderDialogTargetName(null);
    setFolderDialogName(buildNextFolderName(folderNames));
  }

  function openRenameFolderDialog(folderName: string) {
    setFolderDialogMode("rename");
    setFolderDialogTargetName(folderName);
    setFolderDialogName(folderName);
  }

  function openDeleteFolderDialog(folderName: string) {
    setFolderDialogMode("delete");
    setFolderDialogTargetName(folderName);
    setFolderDialogName(folderName);
  }

  async function handleSubmitFolderDialog() {
    if (!user || !folderDialogMode) {
      return;
    }

    const normalizedInputName = normalizeFolderName(folderDialogName);
    const targetFolderName = folderDialogTargetName ? normalizeFolderName(folderDialogTargetName) : null;

    if (!normalizedInputName) {
      setErrorMessage("Le nom du dossier est requis.");
      return;
    }

    if (folderDialogMode !== "delete" && !targetFolderName) {
      const alreadyExists = folderNames.some((knownFolderName) =>
        isSameFolderName(knownFolderName, normalizedInputName)
      );
      if (alreadyExists) {
        setErrorMessage("Un dossier avec ce nom existe déjà.");
        return;
      }
    }

    if (folderDialogMode === "rename" && targetFolderName) {
      const alreadyExists = folderNames.some(
        (knownFolderName) =>
          !isSameFolderName(knownFolderName, targetFolderName) &&
          isSameFolderName(knownFolderName, normalizedInputName)
      );
      if (alreadyExists) {
        setErrorMessage("Un dossier avec ce nom existe déjà.");
        return;
      }
    }

    setFolderActionName(targetFolderName ?? normalizedInputName);
    setFolderDialogSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      if (folderDialogMode === "create") {
        await createUserFolder(user.uid, normalizedInputName);
        setCurrentFolder(normalizedInputName);
        setKnownFolders(registerKnownFolderName(normalizedInputName));
        setInfoMessage(`Dossier créé et actif : ${normalizedInputName}`);
      }

      if (folderDialogMode === "rename" && targetFolderName) {
        const movedAnalyses = await renameUserFolder(user.uid, targetFolderName, normalizedInputName);
        await renameUserFoldersByName(user.uid, targetFolderName, normalizedInputName);

        const remainingAnalyses = allAnalyses.filter(
          (analysisItem) => !isSameFolderName(analysisItem.folderName, targetFolderName)
        );
        const nextAnalyses = [...movedAnalyses, ...remainingAnalyses].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt)
        );
        setAllAnalyses(nextAnalyses);
        setKnownFolders(renameKnownFolderName(targetFolderName, normalizedInputName));

        if (isSameFolderName(currentFolder, targetFolderName)) {
          setCurrentFolder(normalizedInputName);
        }

        if (analysis && isSameFolderName(analysis.folderName, targetFolderName)) {
          setAnalysis(movedAnalyses[0] ?? null);
        }

        setInfoMessage(`Dossier renommé : ${targetFolderName} -> ${normalizedInputName}`);
      }

      if (folderDialogMode === "delete" && targetFolderName) {
        const deletedCount = await deleteUserFolderAnalyses(user.uid, targetFolderName);
        await deleteUserFoldersByName(user.uid, targetFolderName);

        const remainingAnalyses = allAnalyses.filter(
          (analysisItem) => !isSameFolderName(analysisItem.folderName, targetFolderName)
        );
        const remainingKnownFolders = removeKnownFolderName(targetFolderName);

        setAllAnalyses(remainingAnalyses);
        setKnownFolders(remainingKnownFolders);

        const fallbackFolderName = resolveNextFolderName(
          remainingAnalyses,
          remainingKnownFolders,
          currentFolder,
          targetFolderName
        );
        if (fallbackFolderName) {
          setCurrentFolder(fallbackFolderName);
        }

        if (analysis && isSameFolderName(analysis.folderName, targetFolderName)) {
          setAnalysis(null);
        }

        if (deletedCount > 0) {
          setInfoMessage(`Dossier supprimé : ${targetFolderName} (${deletedCount} analyses).`);
        } else {
          setInfoMessage(`Dossier vide supprimé : ${targetFolderName}.`);
        }
      }

      closeFolderDialog();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Opération dossier impossible."
      );
    } finally {
      setFolderDialogSubmitting(false);
      setFolderActionName(null);
    }
  }

  function closeFolderDialog() {
    setFolderDialogMode(null);
    setFolderDialogTargetName(null);
    setFolderDialogName("");
    setFolderDialogSubmitting(false);
  }

  function toggleSourceFileSelection(file: FolderFileItem) {
    const key = buildSourceFileKey(file);
    setSelectedSourceFileKeys((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]
    );
  }

  function toggleSelectAllSourceFiles() {
    if (selectedSourceFileKeys.length === sourceFiles.length) {
      setSelectedSourceFileKeys([]);
      return;
    }
    setSelectedSourceFileKeys(sourceFiles.map((file) => buildSourceFileKey(file)));
  }

  function requestSourceFilesDeletion(files: FolderFileItem[]) {
    if (!files.length) {
      return;
    }
    // Affiche une confirmation explicite avant toute suppression de donnees.
    setPendingSourceFilesDeletion(files);
    setErrorMessage(null);
    setInfoMessage(null);
  }

  function closeSourceFilesDeletionDialog() {
    setPendingSourceFilesDeletion([]);
    setSourceFilesDeletionSubmitting(false);
  }

  async function confirmSourceFilesDeletion() {
    if (!user || !pendingSourceFilesDeletion.length) {
      return;
    }

    // Deduplication par analyse: plusieurs fichiers peuvent appartenir au meme lot d'analyse.
    const analysisIdsToDelete = Array.from(
      new Set(pendingSourceFilesDeletion.map((file) => file.analysisId))
    );

    setSourceFilesDeletionSubmitting(true);
    setFileActionKey(analysisIdsToDelete.length === 1 ? analysisIdsToDelete[0] : null);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const deletedAnalysisIds: string[] = [];
      for (const analysisIdToDelete of analysisIdsToDelete) {
        const deleted = await deleteUserAnalysisById(user.uid, analysisIdToDelete);
        if (deleted) {
          deletedAnalysisIds.push(analysisIdToDelete);
        }
      }

      if (!deletedAnalysisIds.length) {
        setErrorMessage("Impossible de supprimer les fichiers sélectionnés.");
        return;
      }

      const deletedIdsSet = new Set(deletedAnalysisIds);
      const remainingAnalyses = allAnalyses.filter((analysisItem) => !deletedIdsSet.has(analysisItem.id));
      setAllAnalyses(remainingAnalyses);
      setSelectedSourceFileKeys([]);

      if (!remainingAnalyses.length) {
        clearLocalAnalysisHint();
        setAnalysis(null);
        setErrorMessage(
          "Aucune analyse disponible pour le moment. Importez un fichier pour démarrer votre analyse financière."
        );
      } else {
        setLocalAnalysisHint(true);
      }

      if (analysis && deletedIdsSet.has(analysis.id)) {
        const nextInFolder = remainingAnalyses.find((item) =>
          isSameFolderName(item.folderName, currentFolder)
        );
        setAnalysis(nextInFolder ?? remainingAnalyses[0] ?? null);
      }

      const deletedFilesCount = pendingSourceFilesDeletion.length;
      const deletedAnalysesCount = deletedAnalysisIds.length;
      setInfoMessage(
        deletedFilesCount === 1
          ? "Fichier source supprimé. Les données associées ont été mises à jour."
          : `${deletedFilesCount} fichiers supprimés (${deletedAnalysesCount} analyses). Les données associées ont été mises à jour.`
      );
      closeSourceFilesDeletionDialog();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Suppression des fichiers sources impossible."
      );
    } finally {
      setFileActionKey(null);
      setSourceFilesDeletionSubmitting(false);
    }
  }

  function onSourceFilesDeletionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void confirmSourceFilesDeletion();
  }

  function onFolderDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleSubmitFolderDialog();
  }

  function handleFinancialTabChange(nextTab: DashboardTestTabId) {
    setActiveDashboardTab(nextTab);
  }

  function onInputFilesSelected(fileList: FileList | null) {
    if (!fileList) {
      return;
    }

    const filtered = Array.from(fileList).filter((file) => {
      const name = file.name.toLowerCase();
      return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
    });

    if (!filtered.length) {
      setErrorMessage("Aucun fichier supporté détecté. Formats : .xlsx .xls .csv .pdf");
      return;
    }

    void handleUploadFiles(filtered);
  }

  async function handleLogout() {
    await firebaseAuthGateway.signOut();
    router.replace("/");
  }

  async function handleDocumentsRefresh() {
    if (!user) {
      return;
    }
    await loadDashboardData(user, analysis?.id);
  }

  if (loadingAuth) {
    return (
      <section className="precision-card rounded-2xl p-8 text-center">
        <p className="text-sm text-white/70">Chargement de la session...</p>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="precision-card rounded-2xl p-8 text-center">
        <p className="text-sm text-white/80">Votre session est expirée. Reconnectez-vous pour continuer.</p>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="mt-4 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 hover:bg-white/10"
        >
          Se connecter
        </button>
      </section>
    );
  }

  return (
    <section className="w-full space-y-4">
      {/* Header global unifié — cf. components/layout/AppHeader.tsx */}
      <AppHeader
        companyName={companyName}
        searchPlaceholder="Rechercher un KPI, une section ou un document..."
      />

      {/* Loader retardé : ne s'affiche que si le chargement dépasse 400 ms. */}
      {showAnalysisLoader ? (
        <div className="precision-card rounded-2xl px-4 py-3 text-sm text-white/70">Chargement de l&apos;analyse...</div>
      ) : null}

      {errorMessage ? (
        <div className="precision-card rounded-2xl border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {errorMessage}
        </div>
      ) : null}

      {infoMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-50 w-full max-w-sm rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
            <p>{infoMessage}</p>
          </div>
        </div>
      ) : null}

      <div className="relative grid gap-6 grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)]">
        <AppSidebar
          activeRoute={isDocumentsView ? "documents" : "analysis"}
          accountFirstName={greetingName}
          contextSlot={
            !isDocumentsView && dashboardYearOptions.length > 1 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <label htmlFor="sidebar-dashboard-year" className="text-[10px] font-mono uppercase tracking-wide text-white/45">
                  Année de synthèse
                </label>
                <select
                  id="sidebar-dashboard-year"
                  value={selectedDashboardYear}
                  onChange={(event) => setSelectedDashboardYear(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-sm text-white outline-none transition focus:border-quantis-gold/70"
                >
                  {dashboardYearOptions.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[#10141f] text-white">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null
          }
        />

        <div className="space-y-6">
          {isDocumentsView ? (
            <>
              <section className="precision-card rounded-2xl p-5" data-search-id="documents-folders">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-white/50">Dossiers</p>
                  <button
                    type="button"
                    onClick={handleNewFolder}
                    className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label="Nouveau dossier"
                    title="Nouveau dossier"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2 space-y-1">
                  {folderNames.map((folderName) => {
                    const isActive = normalizeFolderName(folderName) === normalizeFolderName(currentFolder);
                    const count = allAnalyses.filter(
                      (item) => normalizeFolderName(item.folderName) === normalizeFolderName(folderName)
                    ).length;
                    const isBusy = folderActionName ? isSameFolderName(folderActionName, folderName) : false;
                    return (
                      <div
                        key={folderName}
                        className={`flex items-center gap-1 rounded-lg px-1 py-1 ${
                          isActive ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setCurrentFolder(normalizeFolderName(folderName))}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left"
                          disabled={isBusy}
                        >
                          <Folder className="h-4 w-4" />
                          <span className="min-w-0 flex-1 truncate text-sm">{folderName}</span>
                          <span className="text-[11px]">{count}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openRenameFolderDialog(folderName)}
                          className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Renommer le dossier ${folderName}`}
                          title="Renommer"
                          disabled={isBusy}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteFolderDialog(folderName)}
                          className="rounded p-1 text-white/60 hover:bg-rose-500/20 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Supprimer le dossier ${folderName}`}
                          title="Supprimer"
                          disabled={isBusy}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section
                className="precision-card rounded-2xl p-5"
                id="documents-files"
                data-search-id="documents-files"
                data-tour-id="documents-files"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-white/50">Fichiers sources</p>
                  {sourceFiles.length > 0 ? (
                    <button
                      type="button"
                      onClick={toggleSelectAllSourceFiles}
                      className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/75 hover:bg-white/10"
                    >
                      {selectedSourceFileKeys.length === sourceFiles.length
                        ? "Tout désélectionner"
                        : "Tout sélectionner"}
                    </button>
                  ) : null}
                </div>

                {selectedSourceFiles.length > 0 ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => requestSourceFilesDeletion(selectedSourceFiles)}
                      className="w-full rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-500/20"
                    >
                      Supprimer la sélection ({selectedSourceFiles.length})
                    </button>
                  </div>
                ) : null}

                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {sourceFiles.length === 0 ? (
                    <p className="px-1 text-xs text-white/55">Aucun fichier importé pour le moment.</p>
                  ) : (
                    sourceFiles.map((file) => (
                      <div
                        key={`${file.analysisId}-${file.name}-${file.createdAt}`}
                        className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5"
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selectedSourceFileKeys.includes(buildSourceFileKey(file))}
                            onChange={() => toggleSourceFileSelection(file)}
                            className="mt-1 h-3.5 w-3.5 rounded border-white/20 bg-black/40 text-quantis-gold accent-quantis-gold"
                            aria-label={`Sélectionner ${file.name}`}
                          />
                          <FileText className="mt-0.5 h-3.5 w-3.5 text-white/55" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-white">{file.name}</p>
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/55">
                              <span>{new Date(file.createdAt).toLocaleDateString("fr-FR")}</span>
                              <span>•</span>
                              <span className="truncate">{file.folderName}</span>
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => requestSourceFilesDeletion([file])}
                            className="rounded p-1 text-white/55 transition-colors hover:bg-rose-500/20 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Supprimer ${file.name}`}
                            title="Supprimer ce fichier source"
                            disabled={fileActionKey === file.analysisId || sourceFilesDeletionSubmitting}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section
                className="precision-card rounded-2xl p-5"
                id="documents-upload"
                data-search-id="documents-upload"
                data-tour-id="documents-upload"
              >
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    id="documents-update"
                    data-tour-id="documents-update"
                    onClick={() => void handleDocumentsRefresh()}
                    disabled={loadingAnalysis}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCcw className={`h-3.5 w-3.5 ${loadingAnalysis ? "animate-spin" : ""}`} />
                    Actualiser l&apos;analyse
                  </button>
                </div>
                <div className="rounded-xl border border-dashed border-white/20 bg-black/15 p-3 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".xlsx,.xls,.csv,.pdf"
                    className="hidden"
                    onChange={(event) => {
                      onInputFilesSelected(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full rounded-lg px-2 py-3 text-xs text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                    onDrop={(event) => {
                      event.preventDefault();
                      onInputFilesSelected(event.dataTransfer.files);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                  >
                    <Upload className="mx-auto h-4 w-4 text-white/60" />
                    <p className="mt-2 font-medium">Glisser-déposer</p>
                    <p className="text-[11px] text-white/55">ou cliquer pour parcourir</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/upload/manual")}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-xs font-medium text-white/85 transition-colors hover:bg-white/10"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Saisie manuelle des données
                  </button>
                </div>
              </section>
            </>
          ) : analysis ? (
            <>
              {/* Filtre temporel global — identique à /synthese. Caché si source
                  statique (pas de dailyAccounting) car aucune granularité à
                  proposer ; remplacé par "Exercice YYYY" en texte simple. */}
              {shouldShowTemporalityBar(analysis) ? (
                <TemporalityBar
                  availableRange={computeAvailableRange(analysis)}
                  daysInPeriod={effectiveAnalysis?.isFiltered ? effectiveAnalysis.filterSummary.daysInPeriod : null}
                  rightLabel={
                    effectiveAnalysis?.isFiltered
                      ? `${effectiveAnalysis.filterSummary.daysInPeriod} jour(s) avec écritures sur la période`
                      : undefined
                  }
                />
              ) : (
                <div
                  className="precision-card rounded-2xl px-4 py-3 text-sm text-white/70"
                  data-scroll-reveal-ignore
                >
                  <span className="text-xs uppercase tracking-wider text-white/45">Période · </span>
                  <span className="font-semibold text-white">
                    Exercice {analysis.fiscalYear ?? "(non renseigné)"}
                  </span>
                  <span className="ml-2 text-xs text-white/45">— source statique, vue annuelle uniquement</span>
                </div>
              )}

              {/* Bandeau utilisateur (identique au header de SyntheseDashboard) :
                  nom de société + date d'analyse + boutons Télécharger / Exporter. */}
              <header className="precision-card flex flex-col gap-3 rounded-2xl px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-quantis-muted">{companyName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/70">
                    <span>Analyse du {new Date(analysis.createdAt).toLocaleString("fr-FR")}</span>
                    <SourceBadge
                      sourceMetadata={analysis.sourceMetadata ?? null}
                      analysisCreatedAt={analysis.createdAt}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start md:self-auto">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!analysis) return;
                      const err = await downloadFinancialReport({ analysisId: analysis.id });
                      if (err) {
                        // Erreur silencieuse : on log côté console pour debug.
                        console.warn("[financial-report] download failed", err);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-quantis-gold/30 bg-quantis-gold/10 px-3 py-1.5 text-xs font-medium text-quantis-gold hover:bg-quantis-gold/20"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Télécharger le rapport PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!analysis) return;
                      exportAnalysisDataAsJson({ analysis, companyName });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:bg-white/5 hover:text-white/70"
                  >
                    Exporter données
                  </button>
                </div>
              </header>

              {/* Titre + sous-titre (analogue au DashboardLayout de /synthese). */}
              <div className="px-1">
                <h1 className="text-2xl font-semibold text-white md:text-3xl">Tableau de bord</h1>
                <p className="mt-1 text-sm text-white/65">
                  Bonjour {greetingName}, voici la vue détaillée de vos indicateurs financiers.
                </p>
              </div>

              <DashboardFinancialTestMenu
                activeTab={activeDashboardTab}
                onChange={handleFinancialTabChange}
                showTresorerie={showTresorerie}
              />
              {/* previousKpis :
                   - Priorité 1 = KPIs de la période antérieure de même durée
                     (Année → N-1, Mois → M-1…) calculés via dailyAccounting.
                   - Priorité 2 = KPIs de l'exercice N-1 (fallback historique
                     pour les sources statiques PDF/Excel sans daily). */}
              <DashboardFinancialTestContent
                activeTab={activeDashboardTab}
                kpis={effectiveAnalysis?.kpis ?? analysis.kpis}
                mappedData={effectiveAnalysis?.mappedData ?? analysis.mappedData}
                previousKpis={previousPeriodKpis ?? previousAnalysis?.kpis ?? null}
                bankingSummary={bankingSummary}
              />
            </>
          ) : (
            <section className="precision-card rounded-2xl p-5">
              <p className="text-sm text-white/70">
                {hasNoAnalysisForSelectedYear
                  ? "Aucune analyse disponible pour l'année sélectionnée."
                  : "Aucune analyse disponible pour le moment. Importez un fichier pour démarrer votre analyse financière."}
              </p>
            </section>
          )}
        </div>
      </div>

      {pendingSourceFilesDeletion.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
          <form
            className="precision-card w-full max-w-lg rounded-2xl p-5"
            onSubmit={onSourceFilesDeletionSubmit}
          >
            <h3 className="text-base font-semibold text-white">Confirmer la suppression</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/75">
              {pendingSourceFilesDeletion.length === 1
                ? `Vous allez supprimer le fichier "${pendingSourceFilesDeletion[0]?.name ?? "source"}".`
                : `Vous allez supprimer ${pendingSourceFilesDeletion.length} fichiers sources.`}
              {" "}
              Cette action supprime aussi les données d’analyse associées ({pendingSourceFilesDeletionAnalysesCount} analyses)
              et elle est irreversible.
            </p>
            <div className="mt-4 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-3">
              {pendingSourceFilesDeletion.map((file) => (
                <div
                  key={buildSourceFileKey(file)}
                  className="flex items-center justify-between gap-2 text-xs text-white/70"
                >
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-white/45">{file.folderName}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeSourceFilesDeletionDialog}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                disabled={sourceFilesDeletionSubmitting}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-lg border border-rose-300/30 bg-rose-500/80 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={sourceFilesDeletionSubmitting}
                autoFocus
              >
                {sourceFilesDeletionSubmitting ? "Suppression..." : "Confirmer la suppression"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {folderDialogMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <form
            className="precision-card w-full max-w-md rounded-2xl p-5"
            onSubmit={onFolderDialogSubmit}
          >
            <h3 className="text-base font-semibold text-white">
              {folderDialogMode === "create"
                ? "Créer un dossier"
                : folderDialogMode === "rename"
                  ? "Renommer le dossier"
                  : "Supprimer le dossier"}
            </h3>

            {folderDialogMode === "delete" ? (
              <p className="mt-3 text-sm text-white/70">
                {folderDialogAnalysesCount > 0
                  ? `Le dossier "${folderDialogTargetName}" contient ${folderDialogAnalysesCount} analyses. Elles seront supprimées.`
                  : `Le dossier "${folderDialogTargetName}" est vide et sera supprimé.`}
              </p>
            ) : (
              <div className="mt-4">
                <label className="text-xs uppercase tracking-wide text-white/60" htmlFor="folder-name-input">
                  Nom du dossier
                </label>
                <input
                  id="folder-name-input"
                  value={folderDialogName}
                  onChange={(event) => setFolderDialogName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-quantis-gold/60"
                  placeholder="Nom du dossier"
                  autoFocus
                />
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeFolderDialog}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                disabled={folderDialogSubmitting}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="btn-gold-premium rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                disabled={folderDialogSubmitting}
                autoFocus={folderDialogMode === "delete"}
              >
                {folderDialogSubmitting ? "Traitement..." : folderDialogMode === "delete" ? "Supprimer" : "Valider"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function resolveFirstName(user: AuthenticatedUser, profileFirstName?: string): string {
  if (profileFirstName && profileFirstName.trim()) {
    return profileFirstName.trim();
  }

  if (user.displayName && user.displayName.trim()) {
    return user.displayName.trim().split(" ")[0] || "Utilisateur";
  }

  if (user.email) {
    return user.email.split("@")[0] || "Utilisateur";
  }

  return "Utilisateur";
}

function normalizeFolderName(folderName?: string | null): string {
  const cleaned = folderName?.trim();
  return cleaned || DEFAULT_FOLDER_NAME;
}

function buildNextFolderName(existingFolderNames: string[]): string {
  const takenNames = new Set(existingFolderNames.map((folderName) => folderName.toLowerCase()));
  let index = 1;

  while (takenNames.has(`nouveau dossier ${index}`.toLowerCase())) {
    index += 1;
  }

  return `Nouveau dossier ${index}`;
}

function resolveNextFolderName(
  remainingAnalyses: AnalysisRecord[],
  remainingKnownFolders: string[],
  currentFolderName: string,
  deletedFolderName: string
): string | null {
  if (!isSameFolderName(currentFolderName, deletedFolderName)) {
    return normalizeFolderName(currentFolderName);
  }

  const candidateFolders = new Set<string>();
  remainingAnalyses.forEach((analysisItem) => {
    candidateFolders.add(normalizeFolderName(analysisItem.folderName));
  });
  remainingKnownFolders.forEach((folderName) => {
    candidateFolders.add(normalizeFolderName(folderName));
  });

  if (!candidateFolders.size) {
    return DEFAULT_FOLDER_NAME;
  }

  return Array.from(candidateFolders)[0];
}

function isSameFolderName(leftFolderName?: string | null, rightFolderName?: string | null): boolean {
  return normalizeFolderName(leftFolderName).toLowerCase() === normalizeFolderName(rightFolderName).toLowerCase();
}

function buildSourceFileKey(file: FolderFileItem): string {
  return `${file.analysisId}:${file.name}:${file.createdAt}`;
}

function NavRow({
  children,
  icon,
  active,
  collapsed,
  disabled,
  onClick
}: {
  children: ReactNode;
  icon: ReactNode;
  active?: boolean;
  collapsed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const label = typeof children === "string" ? children : undefined;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center rounded-xl transition-colors ${
        collapsed ? "group justify-center px-2 py-2" : "gap-2 px-3 py-2 text-left"
      } ${
        active
          ? "bg-white/10 text-white"
          : disabled
            ? "cursor-not-allowed text-white/40"
            : "text-white/75 hover:bg-white/10 hover:text-white"
      }`}
    >
      {collapsed ? (
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
            active
              ? "border-quantis-gold/60 bg-quantis-gold/15 text-quantis-gold"
              : "border-white/15 bg-white/5 text-white/80 group-hover:border-white/30 group-hover:bg-white/10 group-hover:text-white"
          }`}
        >
          {icon}
        </span>
      ) : (
        icon
      )}
      {!collapsed ? <span>{children}</span> : null}
    </button>
  );
}
