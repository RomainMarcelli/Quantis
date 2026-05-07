// File: components/documents/AccountingDetailsPanel.tsx
// Role: panneau qui s'affiche sous la grille de tuiles dans /documents quand
// une source comptable est active. Présente le récap (nom, dernière sync) +
// les 3 actions (Synchroniser, Désactiver, Déconnecter) + une section
// "Détails techniques" repliable (token tronqué, provider, type d'auth…).
//
// Les sources dynamiques (Pennylane / MyUnisoft / Odoo) ont une connexion
// distante avec un token — on affiche le détail technique. La source FEC
// (Documents) n'a pas de connexion distante mais a un folder éventuel +
// les fichiers uploadés ; on affiche un descriptif différent.
"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  PowerOff,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { AccountingSource } from "@/types/dataSources";
import type { ConnectionDto } from "@/app/api/integrations/connections/route";

type AccountingDetailsPanelProps = {
  source: AccountingSource;
  /** Connexion correspondante (null pour FEC ou si non chargée). */
  connection: ConnectionDto | null;
  /** Folder FEC actif (uniquement quand source === "fec"). */
  fecFolderName?: string | null;
  /** Compteur de liasses dans le folder FEC actif (uniquement source === "fec"). */
  fecAnalysisCount?: number;
  /** Action : resync de la source (génère une nouvelle analyse). */
  onSync: () => void | Promise<void>;
  /** Action : désactiver la source (toggle off, ne disconnect PAS). */
  onDeactivate: () => void | Promise<void>;
  /** Action : déconnecter (supprime la connexion + entités tierces). */
  onDisconnect: () => void | Promise<void>;
  syncing?: boolean;
  disconnecting?: boolean;
  /**
   * State du switcher "Changer de source" — la grille des autres sources
   * est rendue par le parent (DocumentsView) en dessous du panneau, mais
   * le bouton de toggle vit ici pour rester dans le flux des actions.
   */
  switcherOpen?: boolean;
  onToggleSwitcher?: () => void;
};

const SOURCE_LABELS: Record<AccountingSource, string> = {
  pennylane: "Pennylane",
  myunisoft: "MyUnisoft",
  odoo: "Odoo",
  fec: "Documents (Excel / FEC)",
};

export function AccountingDetailsPanel({
  source,
  connection,
  fecFolderName,
  fecAnalysisCount = 0,
  onSync,
  onDeactivate,
  onDisconnect,
  syncing = false,
  disconnecting = false,
  switcherOpen = false,
  onToggleSwitcher,
}: AccountingDetailsPanelProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const isFec = source === "fec";

  const lastSyncLabel = connection?.lastSyncAt
    ? formatRelativeFrench(connection.lastSyncAt)
    : isFec
      ? "—"
      : "Jamais";

  return (
    <section
      className="rounded-2xl p-5"
      style={{
        backgroundColor: "var(--app-card-glass-bg)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid rgba(197, 160, 89, 0.25)",
      }}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "#22C55E",
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div>
            <p style={{ color: "var(--app-text-primary)", fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {SOURCE_LABELS[source]}
              {isFec && fecFolderName ? (
                <span style={{ color: "var(--app-text-secondary)", fontWeight: 400, fontSize: 14 }}>
                  {" · "}
                  {fecFolderName}
                </span>
              ) : null}
            </p>
            <p className="mt-0.5" style={{ color: "var(--app-text-secondary)", fontSize: 14 }}>
              {isFec
                ? `${fecAnalysisCount} liasse${fecAnalysisCount > 1 ? "s" : ""} dans ce dossier · Dernière mise à jour ${lastSyncLabel}`
                : `Dernière sync ${lastSyncLabel}`}
            </p>
          </div>
        </div>
      </header>

      {/* Actions principales */}
      <div className="flex flex-wrap items-center gap-2">
        {!isFec ? (
          <ActionButton
            icon={syncing ? Loader2 : RefreshCw}
            spinning={syncing}
            onClick={onSync}
            disabled={syncing || disconnecting}
            tone="gold"
          >
            {syncing ? "Synchronisation…" : "Synchroniser"}
          </ActionButton>
        ) : null}
        <ActionButton
          icon={PowerOff}
          onClick={onDeactivate}
          disabled={syncing || disconnecting}
          tone="neutral"
        >
          Désactiver
        </ActionButton>
        {!isFec ? (
          <ActionButton
            icon={disconnecting ? Loader2 : Trash2}
            spinning={disconnecting}
            onClick={onDisconnect}
            disabled={syncing || disconnecting}
            tone="danger"
          >
            {disconnecting ? "Déconnexion…" : "Déconnecter"}
          </ActionButton>
        ) : null}
      </div>

      {/* Bouton-lien "Changer de source ▾" — discret, aligné à droite,
          au-dessus de la section "Détails techniques". Le rendu de la
          grille dépliée est géré par le parent (DocumentsView). */}
      {onToggleSwitcher ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onToggleSwitcher}
            aria-expanded={switcherOpen}
            className="inline-flex items-center gap-1 rounded text-[14px] transition-colors"
            style={{
              color: "var(--app-text-secondary)",
              background: "transparent",
              border: "none",
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "rgba(255, 255, 255, 0.95)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "rgba(255, 255, 255, 0.55)";
            }}
          >
            {switcherOpen ? "Masquer" : "Changer de source"}
            {switcherOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      ) : null}

      {/* Détails techniques repliables — sources dynamiques uniquement
          (FEC n'a pas de token / company ID) */}
      {!isFec && connection ? (
        <div className="mt-4 border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
          <button
            type="button"
            onClick={() => setShowTechnical((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors"
            style={{ color: "var(--app-text-secondary)" }}
          >
            {showTechnical ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Détails techniques
          </button>
          {showTechnical ? (
            <dl
              className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2"
              style={{ color: "var(--app-text-secondary)" }}
            >
              <TechRow label="Provider" value={connection.provider} mono />
              <TechRow label="Token" value={connection.tokenPreview} mono />
              {connection.externalCompanyId ? (
                <TechRow label="Company ID" value={connection.externalCompanyId} mono />
              ) : null}
              <TechRow
                label="Connecté le"
                value={new Date(connection.createdAt).toLocaleString("fr-FR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              />
              <TechRow
                label="Statut"
                value={connection.status}
                mono
                tone={connection.status === "active" ? "good" : "warn"}
              />
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type ActionButtonProps = {
  icon: React.ComponentType<{ className?: string }>;
  spinning?: boolean;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  tone: "gold" | "neutral" | "danger";
  children: React.ReactNode;
};

function ActionButton({ icon: Icon, spinning, onClick, disabled, tone, children }: ActionButtonProps) {
  const styles = {
    gold: {
      color: "#C5A059",
      backgroundColor: "rgba(197, 160, 89, 0.12)",
      border: "1px solid rgba(197, 160, 89, 0.4)",
    },
    neutral: {
      color: "var(--app-text-primary)",
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
    },
    danger: {
      color: "var(--app-danger-soft)",
      backgroundColor: "rgba(239, 68, 68, 0.08)",
      border: "1px solid rgba(239, 68, 68, 0.25)",
    },
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40"
      style={styles[tone]}
    >
      <Icon className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`} />
      {children}
    </button>
  );
}

function TechRow({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "good" | "warn";
}) {
  const valueColor = tone === "good" ? "#86EFAC" : tone === "warn" ? "#FBBF24" : "#E5E7EB";
  return (
    <>
      <dt style={{ color: "var(--app-text-tertiary)" }}>{label}</dt>
      <dd className={mono ? "font-mono" : ""} style={{ color: valueColor }}>
        {value}
      </dd>
    </>
  );
}

function formatRelativeFrench(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `il y a ${diffD} j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
