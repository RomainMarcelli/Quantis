"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Folder,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sparkles,
  UserCircle2
} from "lucide-react";
import { FolderTabs } from "@/components/documents/FolderTabs";
import { AnalysisCardGrid } from "@/components/documents/AnalysisCardGrid";
import { EmptyFolderState } from "@/components/documents/EmptyFolderState";
import { FolderDialog } from "@/components/documents/FolderDialog";
import { ConfirmDialog } from "@/components/documents/ConfirmDialog";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { DEFAULT_FOLDER_NAME } from "@/lib/folders/activeFolder";
import {
  readSidebarCollapsedPreference,
  writeSidebarCollapsedPreference
} from "@/lib/ui/sidebarPreference";
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
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [folderNames, setFolderNames] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState(DEFAULT_FOLDER_NAME);
  const [dialog, setDialog] = useState<FolderDialogState>({ isOpen: false, mode: "create", targetName: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteFolderConfirm>({ isOpen: false, folderName: "", analysisCount: 0 });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => readSidebarCollapsedPreference());

  useEffect(() => {
    return firebaseAuthGateway.subscribe(setUser);
  }, []);

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
    <section className="relative z-10 mx-auto w-full max-w-7xl space-y-4">
      {/* Header pleine largeur — hors de la grille sidebar */}
      <header className="precision-card flex w-full items-center justify-between rounded-2xl px-5 py-4">
        <div className="flex items-center gap-3">
          <QuantisLogo withText={false} size={30} imageClassName="h-7 w-7 object-contain" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-quantis-gold">Documents</p>
            <p className="text-sm text-white/50">Gestion de vos analyses financières</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/upload")}
          className="btn-gold-premium inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold"
        >
          <Plus className="h-3.5 w-3.5" />
          Nouvelle analyse
        </button>
      </header>

      {/* Grille sidebar navigation + contenu */}
      <div className={`grid gap-4 ${isSidebarCollapsed ? "grid-cols-[88px_minmax(0,1fr)]" : "grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]"}`}>

        {/* ===== SIDEBAR NAVIGATION GLOBALE ===== */}
        <aside className="precision-card relative h-fit rounded-2xl p-4 lg:sticky lg:top-4">
          <div className={`mb-3 flex ${isSidebarCollapsed ? "justify-center" : "justify-end"}`}>
            <button
              type="button"
              onClick={toggleSidebar}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white/85 transition hover:border-quantis-gold/60"
              title={isSidebarCollapsed ? "Ouvrir le menu" : "Réduire le menu"}
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
          <nav className="space-y-1 text-sm">
            <NavRow icon={<LayoutDashboard className="h-4 w-4" />} onClick={() => router.push("/analysis")} collapsed={isSidebarCollapsed}>
              Tableau de bord
            </NavRow>
            <NavRow icon={<Sparkles className="h-4 w-4" />} onClick={() => router.push("/synthese")} collapsed={isSidebarCollapsed}>
              Synthèse
            </NavRow>
            <NavRow icon={<FileText className="h-4 w-4" />} active onClick={() => {}} collapsed={isSidebarCollapsed}>
              Documents
            </NavRow>
          </nav>
          {!isSidebarCollapsed ? (
            <div className="mt-4 space-y-1 border-t border-white/10 pt-3">
              <NavRow icon={<Settings className="h-4 w-4" />} onClick={() => router.push("/settings")} collapsed={false}>
                Réglages
              </NavRow>
              <NavRow icon={<UserCircle2 className="h-4 w-4" />} onClick={() => router.push("/account")} collapsed={false}>
                Compte
              </NavRow>
              <NavRow
                icon={<LogOut className="h-4 w-4" />}
                onClick={() => { void firebaseAuthGateway.signOut(); router.push("/login"); }}
                collapsed={false}
              >
                Déconnexion
              </NavRow>
            </div>
          ) : null}
        </aside>

        {/* ===== ZONE CONTENU ===== */}
        <div className="space-y-4">
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

          {/* Stats */}
          <div className="flex items-center gap-3 px-1">
            <Folder className="h-4 w-4 text-quantis-gold/70" />
            <p className="text-xs text-white/45">
              {filteredAnalyses.length} analyse{filteredAnalyses.length !== 1 ? "s" : ""}
              {lastUpdated ? ` · Dernière mise à jour le ${lastUpdated}` : ""}
            </p>
          </div>

          {/* Cards */}
          {loading ? (
            <div className="py-20 text-center">
              <p className="text-sm text-white/50">Chargement des analyses...</p>
            </div>
          ) : filteredAnalyses.length === 0 ? (
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

function NavRow({
  icon,
  active,
  onClick,
  collapsed,
  children
}: {
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition-colors ${
        active
          ? "bg-quantis-gold/10 font-semibold text-quantis-gold"
          : "text-white/60 hover:bg-white/5 hover:text-white/85"
      } ${collapsed ? "justify-center" : ""}`}
      title={collapsed ? String(children) : undefined}
    >
      {icon}
      {!collapsed ? <span>{children}</span> : null}
    </button>
  );
}
