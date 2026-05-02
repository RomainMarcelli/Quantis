// File: components/integrations/BridgeConnectCard.tsx
// Role: card "Connecter ma banque" sur la page Documents. Bridge (Open Banking
// PSD2) est une source de donnée COMPLÉMENTAIRE (cash temps réel, flux,
// runway) — séparée des intégrations comptables (Pennylane/MyUnisoft/Odoo).
//
// Flux UX :
//   1. État "non connecté" → bouton "Connecter ma banque"
//      → POST /api/integrations/bridge/connect → ouvre la connectUrl Bridge
//        dans un nouvel onglet (l'utilisateur valide la SCA chez Bridge)
//   2. Au retour, l'utilisateur clique sur "Synchroniser maintenant"
//      → POST /api/integrations/bridge/sync (récupère comptes + transactions
//        + écrit BankingSummary dans Firestore)
//   3. État "connecté" → résumé compact (X comptes, dernier sync) + boutons
//      Synchroniser / Déconnecter
"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Landmark,
  Loader2,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";
import { useBridgeStatus } from "@/lib/banking/useBridgeStatus";
import { formatCurrency } from "@/components/dashboard/formatting";

type BridgeConnectCardProps = {
  /** Callback quand un sync vient de se terminer — utilisé pour rafraîchir
   *  les données parentes (analyses, panneau connections). */
  onChanged?: () => void;
};

export function BridgeConnectCard({ onChanged }: BridgeConnectCardProps) {
  const { status, loading, refresh } = useBridgeStatus();
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
      // Ouvre l'URL Connect dans un nouvel onglet — l'utilisateur valide
      // la SCA banque chez Bridge puis revient sur Vyzor.
      window.open(json.connectUrl, "_blank", "noopener,noreferrer");
      // On force un refresh status au retour pour mettre à jour l'UI dès
      // que l'utilisateur revient sur Vyzor.
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
  // Distingue 2 sous-états quand isConnected = true :
  //  - hasSynced  → comptes + summary disponibles
  //  - pendingSync → connexion établie mais aucun /sync n'a encore tourné
  //                  (l'utilisateur a fermé le tab Bridge avant le retour
  //                  callback, ou le sandbox n'a pas redirigé). On l'incite
  //                  alors à cliquer "Synchroniser".
  const hasSynced = isConnected && accountsCount > 0;
  const pendingSync = isConnected && accountsCount === 0;
  // Titre TOUJOURS "Banques" (pluriel) pour signaler que plusieurs banques
  // peuvent être connectées (BNP, CIC, Société Générale, etc.). Les noms
  // précis des banques sont affichés en sous-texte si dispo.
  const providerNames = status?.providerNames ?? [];
  const banksList =
    providerNames.length === 0
      ? null
      : providerNames.length === 1
        ? providerNames[0]!
        : providerNames.join(" · ");

  return (
    <article className="precision-card rounded-2xl p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
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
          <div className="min-w-0">
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
                  {accountsCount} compte{accountsCount > 1 ? "s" : ""} synchronisé{accountsCount > 1 ? "s" : ""}
                  {totalBalance !== null ? ` · solde total ${formatCurrency(totalBalance)}` : ""}.
                  <span className="ml-1 text-white/40">
                    Connexion Open Banking PSD2 via Bridge.
                  </span>
                </>
              ) : pendingSync ? (
                <>
                  La connexion Bridge est établie, mais les comptes n'ont pas
                  encore été récupérés. Cliquez sur <strong>Synchroniser</strong>
                  &nbsp;ci-dessous pour finaliser.
                </>
              ) : (
                <>
                  Source <strong>complémentaire</strong> à votre comptabilité —
                  cash temps réel, flux et runway. Plusieurs banques peuvent
                  être connectées (BNP, CIC, Société Générale, etc.).
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 md:self-center">
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
                Synchroniser
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={busy !== null}
                aria-label="Déconnecter la banque"
                className="inline-flex items-center justify-center rounded-lg p-2 transition disabled:opacity-50"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  color: "rgba(255, 255, 255, 0.65)",
                }}
                title="Déconnecter"
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
      </div>

      {error ? (
        <div
          className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]"
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

      {isConnected && status?.lastSyncAt ? (
        <p className="mt-3 text-[11px] text-white/40">
          Dernière sync : {formatRelativeDate(status.lastSyncAt)}
        </p>
      ) : null}
    </article>
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
