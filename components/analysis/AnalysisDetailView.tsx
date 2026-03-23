// File: components/analysis/AnalysisDetailView.tsx
// Role: assemble la page /analysis (et /analysis/[id]) avec dashboard premium, dossiers, upload et debug.
"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  Folder,
  LayoutDashboard,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  UserCircle2
} from "lucide-react";
import { buildAnalysisDashboardViewModel } from "@/lib/dashboard/analysisDashboardViewModel";
import { toPremiumKpis } from "@/lib/dashboard/premiumDashboardAdapter";
import {
  DashboardFinancialTabContent,
  DashboardFinancialTabsMenu,
  type DashboardTabId
} from "@/components/dashboard/tabs/DashboardFinancialTabs";
import {
  DashboardFinancialTestMenu,
  type DashboardTestTabId
} from "@/components/dashboard/test/DashboardFinancialTestMenu";
import { DashboardFinancialTestContent } from "@/components/dashboard/test/DashboardFinancialTestContent";
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
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  buildSyntheseYearOptions,
  filterAnalysesByYear,
  SYNTHESIS_CURRENT_YEAR_KEY
} from "@/lib/synthese/synthesePeriod";
import { loadAppPreferences } from "@/lib/settings/appPreferences";
import {
  deleteUserAnalysisById,
  deleteUserFolderAnalyses,
  getUserAnalysisById,
  listUserAnalyses,
  renameUserFolder,
  saveAnalysisDraft
} from "@/services/analysisStore";
import {
  createUserFolder,
  deleteUserFoldersByName,
  listUserFolders,
  renameUserFoldersByName
} from "@/services/folderStore";
import { firebaseAuthGateway } from "@/services/auth";
import { persistPendingAnalysisForUser } from "@/services/pendingAnalysisSync";
import { getUserProfile } from "@/services/userProfileStore";
import type { AnalysisDraft, AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

type AnalysisDetailViewProps = {
  analysisId?: string;
};

type FolderFileItem = {
  analysisId: string;
  folderName: string;
  name: string;
  createdAt: string;
};

type FolderDialogMode = "create" | "rename" | "delete" | null;

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".pdf"];

export function AnalysisDetailView({ analysisId }: AnalysisDetailViewProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentCalendarYear = new Date().getFullYear();

  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [allAnalyses, setAllAnalyses] = useState<AnalysisRecord[]>([]);
  // null => affichage du dashboard initial; tab renseigne => affichage de la section choisie.
  const [activeDashboardTab, setActiveDashboardTab] = useState<DashboardTabId | null>(null);
  // Menu de test isole: active une vue alternative sans impacter la navigation principale.
  const [activeDashboardTestTab, setActiveDashboardTestTab] = useState<DashboardTestTabId | null>(null);
  // Le select du menu pilote l'année d'analyse affichée dans le dashboard.
  const [selectedDashboardYear, setSelectedDashboardYear] = useState<string>(SYNTHESIS_CURRENT_YEAR_KEY);
  const [currentFolder, setCurrentFolder] = useState<string>(getActiveFolderName() ?? DEFAULT_FOLDER_NAME);
  const [knownFolders, setKnownFolders] = useState<string[]>(() => getKnownFolderNames());
  const [showDebugSection, setShowDebugSection] = useState<boolean>(() => loadAppPreferences().showDebugSection);
  const [greetingName, setGreetingName] = useState("Utilisateur");
  const [companyName, setCompanyName] = useState("Quantis");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
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

  useEffect(() => {
    // Les messages de succes sont temporaires pour eviter d'encombrer l'ecran.
    if (!infoMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setInfoMessage(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [infoMessage]);

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

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadDashboardData(user, analysisId);
  }, [user, analysisId]);

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
    // Synchronise la preference debug quand elle est modifiee depuis /settings.
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key && event.key !== "quantis.appPreferences") {
        return;
      }
      setShowDebugSection(loadAppPreferences().showDebugSection);
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    // Contrainte produit: /analysis doit rester en mode dark par defaut.
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "dark");

    return () => {
      if (previousTheme) {
        root.setAttribute("data-theme", previousTheme);
        return;
      }
      root.removeAttribute("data-theme");
    };
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
      setAnalysis(analysesFilteredByYear[0]);
      return;
    }

    const analysisStillInSelectedYear = analysesFilteredByYear.some((item) => item.id === analysis.id);
    if (!analysisStillInSelectedYear) {
      setAnalysis(analysesInCurrentFolder[0] ?? analysesFilteredByYear[0] ?? null);
      return;
    }

    if (normalizeFolderName(analysis.folderName) !== normalizeFolderName(currentFolder)) {
      setAnalysis(analysesInCurrentFolder[0] ?? null);
    }
  }, [analysis, analysesFilteredByYear, analysesInCurrentFolder, allAnalyses, currentFolder]);

  useEffect(() => {
    // Lors d'un changement d'analyse, on revient sur le contenu initial du tableau de bord.
    setActiveDashboardTab(null);
    setActiveDashboardTestTab(null);
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

  const dashboardView = useMemo(
    () => (analysis ? buildAnalysisDashboardViewModel(analysis.kpis) : null),
    [analysis]
  );

  // Adaptateur UI premium: isole les cles de presentation sans toucher la logique metier.
  const premiumKpis = useMemo(
    () => (analysis ? toPremiumKpis(analysis.kpis) : null),
    [analysis]
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
        throw new Error(payload.detail ?? payload.error ?? "Le traitement du fichier a echoue.");
      }

      const saved = await saveAnalysisDraft(payload.analysisDraft);
      setAllAnalyses((current) => [saved, ...current]);
      setLocalAnalysisHint(true);
      setCurrentFolder(normalizeFolderName(saved.folderName));
      setKnownFolders(registerKnownFolderName(saved.folderName));
      setAnalysis(saved);
      setInfoMessage("Fichier traite avec succes. Dashboard mis a jour.");
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
        setErrorMessage("Un dossier avec ce nom existe deja.");
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
        setErrorMessage("Un dossier avec ce nom existe deja.");
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

        setInfoMessage(`Dossier renomme: ${targetFolderName} -> ${normalizedInputName}`);
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
          setInfoMessage(`Dossier supprime: ${targetFolderName} (${deletedCount} analyses).`);
        } else {
          setInfoMessage(`Dossier vide supprime: ${targetFolderName}.`);
        }
      }

      closeFolderDialog();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Operation dossier impossible."
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
        setErrorMessage("Impossible de supprimer les fichiers selectionnes.");
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
          ? "Fichier source supprime. Les donnees associees ont ete mises a jour."
          : `${deletedFilesCount} fichiers supprimes (${deletedAnalysesCount} analyses). Les donnees associees ont ete mises a jour.`
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

  function handleFinancialTabChange(nextTab: DashboardTabId) {
    // Recliquer sur l'onglet actif re-affiche le contenu initial du tableau de bord.
    // Le menu principal désactive automatiquement la variante "test".
    setActiveDashboardTestTab(null);
    setActiveDashboardTab((currentTab) => (currentTab === nextTab ? null : nextTab));
  }

  function handleFinancialTestTabChange(nextTab: DashboardTestTabId) {
    // Le menu de test est exclusif: il masque les sections standards tant qu'il est actif.
    setActiveDashboardTab(null);
    setActiveDashboardTestTab((currentTab) => (currentTab === nextTab ? null : nextTab));
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
      setErrorMessage("Aucun fichier supporte detecte. Formats: .xlsx .xls .csv .pdf");
      return;
    }

    void handleUploadFiles(filtered);
  }

  async function handleLogout() {
    await firebaseAuthGateway.signOut();
    router.replace("/");
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
    <section className="space-y-4">
      {/* Bandeau d'actions globales conserve (settings/offres/compte/logout) avec skin premium dark. */}
      <header className="precision-card flex items-center justify-between gap-3 rounded-2xl px-5 py-3">
        <div className="flex items-center gap-3">
          {/* Taille légèrement augmentée pour éviter l'effet visuel "logo coupé" dans le header. */}
          <QuantisLogo withText={false} size={34} />
          <div>
            <p className="text-sm font-semibold text-white">{companyName}</p>
            <p className="text-xs text-white/55">Plateforme financière</p>
          </div>
        </div>

        <div className="hidden text-sm font-medium text-white md:block">Tableau de bord</div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Paramètres"
            title="Paramètres"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Offres"
            title="Offre Free (verrouille)"
          >
            <Lock className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => router.push("/account?from=analysis")}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Compte"
            title="Compte"
          >
            <UserCircle2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            aria-label="Se deconnecter"
            title="Se deconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {loadingAnalysis ? (
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

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Sidebar metier: dossiers + fichiers + upload, conservee mais re-skinee premium. */}
        <aside className="precision-card h-fit rounded-2xl p-4 lg:sticky lg:top-4">
          <nav className="space-y-1 text-sm">
            <NavRow icon={<LayoutDashboard className="h-4 w-4" />} active>
              Tableau de bord
            </NavRow>
            {/* L'item "Analyses" est remplace par "Synthese" et devient navigable. */}
            <NavRow icon={<Sparkles className="h-4 w-4" />} onClick={() => router.push("/synthese")}>
              Synthèse
            </NavRow>
            <NavRow icon={<Sparkles className="h-4 w-4" />} disabled>
              Documents (bientôt)
            </NavRow>
          </nav>

          {/* Le bloc compte remplace le lien de navigation "Compte" pour eviter le doublon. */}
          <button
            type="button"
            onClick={() => router.push("/account?from=analysis")}
            className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left transition-colors hover:bg-white/10"
            aria-label="Ouvrir le compte"
          >
            <p className="text-[11px] uppercase tracking-wide text-white/50">Compte</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-semibold text-white">
                {greetingName.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="text-sm font-medium text-white">{greetingName}</p>
                <p className="text-xs text-white/55">Free</p>
              </div>
            </div>
          </button>

          <div className="mt-5">
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
                const count = allAnalyses.filter((item) => normalizeFolderName(item.folderName) === normalizeFolderName(folderName)).length;
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
          </div>

          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-white/50">Fichiers sources</p>
              {sourceFiles.length > 0 ? (
                <button
                  type="button"
                  onClick={toggleSelectAllSourceFiles}
                  className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/75 hover:bg-white/10"
                >
                  {selectedSourceFileKeys.length === sourceFiles.length
                    ? "Tout deselectionner"
                    : "Tout selectionner"}
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
                  Supprimer la selection ({selectedSourceFiles.length})
                </button>
              </div>
            ) : null}
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
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
                        aria-label={`Selectionner ${file.name}`}
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
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-white/20 bg-black/15 p-3 text-center">
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
        </aside>

        <div className="space-y-6">
          {analysis && dashboardView && premiumKpis ? (
            <>
              {/* Menu horizontal placé AU-DESSUS du bloc Cockpit financier, comme demandé. */}
              <DashboardFinancialTabsMenu
                activeTab={activeDashboardTab}
                onChange={handleFinancialTabChange}
                yearOptions={dashboardYearOptions}
                selectedYear={selectedDashboardYear}
                onYearChange={setSelectedDashboardYear}
              />
              {/* Menu de test ajouté sous le menu existant pour expérimenter des variantes UI. */}
              <div className="mt-3">
                <DashboardFinancialTestMenu
                  activeTab={activeDashboardTestTab}
                  onChange={handleFinancialTestTabChange}
                />
              </div>
              {activeDashboardTestTab !== null ? (
                <DashboardFinancialTestContent activeTab={activeDashboardTestTab} kpis={analysis.kpis} />
              ) : activeDashboardTab !== null ? (
                // UX demandee: quand un onglet métier est actif, on masque le cockpit
                // pour afficher uniquement la section financière sélectionnée.
                <DashboardFinancialTabContent
                  activeTab={activeDashboardTab}
                  kpis={analysis.kpis}
                  viewModel={dashboardView}
                />
              ) : (
                <DashboardLayout
                  // Le key force un remount propre quand on change d'analyse (reset slider IA local).
                  key={analysis.id}
                  companyName={companyName}
                  greetingName={greetingName}
                  kpis={premiumKpis}
                >
                  <DashboardFinancialTabContent
                    activeTab={activeDashboardTab}
                    kpis={analysis.kpis}
                    viewModel={dashboardView}
                  />
                  {showDebugSection && activeDashboardTab === null ? (
                  <details className="precision-card rounded-2xl p-5">
                    <summary className="cursor-pointer text-sm font-semibold text-white">
                      Donnees source (debug)
                    </summary>
                    <div className="mt-4 grid gap-4 xl:grid-cols-3">
                      <JsonPanel title="rawData" value={analysis.rawData} />
                      <JsonPanel title="mappedData" value={analysis.mappedData} />
                      <JsonPanel title="kpis" value={analysis.kpis} />
                    </div>
                  </details>
                  ) : null}
                </DashboardLayout>
              )}
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
                className="rounded-lg border border-white/15 bg-quantis-gold/85 px-3 py-2 text-sm font-medium text-black hover:bg-quantis-gold disabled:cursor-not-allowed disabled:opacity-60"
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
  disabled,
  onClick
}: {
  children: ReactNode;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
        active
          ? "bg-white/10 text-white"
          : disabled
            ? "cursor-not-allowed text-white/40"
            : "text-white/75 hover:bg-white/10 hover:text-white"
      }`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section>
      <p className="text-xs uppercase tracking-wide text-white/60">{title}</p>
      <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}



