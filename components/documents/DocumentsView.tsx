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
import { AppSidebar } from "@/components/layout/AppSidebar";
import { useDelayedFlag } from "@/lib/ui/useDelayedFlag";
import { AppHeader } from "@/components/layout/AppHeader";
import { DEFAULT_FOLDER_NAME } from "@/lib/folders/folderRegistry";
import {
  readSidebarCollapsedPreference,
  writeSidebarCollapsedPreference
} from "@/lib/ui/sidebarPreference";
import { useActiveDataSource } from "@/hooks/useActiveDataSource";
import { useBridgeStatus } from "@/lib/banking/useBridgeStatus";
import { SourceTile, type SourceTileState } from "@/components/documents/SourceTile";
import { AccountingDetailsPanel } from "@/components/documents/AccountingDetailsPanel";
import { BankingDetailsPanel } from "@/components/documents/BankingDetailsPanel";
import { ConnectSourceModal } from "@/components/documents/ConnectSourceModal";
import { SourceSwitchConfirmModal } from "@/components/documents/SourceSwitchConfirmModal";
import type { ProviderId } from "@/components/integrations/AccountingConnectionWizard";
import type { AccountingSource } from "@/types/dataSources";
import type { ConnectionDto } from "@/app/api/integrations/connections/route";
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

  // Connexions actives — utilisées pour calculer l'état de chaque tuile
  // (connectée vs déconnectée). Chargées en parallèle avec analyses + folders.
  const [connections, setConnections] = useState<ConnectionDto[]>([]);

  // Bridge — status temps réel pour la tuile Banque + le détail.
  const bridgeStatus = useBridgeStatus();

  // Modal "switch hors Documents" : seulement quand la source active est FEC
  // et que l'utilisateur clique sur Pennylane / MyUnisoft / Odoo.
  const [pendingSwitch, setPendingSwitch] = useState<{
    target: AccountingSource;
    targetLabel: string;
  } | null>(null);

  // Modal de connexion d'une source (wizard) ouverte avec un provider précis.
  const [connectModalProvider, setConnectModalProvider] = useState<ProviderId | null>(null);

  // États transients pour les actions du panneau de détails.
  const [actionBusy, setActionBusy] = useState<{ syncing: boolean; disconnecting: boolean }>(
    { syncing: false, disconnecting: false }
  );
  const [bridgeBusy, setBridgeBusy] = useState<{ syncing: boolean; disconnecting: boolean }>(
    { syncing: false, disconnecting: false }
  );
  // Dossier actif (sources statiques multi-exercices). Réagit aux changements
  // Source active globale (Firestore via useActiveDataSource). Mise à jour
  // par les toggles binaires de cette page. `activeFolderName` ici reflète
  // uniquement la sous-sélection FEC (multi-clients) ; les autres sources
  // (Pennylane, MyUnisoft, Odoo, Bridge) n'ont pas de notion de folder.
  const {
    activeAccountingSource,
    activeFecFolderName: activeFolderName,
    activeBankingSource,
    setActiveAccountingSource,
    setActiveBankingSource,
  } = useActiveDataSource();

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
      const [allAnalyses, folders, idToken] = await Promise.all([
        listUserAnalyses(user.uid),
        listUserFolders(user.uid),
        firebaseAuthGateway.getIdToken(),
      ]);
      setAnalyses(allAnalyses);
      const names = folders.map((f) => f.name);
      if (!names.some((n) => n.toLowerCase() === DEFAULT_FOLDER_NAME.toLowerCase())) {
        names.unshift(DEFAULT_FOLDER_NAME);
      }
      setFolderNames(names);
      // Connexions actives (Pennylane / MyUnisoft / Odoo) — pour décider
      // de l'état "connectée vs déconnectée" de chaque tuile. Bridge est
      // tracké séparément par useBridgeStatus.
      if (idToken) {
        const res = await fetch("/api/integrations/connections", {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { connections?: ConnectionDto[] };
          setConnections((data.connections ?? []).filter((c) => c.provider !== "bridge"));
        } else {
          setConnections([]);
        }
      }
    } catch {
      setAnalyses([]);
      setFolderNames([DEFAULT_FOLDER_NAME]);
      setConnections([]);
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
    // La source active étant désormais une "kind" (pennylane/myunisoft/odoo/fec),
    // pas un id, on n'a pas de pointeur à nettoyer ici. Si l'utilisateur
    // supprime sa dernière liasse d'une source active, le dashboard affichera
    // un état vide jusqu'à ce qu'il bascule via le toggle binaire.
    await deleteUserAnalysisById(user.uid, id);
    void loadData();
  }

  async function handleMoveAnalysis(id: string, targetFolder: string) {
    if (!user) return;
    await moveAnalysisToFolder(user.uid, id, targetFolder);
    void loadData();
  }

  // ─── Mapping provider → state de tuile ────────────────────────────────
  function tileStateForAccounting(target: AccountingSource): SourceTileState {
    if (activeAccountingSource === target) return "active";
    if (target === "fec") {
      // FEC est "connecté" dès qu'au moins une analyse FEC/upload existe.
      const hasFec = analyses.some((a) => {
        const provider = a.sourceMetadata?.provider ?? null;
        return provider === "fec" || provider === "upload";
      });
      return hasFec ? "connected" : "disconnected";
    }
    const hasConnection = connections.some(
      (c) => c.provider === target && c.status === "active"
    );
    return hasConnection ? "connected" : "disconnected";
  }

  function tileStateForBanking(): SourceTileState {
    if (activeBankingSource === "bridge") return "active";
    return bridgeStatus.status?.connected ? "connected" : "disconnected";
  }

  // ─── Click handlers — tuiles ──────────────────────────────────────────
  function providerToWizard(target: AccountingSource): ProviderId | null {
    if (target === "pennylane" || target === "myunisoft" || target === "odoo") return target;
    if (target === "fec") return "other"; // wizard "Autre logiciel" gère l'upload manuel
    return null;
  }

  function handleAccountingTileClick(target: AccountingSource) {
    const state = tileStateForAccounting(target);
    if (state === "active") {
      // Toggle off : désactive la source.
      void setActiveAccountingSource(null);
      return;
    }
    if (state === "disconnected") {
      // Pas connectée → ouvrir le wizard (modal).
      const wizardId = providerToWizard(target);
      if (wizardId) setConnectModalProvider(wizardId);
      return;
    }
    // Connectée mais inactive → activer.
    // Cas spécial : si l'utilisateur quitte FEC pour aller sur Pennylane /
    // MyUnisoft / Odoo, on demande confirmation.
    if (activeAccountingSource === "fec" && target !== "fec") {
      const labels: Record<AccountingSource, string> = {
        pennylane: "Pennylane",
        myunisoft: "MyUnisoft",
        odoo: "Odoo",
        fec: "Documents",
      };
      setPendingSwitch({ target, targetLabel: labels[target] });
      return;
    }
    // Pour FEC : on prend le folder courant (activeFolder) comme sélection.
    void setActiveAccountingSource(target, target === "fec" ? activeFolder : null);
  }

  async function confirmPendingSwitch() {
    if (!pendingSwitch) return;
    const { target } = pendingSwitch;
    setPendingSwitch(null);
    await setActiveAccountingSource(target, null);
  }

  function handleBankingTileClick() {
    const state = tileStateForBanking();
    if (state === "active") {
      void setActiveBankingSource(null);
      return;
    }
    if (state === "disconnected") {
      void handleBridgeConnect();
      return;
    }
    // connected → activate
    void setActiveBankingSource("bridge");
  }

  // ─── Bridge actions (utilise les endpoints existants) ─────────────────
  async function handleBridgeConnect() {
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) return;
    const res = await fetch("/api/integrations/bridge/connect", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => ({}))) as { redirectUrl?: string };
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
    }
  }

  async function handleBridgeSync() {
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) return;
    setBridgeBusy((s) => ({ ...s, syncing: true }));
    try {
      await fetch("/api/integrations/bridge/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await bridgeStatus.refresh();
    } finally {
      setBridgeBusy((s) => ({ ...s, syncing: false }));
    }
  }

  async function handleBridgeDisconnect() {
    if (!confirm("Déconnecter Bridge ? Les comptes synchronisés seront supprimés.")) return;
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) return;
    setBridgeBusy((s) => ({ ...s, disconnecting: true }));
    try {
      await fetch("/api/integrations/bridge/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await bridgeStatus.refresh();
      await setActiveBankingSource(null);
    } finally {
      setBridgeBusy((s) => ({ ...s, disconnecting: false }));
    }
  }

  // ─── Accounting actions (sync / disconnect via la connexion active) ───
  function activeAccountingConnection(): ConnectionDto | null {
    if (!activeAccountingSource || activeAccountingSource === "fec") return null;
    return (
      connections.find(
        (c) => c.provider === activeAccountingSource && c.status === "active"
      ) ?? null
    );
  }

  async function handleAccountingSync() {
    const conn = activeAccountingConnection();
    if (!conn) return;
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) return;
    setActionBusy((s) => ({ ...s, syncing: true }));
    try {
      await fetch(`/api/integrations/${conn.provider}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: conn.id }),
      });
      await loadData();
    } finally {
      setActionBusy((s) => ({ ...s, syncing: false }));
    }
  }

  async function handleAccountingDisconnect() {
    const conn = activeAccountingConnection();
    if (!conn) return;
    if (!confirm(`Déconnecter ${conn.provider} ? Les données synchronisées seront supprimées.`))
      return;
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) return;
    setActionBusy((s) => ({ ...s, disconnecting: true }));
    try {
      await fetch(`/api/integrations/${conn.provider}/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: conn.id }),
      });
      await setActiveAccountingSource(null);
      await loadData();
    } finally {
      setActionBusy((s) => ({ ...s, disconnecting: false }));
    }
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
        <div className="space-y-6">
          {/* ─── BLOC 1 — Source comptable ──────────────────────────── */}
          <SourceBlock
            title="Source comptable"
            subtitle="Choisissez votre source de données comptables. Une seule peut être active à la fois."
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <SourceTile
                name="Pennylane"
                subtitle="Connexion automatique"
                logo={<TileLogo src="/images/integrations/pennylane.png" alt="Pennylane" />}
                state={tileStateForAccounting("pennylane")}
                onClick={() => handleAccountingTileClick("pennylane")}
              />
              <SourceTile
                name="MyUnisoft"
                subtitle="Connexion automatique"
                logo={<TileLogo src="/images/integrations/myunisoft.png" alt="MyUnisoft" />}
                state={tileStateForAccounting("myunisoft")}
                onClick={() => handleAccountingTileClick("myunisoft")}
              />
              <SourceTile
                name="Odoo"
                subtitle="API key + URL"
                logo={<TileLogo src="/images/integrations/odoo.svg" alt="Odoo" />}
                state={tileStateForAccounting("odoo")}
                onClick={() => handleAccountingTileClick("odoo")}
              />
              <SourceTile
                name="Tiime"
                subtitle="Bientôt disponible"
                logo={<TileLogo src="/images/integrations/tiime.svg" alt="Tiime" />}
                state="unavailable"
                onClick={() => undefined}
              />
              <SourceTile
                name="Documents"
                subtitle="Upload Excel / FEC"
                logo={<FileText className="h-5 w-5 text-quantis-gold" />}
                state={tileStateForAccounting("fec")}
                onClick={() => handleAccountingTileClick("fec")}
              />
            </div>

            {/* Panneau détails si une source comptable est active. */}
            {activeAccountingSource ? (
              <AccountingDetailsPanel
                source={activeAccountingSource}
                connection={activeAccountingConnection()}
                fecFolderName={activeFolderName}
                fecAnalysisCount={
                  activeAccountingSource === "fec"
                    ? analyses.filter((a) => {
                        const provider = a.sourceMetadata?.provider ?? null;
                        if (provider !== "fec" && provider !== "upload") return false;
                        if (!activeFolderName) return true;
                        return (a.folderName ?? "").trim().toLowerCase() ===
                          activeFolderName.toLowerCase();
                      }).length
                    : 0
                }
                onSync={handleAccountingSync}
                onDeactivate={() => setActiveAccountingSource(null)}
                onDisconnect={handleAccountingDisconnect}
                syncing={actionBusy.syncing}
                disconnecting={actionBusy.disconnecting}
              />
            ) : null}
          </SourceBlock>

          {/* ─── BLOC 2 — Source bancaire ───────────────────────────── */}
          <SourceBlock
            title="Source bancaire"
            subtitle="Indépendante de la source comptable. Bridge agrège vos comptes bancaires en temps réel via Open Banking PSD2."
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <SourceTile
                name="Bridge"
                subtitle="Open Banking PSD2"
                logo={<TileLogo src="/images/integrations/bridge.svg" alt="Bridge" fallback="🏦" />}
                state={tileStateForBanking()}
                onClick={handleBankingTileClick}
              />
            </div>

            {activeBankingSource === "bridge" ? (
              <BankingDetailsPanel
                status={bridgeStatus.status ?? null}
                onSync={handleBridgeSync}
                onDeactivate={() => setActiveBankingSource(null)}
                onDisconnect={handleBridgeDisconnect}
                syncing={bridgeBusy.syncing}
                disconnecting={bridgeBusy.disconnecting}
              />
            ) : null}
          </SourceBlock>

          {/* ─── BLOC 3 conditionnel — Dossiers & fichiers (FEC) ────── */}
          {activeAccountingSource === "fec" ? (
            <SourceBlock title="Dossiers & fichiers">
              <div className="precision-card rounded-2xl">
                <FolderTabs
                  folders={folderItems}
                  activeFolder={activeFolder}
                  onSelect={(name) => {
                    setActiveFolder(name);
                    void setActiveAccountingSource("fec", name);
                  }}
                  onRename={(name) => setDialog({ isOpen: true, mode: "rename", targetName: name })}
                  onDelete={(name) => requestDeleteFolder(name)}
                  onCreate={() => setDialog({ isOpen: true, mode: "create", targetName: "" })}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 px-1">
                <Folder className="h-4 w-4 text-quantis-gold/70" />
                <p className="text-xs text-white/45">
                  {filteredAnalyses.length} analyse{filteredAnalyses.length !== 1 ? "s" : ""}
                  {lastUpdated ? ` · Dernière mise à jour le ${lastUpdated}` : ""}
                </p>
              </div>

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
            </SourceBlock>
          ) : null}
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

      {/* Modal wizard de connexion (ouverte au clic sur tuile non connectée). */}
      <ConnectSourceModal
        open={connectModalProvider !== null}
        provider={connectModalProvider}
        onClose={() => setConnectModalProvider(null)}
        onConnected={async () => {
          setConnectModalProvider(null);
          await loadData();
        }}
      />

      {/* Modal de confirmation lors du switch FEC → autre source. */}
      <SourceSwitchConfirmModal
        open={pendingSwitch !== null}
        targetName={pendingSwitch?.targetLabel ?? ""}
        onConfirm={() => void confirmPendingSwitch()}
        onCancel={() => setPendingSwitch(null)}
      />
    </section>
  );
}

// ─── Sous-composants utilitaires ────────────────────────────────────────

/**
 * Bandeau d'un bloc (titre uppercase + sous-titre + contenu).
 * Pose la hiérarchie typo demandée par la spec : titre en uppercase petit
 * text-tertiary, contenu en dessous.
 */
function SourceBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="px-1">
        <p
          style={{
            color: "rgba(255, 255, 255, 0.45)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </p>
        {subtitle ? (
          <p className="mt-1" style={{ color: "#9CA3AF", fontSize: 13, lineHeight: 1.5, maxWidth: 720 }}>
            {subtitle}
          </p>
        ) : null}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * Vignette logo dans une tuile — gère le fallback (emoji ou icône) si
 * l'image n'est pas chargée.
 */
function TileLogo({
  src,
  alt,
  fallback,
}: {
  src: string;
  alt: string;
  fallback?: string;
}) {
  const [errored, setErrored] = useState(false);
  if (errored && fallback) {
    return <span className="text-lg">{fallback}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element -- logos hostés en static, pas besoin de next/image
  return (
    <img
      src={src}
      alt={alt}
      className="h-6 w-6 object-contain"
      onError={() => setErrored(true)}
    />
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
