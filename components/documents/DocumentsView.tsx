"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Folder,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  Sparkles,
  Bot
} from "lucide-react";
import { FolderTabs } from "@/components/documents/FolderTabs";
import { AnalysisCardGrid } from "@/components/documents/AnalysisCardGrid";
import { EmptyFolderState } from "@/components/documents/EmptyFolderState";
import { FolderDialog } from "@/components/documents/FolderDialog";
import { ConfirmDialog } from "@/components/documents/ConfirmDialog";
import { ConnectionsPanel } from "@/components/integrations/ConnectionsPanel";
import { AccountingConnectCard } from "@/components/integrations/AccountingConnectCard";
import { BridgeConnectCard } from "@/components/integrations/BridgeConnectCard";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useDelayedFlag } from "@/lib/ui/useDelayedFlag";
import { AppHeader } from "@/components/layout/AppHeader";
import { DEFAULT_FOLDER_NAME } from "@/lib/folders/activeFolder";
import { setActiveSource } from "@/lib/source/setActiveSource";
import { useActiveFolderName } from "@/lib/folders/useActiveFolderName";
import {
  readSidebarCollapsedPreference,
  writeSidebarCollapsedPreference
} from "@/lib/ui/sidebarPreference";
import { clearActiveAnalysisId } from "@/lib/source/activeSource";
import { useActiveAnalysisId } from "@/lib/source/useActiveAnalysisId";
import {
  listUserFolders,
  createUserFolder,
  renameUserFoldersByName,
  deleteUserFoldersByName
} from "@/services/folderStore";
import {
  listUserAnalyses,
  deleteUserAnalysisById,
  deleteUserFolderAnalyses,
  renameUserFolder,
  moveAnalysisToFolder
} from "@/services/analysisStore";
import { firebaseAuthGateway } from "@/services/auth";
import type { AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

type FolderDialogState = {
  isOpen: boolean;
  mode: "create" | "rename";
  targetName: string;
};

type DeleteFolderConfirm = {
  isOpen: boolean;
  folderName: string;
  analysisCount: number;
};

export function DocumentsView() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(() => firebaseAuthGateway.getCurrentUser());
  const [loading, setLoading] = useState(true);
  // Loader visible uniquement si le chargement dépasse 400 ms — évite le flash.
  const showSlowLoader = useDelayedFlag(loading);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [folderNames, setFolderNames] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState(DEFAULT_FOLDER_NAME);
  const [dialog, setDialog] = useState<FolderDialogState>({ isOpen: false, mode: "create", targetName: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteFolderConfirm>({ isOpen: false, folderName: "", analysisCount: 0 });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => readSidebarCollapsedPreference());
  // Dossier actif (sources statiques multi-exercices). Réagit aux changements
  // via le hook réactif — l'utilisateur peut activer un dossier depuis le
  // bandeau ci-dessous et la sélection se propage immédiatement à Synthèse.
  const activeFolderName = useActiveFolderName();
  // Conservé pour le cleanup à la suppression d'une analyse — si l'analyse
  // supprimée est l'override actif, on clear le pointeur localStorage pour
  // éviter qu'il pointe sur un fantôme.
  const explicitActiveId = useActiveAnalysisId();

  useEffect(() => {
    return firebaseAuthGateway.subscribe(setUser);
  }, []);

  const greetingName = useMemo(() => {
    if (!user) return "Utilisateur";
    if (user.displayName?.trim()) return user.displayName.trim().split(" ")[0] || "Utilisateur";
    if (user.email) return user.email.split("@")[0] || "Utilisateur";
    return "Utilisateur";
  }, [user]);

  async function handleLogout() {
    await firebaseAuthGateway.signOut();
    router.replace("/login");
  }

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [allAnalyses, folders] = await Promise.all([
        listUserAnalyses(user.uid),
        listUserFolders(user.uid)
      ]);
      setAnalyses(allAnalyses);
      const names = folders.map((f) => f.name);
      if (!names.some((n) => n.toLowerCase() === DEFAULT_FOLDER_NAME.toLowerCase())) {
        names.unshift(DEFAULT_FOLDER_NAME);
      }
      setFolderNames(names);
    } catch {
      setAnalyses([]);
      setFolderNames([DEFAULT_FOLDER_NAME]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const folderItems = useMemo(() => {
    return folderNames.map((name) => ({
      name,
      analysisCount: analyses.filter(
        (a) => a.folderName.toLowerCase() === name.toLowerCase()
      ).length
    }));
  }, [folderNames, analyses]);

  const filteredAnalyses = useMemo(() => {
    return analyses
      .filter((a) => a.folderName.toLowerCase() === activeFolder.toLowerCase())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [analyses, activeFolder]);

  const lastUpdated = filteredAnalyses[0]?.createdAt
    ? new Date(filteredAnalyses[0].createdAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric"
      })
    : null;

  function toggleSidebar() {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsedPreference(next);
      return next;
    });
  }

  async function handleCreateFolder(name: string) {
    if (!user) return;
    await createUserFolder(user.uid, name);
    setDialog({ isOpen: false, mode: "create", targetName: "" });
    setActiveFolder(name);
    void loadData();
  }

  async function handleRenameFolder(newName: string) {
    if (!user) return;
    const oldName = dialog.targetName;
    await renameUserFolder(user.uid, oldName, newName);
    await renameUserFoldersByName(user.uid, oldName, newName);
    setDialog({ isOpen: false, mode: "create", targetName: "" });
    if (activeFolder.toLowerCase() === oldName.toLowerCase()) {
      setActiveFolder(newName);
    }
    void loadData();
  }

  function requestDeleteFolder(name: string) {
    const count = analyses.filter((a) => a.folderName.toLowerCase() === name.toLowerCase()).length;
    setDeleteConfirm({ isOpen: true, folderName: name, analysisCount: count });
  }

  async function confirmDeleteFolder() {
    if (!user) return;
    const name = deleteConfirm.folderName;
    setDeleteConfirm({ isOpen: false, folderName: "", analysisCount: 0 });
    await deleteUserFolderAnalyses(user.uid, name);
    await deleteUserFoldersByName(user.uid, name);
    if (activeFolder.toLowerCase() === name.toLowerCase()) {
      setActiveFolder(DEFAULT_FOLDER_NAME);
    }
    void loadData();
  }

  async function handleDeleteAnalysis(id: string) {
    if (!user) return;
    // Si on supprime l'analyse marquée comme source active, on vide le pointeur —
    // sinon le résolveur retomberait dessus indéfiniment côté hook (l'event est
    // émis mais l'ID disparaît côté DB seulement).
    if (explicitActiveId === id) {
      clearActiveAnalysisId();
    }
    await deleteUserAnalysisById(user.uid, id);
    void loadData();
  }

  async function handleMoveAnalysis(id: string, targetFolder: string) {
    if (!user) return;
    await moveAnalysisToFolder(user.uid, id, targetFolder);
    void loadData();
  }

  if (!user) {
    return (
      <section className="precision-card mx-auto max-w-5xl rounded-2xl p-8 text-center">
        <p className="text-sm text-white/70">Connectez-vous pour accéder à vos documents.</p>
      </section>
    );
  }

  return (
    <section className="w-full space-y-4">
      {/* Header global unifié */}
      <AppHeader
        companyName="Documents"
        subtitle="Gestion de vos analyses financières"
        searchPlaceholder="Rechercher un fichier, un dossier..."
        actionSlot={
          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="btn-gold-premium inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            Nouvelle analyse
          </button>
        }
      />

      {/* Grille sidebar navigation + contenu */}
      <div className="relative grid gap-6 grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)]">
        <AppSidebar activeRoute="documents" accountFirstName={greetingName} />

        {/* ===== ZONE CONTENU ===== */}
        <div className="space-y-4">
          {/* Bandeau résumé : liste de TOUTES les connexions actives
              (comptables + bancaires). Vue d'ensemble persistante. */}
          <ConnectionsPanel onChanged={() => void loadData()} />

          {/* Cards détail repliables — même format pour les 2 sources. */}
          <AccountingConnectCard onChanged={() => void loadData()} />
          <BridgeConnectCard onChanged={() => void loadData()} />

          {/* Tabs dossiers */}
          <div className="precision-card rounded-2xl">
            <FolderTabs
              folders={folderItems}
              activeFolder={activeFolder}
              onSelect={setActiveFolder}
              onRename={(name) => setDialog({ isOpen: true, mode: "rename", targetName: name })}
              onDelete={(name) => requestDeleteFolder(name)}
              onCreate={() => setDialog({ isOpen: true, mode: "create", targetName: "" })}
            />
          </div>

          {/* Stats + Bouton "Source active du dashboard" au niveau dossier.
              Quand on clique, on enregistre `activeFolderName` (toutes les
              liasses du dossier deviennent disponibles via le sélecteur de
              période côté Synthèse) et on clear l'override par analyse — ça
              force le résolveur à utiliser le dossier comme source statique. */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-3">
              <Folder className="h-4 w-4 text-quantis-gold/70" />
              <p className="text-xs text-white/45">
                {filteredAnalyses.length} analyse{filteredAnalyses.length !== 1 ? "s" : ""}
                {lastUpdated ? ` · Dernière mise à jour le ${lastUpdated}` : ""}
              </p>
            </div>
            {filteredAnalyses.length > 0 ? (
              activeFolderName?.toLowerCase() === activeFolder.toLowerCase() ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-quantis-gold/40 bg-quantis-gold/10 px-3 py-1 text-[11px] font-semibold text-quantis-gold">
                  <span className="h-1.5 w-1.5 rounded-full bg-quantis-gold" />
                  Source active du dashboard
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveSource({ kind: "folder", folderName: activeFolder })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/75 transition-colors hover:border-quantis-gold/40 hover:bg-quantis-gold/10 hover:text-quantis-gold"
                >
                  Définir comme source active
                </button>
              )
            ) : null}
          </div>

          {/* Cards — loader retardé pour éviter le flash <400ms. */}
          {loading && showSlowLoader ? (
            <div className="py-20 text-center">
              <p className="text-sm text-white/50">Chargement des analyses...</p>
            </div>
          ) : filteredAnalyses.length === 0 && !loading ? (
            <EmptyFolderState
              folderName={activeFolder}
              onUpload={() => router.push("/upload")}
            />
          ) : (
            <AnalysisCardGrid
              analyses={filteredAnalyses}
              folders={folderNames}
              onDelete={(id) => void handleDeleteAnalysis(id)}
              onMove={(id, target) => void handleMoveAnalysis(id, target)}
              activeFolderName={activeFolderName}
            />
          )}
        </div>
      </div>

      <FolderDialog
        isOpen={dialog.isOpen}
        mode={dialog.mode}
        initialName={dialog.mode === "rename" ? dialog.targetName : ""}
        onSubmit={(name) => {
          if (dialog.mode === "create") void handleCreateFolder(name);
          else void handleRenameFolder(name);
        }}
        onClose={() => setDialog({ isOpen: false, mode: "create", targetName: "" })}
      />

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Supprimer le dossier"
        message={
          deleteConfirm.analysisCount > 0
            ? `Le dossier "${deleteConfirm.folderName}" et ses ${deleteConfirm.analysisCount} analyse(s) seront supprimés définitivement.`
            : `Le dossier "${deleteConfirm.folderName}" sera supprimé définitivement.`
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void confirmDeleteFolder()}
        onCancel={() => setDeleteConfirm({ isOpen: false, folderName: "", analysisCount: 0 })}
      />
    </section>
  );
}

// NavRow — identique à celui de SyntheseView/AnalysisDetailView : texte hérite
// du `text-sm` du parent <nav>, pas d'override de taille, mêmes couleurs/gaps.
function NavRow({
  children,
  icon,
  active,
  collapsed,
  disabled,
  onClick
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
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
