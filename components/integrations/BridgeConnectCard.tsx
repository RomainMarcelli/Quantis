// File: components/integrations/BridgeConnectCard.tsx
// Role: card "Banques" sur la page Documents. Bridge (Open Banking PSD2) est
// une source de donnée COMPLÉMENTAIRE — séparée des intégrations comptables.
//
// Structure (alignée avec AccountingConnectCard) :
//   - Header replié : icône + titre "Banques" + badge statut +
//     description courte + chevron toggle
//   - Détail déplié : 1 tuile par banque connectée (logo + nom + nb comptes
//     + dernière sync + solde total) + actions Synchroniser / Connecter /
//     Déconnecter
//
// Ainsi l'utilisateur voit visuellement la liste de ses banques (Demo Bank
// en sandbox, BNP / CIC / SG en prod) au lieu d'un simple solde agrégé.
"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Landmark,
  Loader2,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";
import { useBridgeStatus } from "@/lib/banking/useBridgeStatus";
import { formatCurrency } from "@/components/dashboard/formatting";
import type { BankAccount } from "@/types/banking";

type BridgeConnectCardProps = {
  /** Callback quand un sync vient de se terminer — utilisé pour rafraîchir
   *  les données parentes (analyses, panneau connections). */
  onChanged?: () => void;
};

export function BridgeConnectCard({ onChanged }: BridgeConnectCardProps) {
  const { status, loading, refresh } = useBridgeStatus();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function getAuthToken(): Promise<string> {
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) throw new Error("Vous devez être connecté.");
    return idToken;
  }

  async function handleConnect() {
    setError(null);
    setBusy("connect");
    try {
      const idToken = await getAuthToken();
      const user = firebaseAuthGateway.getCurrentUser();
      const userEmail = user?.email ?? "client@vyzor.fr";
      const res = await fetch("/api/integrations/bridge/connect", {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
        body: JSON.stringify({ userEmail }),
      });
      const json = (await res.json()) as { connectUrl?: string; error?: string };
      if (!res.ok || !json.connectUrl) {
        throw new Error(json.error ?? "Connexion Bridge impossible.");
      }
      window.open(json.connectUrl, "_blank", "noopener,noreferrer");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSync() {
    setError(null);
    setBusy("sync");
    try {
      const idToken = await getAuthToken();
      const res = await fetch("/api/integrations/bridge/sync", {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Synchronisation impossible.");
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Déconnecter votre banque ? Les données bancaires associées seront supprimées.")) {
      return;
    }
    setError(null);
    setBusy("disconnect");
    try {
      const idToken = await getAuthToken();
      const res = await fetch("/api/integrations/bridge/disconnect", {
        method: "POST",
        headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Déconnexion impossible.");
      }
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setBusy(null);
    }
  }

  const isConnected = !!status?.connected;
  const accountsCount = status?.accountsCount ?? 0;
  const totalBalance = status?.totalBalance ?? null;
  const hasSynced = isConnected && accountsCount > 0;
  const pendingSync = isConnected && accountsCount === 0;
  const providerNames = status?.providerNames ?? [];
  const banksList =
    providerNames.length === 0
      ? null
      : providerNames.length === 1
        ? providerNames[0]!
        : providerNames.join(" · ");

  // Groupage par banque pour les tuiles du détail.
  const banksGrouped = useMemo(
    () => groupAccountsByBank(status?.summary?.accounts ?? []),
    [status?.summary?.accounts]
  );

  return (
    <article className="precision-card rounded-2xl">
      {/* Header — toggleable */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls="bridge-card-detail"
        className="flex w-full items-start gap-3 rounded-2xl p-4 text-left transition md:p-5"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <span
          className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: "rgba(197, 160, 89, 0.1)",
            border: "1px solid rgba(197, 160, 89, 0.3)",
            color: "#C5A059",
          }}
        >
          <Landmark className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-white">Banques</h2>
            {hasSynced ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#86EFAC" }}
              >
                <CheckCircle2 className="h-3 w-3" />
                Synchronisée
              </span>
            ) : pendingSync ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: "rgba(245,158,11,0.12)", color: "#FCD34D" }}
              >
                <RefreshCcw className="h-3 w-3" />
                À synchroniser
              </span>
            ) : (
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.55)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                Non connectée
              </span>
            )}
          </div>
          <p className="mt-1 max-w-[60ch] text-[13px] text-white/65">
            {hasSynced ? (
              <>
                {banksList ? <strong className="text-white">{banksList}</strong> : null}
                {banksList ? " · " : null}
                {accountsCount} compte{accountsCount > 1 ? "s" : ""}
                {totalBalance !== null ? ` · solde total ${formatCurrency(totalBalance)}` : ""}.
                <span className="ml-1 text-white/40">
                  {expanded ? "Cliquez pour replier." : "Cliquez pour gérer."}
                </span>
              </>
            ) : pendingSync ? (
              <>
                La connexion Bridge est établie, mais les comptes n'ont pas
                encore été récupérés.
                <span className="ml-1 text-white/40">
                  {expanded ? "Cliquez pour replier." : "Cliquez pour synchroniser."}
                </span>
              </>
            ) : (
              <>
                Source <strong>complémentaire</strong> à votre comptabilité —
                cash temps réel, flux et runway. Plusieurs banques peuvent être
                connectées (BNP, CIC, Société Générale, etc.).
                <span className="ml-1 text-white/40">
                  {expanded ? "Cliquez pour replier." : "Cliquez pour connecter."}
                </span>
              </>
            )}
          </p>
        </div>

        <span
          className="mt-1 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            color: "rgba(255, 255, 255, 0.65)",
          }}
          aria-hidden
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* Détail — déplié au clic */}
      {expanded ? (
        <div
          id="bridge-card-detail"
          className="space-y-4 px-4 pb-4 md:px-5 md:pb-5"
          style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
        >
          {/* Tuiles par banque — visible quand au moins une banque est synchronisée */}
          {banksGrouped.length > 0 ? (
            <div className="grid gap-3 pt-4 md:grid-cols-2">
              {banksGrouped.map((bank) => (
                <BankTile key={bank.name} bank={bank} />
              ))}
            </div>
          ) : null}

          {/* État vide — invitation à se connecter */}
          {!isConnected ? (
            <div className="pt-4">
              <p className="mb-3 text-[13px] text-white/65">
                Connectez votre première banque via Bridge — le widget Open Banking
                vous guidera pour authentifier votre établissement.
              </p>
            </div>
          ) : pendingSync ? (
            <div className="pt-4">
              <p className="text-[13px] text-amber-200/80">
                La connexion est établie côté Bridge mais aucun sync n'a été lancé.
                Cliquez sur <strong>Synchroniser maintenant</strong> pour récupérer
                vos comptes et transactions.
              </p>
            </div>
          ) : null}

          {/* Boutons d'action */}
          <div className="flex flex-wrap items-center gap-2">
            {!isConnected ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={busy !== null || loading}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
                style={{
                  backgroundColor: "rgba(197, 160, 89, 0.15)",
                  border: "1px solid rgba(197, 160, 89, 0.5)",
                  color: "#C5A059",
                }}
              >
                {busy === "connect" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                Connecter ma banque
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50"
                  style={{
                    backgroundColor: "rgba(197, 160, 89, 0.15)",
                    border: "1px solid rgba(197, 160, 89, 0.5)",
                    color: "#C5A059",
                  }}
                >
                  {busy === "sync" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5" />
                  )}
                  {pendingSync ? "Synchroniser maintenant" : "Synchroniser"}
                </button>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50"
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    color: "rgba(255, 255, 255, 0.7)",
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter une banque
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={busy !== null}
                  aria-label="Déconnecter toutes les banques"
                  className="inline-flex items-center justify-center rounded-lg p-2 transition disabled:opacity-50"
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    color: "rgba(255, 255, 255, 0.65)",
                  }}
                  title="Tout déconnecter"
                >
                  {busy === "disconnect" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </>
            )}
          </div>

          {error ? (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#FCA5A5",
              }}
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

// ─── Sous-composants ────────────────────────────────────────────────────

type BankGroup = {
  name: string;
  accountsCount: number;
  totalBalance: number;
  lastRefreshedAt: string | null;
};

function groupAccountsByBank(accounts: BankAccount[]): BankGroup[] {
  const map = new Map<string, BankGroup>();
  for (const a of accounts) {
    const key = a.providerName || "Banque";
    const cur = map.get(key) ?? {
      name: key,
      accountsCount: 0,
      totalBalance: 0,
      lastRefreshedAt: null,
    };
    cur.accountsCount += 1;
    cur.totalBalance += Number.isFinite(a.balance) ? a.balance : 0;
    // Garde la date la plus récente
    if (a.lastRefreshedAt) {
      if (!cur.lastRefreshedAt || a.lastRefreshedAt > cur.lastRefreshedAt) {
        cur.lastRefreshedAt = a.lastRefreshedAt;
      }
    }
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.totalBalance - a.totalBalance);
}

function BankTile({ bank }: { bank: BankGroup }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl p-3"
      style={{
        backgroundColor: "rgba(26, 26, 46, 0.55)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      {/* Logo générique — pas de mapping logo par banque pour l'instant.
          Mettre à jour avec un asset dédié quand on aura les fichiers
          (cf. components/integrations/AccountingConnectionWizard pour le
          pattern logo dual light/dark). */}
      <span
        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: "rgba(197, 160, 89, 0.1)",
          border: "1px solid rgba(197, 160, 89, 0.25)",
          color: "#C5A059",
        }}
      >
        <Landmark className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{bank.name}</p>
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
          {bank.accountsCount} compte{bank.accountsCount > 1 ? "s" : ""} · {formatCurrency(bank.totalBalance)}
        </p>
        {bank.lastRefreshedAt ? (
          <p className="mt-0.5 text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Dernière sync : {formatRelativeDate(bank.lastRefreshedAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const minutes = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString("fr-FR");
}
