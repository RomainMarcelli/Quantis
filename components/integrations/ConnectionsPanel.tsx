// File: components/integrations/ConnectionsPanel.tsx
// Role: liste des connections actives de l'utilisateur (Pennylane, plus tard Chift, Bridge…).
// Affiche pour chaque connection : provider, token preview (masqué), date de création,
// dernier sync. Boutons Resync + Disconnect inline. Trace utile pour comprendre quelle
// donnée vient de quel token.
"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plug, RefreshCw, Trash2 } from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";
import { writeActiveAnalysisId } from "@/lib/source/activeSource";
import type { ConnectionDto } from "@/app/api/integrations/connections/route";

type PerConnectionStatus = "idle" | "syncing" | "disconnecting";

type ConnectionsPanelProps = {
  /**
   * Callback exécuté après un sync réussi (ou un disconnect).
   * Permet à la page parente de rafraîchir la liste d'analyses Firestore.
   */
  onChanged?: () => void | Promise<void>;
};

const PROVIDER_LABELS: Record<string, string> = {
  pennylane: "Pennylane",
  myunisoft: "MyUnisoft",
  odoo: "Odoo",
  chift: "Chift",
  bridge: "Bridge",
};

const STATUS_BADGE: Record<string, string> = {
  active: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  expired: "border-amber-400/30 bg-amber-500/10 text-amber-300",
  error: "border-red-400/30 bg-red-500/10 text-red-300",
  revoked: "border-white/15 bg-white/5 text-white/50",
};

const SYNC_STATUS_LABEL: Record<string, string> = {
  never: "Jamais synchronisé",
  in_progress: "Sync en cours",
  success: "Sync OK",
  partial: "Sync partiel",
  failed: "Sync échoué",
};

export function ConnectionsPanel({ onChanged }: ConnectionsPanelProps) {
  const [connections, setConnections] = useState<ConnectionDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [perConnection, setPerConnection] = useState<Record<string, PerConnectionStatus>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Non authentifié");
      const res = await fetch("/api/integrations/connections", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setConnections((data as { connections: ConnectionDto[] }).connections);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleResync(connectionId: string, provider: string) {
    setPerConnection((prev) => ({ ...prev, [connectionId]: "syncing" }));
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Non authentifié");
      const res = await fetch(`/api/integrations/${provider}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `Resync échoué (HTTP ${res.status})`);
      }
      // Auto-activation : la sync a généré une nouvelle analyse → on la
      // pose comme source active du dashboard. Sans ça l'utilisateur reste
      // sur sa source précédente (ex. Excel) sans s'en rendre compte —
      // c'est le bug remonté par l'utilisateur le 30/04/2026.
      const analysisId = (data as { analysis?: { analysisId?: string } }).analysis?.analysisId;
      if (analysisId) {
        writeActiveAnalysisId(analysisId);
      }
      await refresh();
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setPerConnection((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
    }
  }

  async function handleDisconnect(connectionId: string, provider: string) {
    if (!confirm("Supprimer cette connection et toutes les entités synchronisées ?")) return;
    setPerConnection((prev) => ({ ...prev, [connectionId]: "disconnecting" }));
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Non authentifié");
      const res = await fetch(`/api/integrations/${provider}/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Disconnect échoué (HTTP ${res.status})`);
      }
      await refresh();
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setPerConnection((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
    }
  }

  // Expose une fonction de rafraîchissement externe via window event (utilisé par
  // PennylaneConnectCard pour rafraîchir le panel après une nouvelle connexion).
  useEffect(() => {
    function onConnectionsChanged() {
      void refresh();
    }
    window.addEventListener("quantis:connections-changed", onConnectionsChanged);
    return () => window.removeEventListener("quantis:connections-changed", onConnectionsChanged);
  }, [refresh]);

  if (loading && !connections) {
    return null; // Pas de loader visible — évite le flash de carte vide avant le premier fetch.
  }

  if (error && !connections) {
    return (
      <div className="precision-card rounded-2xl border-red-500/30 bg-red-500/5 p-5 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (!connections || connections.length === 0) {
    return null; // Pas de connection — on n'affiche pas le panel (le DataSourceSelector reste visible).
  }

  return (
    <div className="precision-card rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-quantis-gold" />
          <h3 className="text-sm font-semibold text-white">Connections actives</h3>
        </div>
        <span className="text-xs text-white/50">
          {connections.length} connection{connections.length > 1 ? "s" : ""}
        </span>
      </div>

      <ul className="space-y-2">
        {connections.map((c) => {
          const status = perConnection[c.id];
          const isSyncing = status === "syncing";
          const isDisconnecting = status === "disconnecting";
          const isBusy = isSyncing || isDisconnecting;

          return (
            <li
              key={c.id}
              className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-black/20 p-3 md:grid-cols-[1fr_auto] md:items-center"
            >
              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">
                    {PROVIDER_LABELS[c.provider] ?? c.provider}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      STATUS_BADGE[c.status] ?? STATUS_BADGE.revoked
                    }`}
                  >
                    {c.status}
                  </span>
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
                    {c.authMode === "company_token"
                      ? "Company Token"
                      : c.authMode === "firm_token"
                      ? "Firm Token"
                      : "OAuth"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-white/55">
                  {c.provider === "odoo" && c.odooInstanceUrl ? (
                    <>
                      <span>
                        Instance :{" "}
                        <span className="font-mono text-white/80">
                          {c.odooInstanceUrl.replace(/^https?:\/\//, "")}
                        </span>
                      </span>
                      <span>
                        Login : <span className="font-mono text-white/80">{c.odooLogin}</span>
                      </span>
                      <span>
                        API key : <span className="font-mono text-white/80">{c.tokenPreview}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span>
                        Token : <span className="font-mono text-white/80">{c.tokenPreview}</span>
                      </span>
                      {c.externalCompanyId && (
                        <span>
                          {c.provider === "myunisoft" ? "Société" : "Company ID"} :{" "}
                          <span className="font-mono text-white/80">{c.externalCompanyId}</span>
                        </span>
                      )}
                    </>
                  )}
                  <span>
                    Connecté le{" "}
                    <span className="text-white/80">
                      {new Date(c.createdAt).toLocaleString("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </span>
                  <span>
                    {SYNC_STATUS_LABEL[c.lastSyncStatus] ?? c.lastSyncStatus}
                    {c.lastSyncAt
                      ? ` · ${new Date(c.lastSyncAt).toLocaleString("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}`
                      : ""}
                  </span>
                </div>
                {c.lastSyncError && (
                  <p className="text-[11px] text-amber-300">⚠ {c.lastSyncError}</p>
                )}
              </div>

              <div className="flex shrink-0 gap-2 md:justify-end">
                <button
                  type="button"
                  onClick={() => void handleResync(c.id, c.provider)}
                  disabled={isBusy}
                  title={`Synchronise les dernières données ${PROVIDER_LABELS[c.provider] ?? c.provider} et utilise cette source pour le dashboard.`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-quantis-gold/40 bg-quantis-gold/10 px-3 py-1.5 text-xs font-medium text-quantis-gold hover:bg-quantis-gold/20 disabled:opacity-40"
                >
                  {isSyncing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {isSyncing ? "Synchronisation…" : "Synchroniser et activer"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDisconnect(c.id, c.provider)}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                >
                  {isDisconnecting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Déconnecter
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
