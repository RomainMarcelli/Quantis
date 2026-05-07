// File: components/documents/BankingDetailsPanel.tsx
// Role: panneau qui s'affiche sous la tuile Bridge dans /documents quand
// la source bancaire est active. Présente le récap (n comptes, solde),
// les 3 actions Synchroniser / Désactiver / Déconnecter, et un détail
// technique repliable (lastSyncAt, lastSyncStatus).
//
// Distinct du panneau comptable : Bridge a sa propre forme de status
// (BridgeStatusDto) lue via `useBridgeStatus` côté parent.
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
import { Power } from "lucide-react";
import { formatCurrency } from "@/components/dashboard/formatting";

type BridgeStatusLike = {
  connected: boolean;
  accountsCount?: number;
  totalBalance?: number | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
};

type BankingDetailsPanelProps = {
  status: BridgeStatusLike | null;
  /** True = connecté ET activé (vert) ; false = connecté mais désactivé (rouge). */
  isActive: boolean;
  onSync: () => void | Promise<void>;
  onActivate: () => void | Promise<void>;
  onDeactivate: () => void | Promise<void>;
  onDisconnect: () => void | Promise<void>;
  syncing?: boolean;
  disconnecting?: boolean;
};

export function BankingDetailsPanel({
  status,
  isActive,
  onSync,
  onActivate,
  onDeactivate,
  onDisconnect,
  syncing = false,
  disconnecting = false,
}: BankingDetailsPanelProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const accountsCount = status?.accountsCount ?? 0;
  const totalBalance = status?.totalBalance ?? null;
  const lastSyncLabel = status?.lastSyncAt ? formatRelativeFrench(status.lastSyncAt) : "Jamais";

  // Pastille verte (active) ou rouge (désactivée). Cohérent avec le panneau
  // comptable : la pastille reflète l'état Firestore activeBankingSource.
  const dotColor = isActive ? "#22C55E" : "#EF4444";
  const dotBg = isActive ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)";
  const dotBorder = isActive ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)";

  return (
    <section
      className="rounded-2xl p-5"
      style={{
        backgroundColor: "rgba(15, 15, 18, 0.85)",
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
              backgroundColor: dotBg,
              border: `1px solid ${dotBorder}`,
              color: dotColor,
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div>
            <p style={{ color: "#FFFFFF", fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
              Bridge
              {!isActive ? (
                <span style={{ color: "#FCA5A5", fontWeight: 500, fontSize: 14 }}>
                  {" · "}
                  Désactivée
                </span>
              ) : null}
            </p>
            <p className="mt-0.5" style={{ color: "#9CA3AF", fontSize: 14 }}>
              {accountsCount > 0
                ? `${accountsCount} compte${accountsCount > 1 ? "s" : ""} synchronisé${accountsCount > 1 ? "s" : ""}${
                    totalBalance !== null ? ` · solde ${formatCurrency(totalBalance)}` : ""
                  } · Dernière sync ${lastSyncLabel}`
                : `Connexion établie · Dernière sync ${lastSyncLabel}`}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          icon={syncing ? Loader2 : RefreshCw}
          spinning={syncing}
          onClick={onSync}
          disabled={syncing || disconnecting}
          tone="gold"
        >
          {syncing ? "Synchronisation…" : "Synchroniser"}
        </ActionButton>
        {isActive ? (
          <ActionButton
            icon={PowerOff}
            onClick={onDeactivate}
            disabled={syncing || disconnecting}
            tone="neutral"
          >
            Désactiver
          </ActionButton>
        ) : (
          <ActionButton
            icon={Power}
            onClick={onActivate}
            disabled={syncing || disconnecting}
            tone="gold"
          >
            Activer
          </ActionButton>
        )}
        <ActionButton
          icon={disconnecting ? Loader2 : Trash2}
          spinning={disconnecting}
          onClick={onDisconnect}
          disabled={syncing || disconnecting}
          tone="danger"
        >
          {disconnecting ? "Déconnexion…" : "Déconnecter"}
        </ActionButton>
      </div>

      <div className="mt-4 border-t pt-3" style={{ borderColor: "rgba(255, 255, 255, 0.06)" }}>
        <button
          type="button"
          onClick={() => setShowTechnical((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors"
          style={{ color: "rgba(255, 255, 255, 0.45)" }}
        >
          {showTechnical ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Détails techniques
        </button>
        {showTechnical ? (
          <dl
            className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2"
            style={{ color: "#9CA3AF" }}
          >
            <TechRow label="Connecteur" value="Bridge (Open Banking PSD2)" />
            <TechRow label="Comptes" value={String(accountsCount)} mono />
            <TechRow
              label="Dernière sync"
              value={status?.lastSyncAt ?? "—"}
              mono
            />
            <TechRow
              label="Statut sync"
              value={status?.lastSyncStatus ?? "—"}
              mono
            />
          </dl>
        ) : null}
      </div>
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
      color: "rgba(255, 255, 255, 0.85)",
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
    },
    danger: {
      color: "#FCA5A5",
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
function TechRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt style={{ color: "rgba(255, 255, 255, 0.4)" }}>{label}</dt>
      <dd className={mono ? "font-mono" : ""} style={{ color: "#E5E7EB" }}>
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
