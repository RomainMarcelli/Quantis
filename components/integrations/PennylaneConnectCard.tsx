// File: components/integrations/PennylaneConnectCard.tsx
// Role: carte de connexion Pennylane (mode Company Token en attendant l'OAuth).
// À placer dans /documents pour permettre à l'utilisateur de synchroniser ses données.
"use client";

import { useState } from "react";
import { Plug, Loader2 } from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";

type ConnectStatus = "idle" | "connecting" | "syncing" | "done" | "error";

type PennylaneConnectCardProps = {
  onSyncCompleted?: () => void | Promise<void>;
};

export function PennylaneConnectCard({ onSyncCompleted }: PennylaneConnectCardProps) {
  const [tokenInput, setTokenInput] = useState("");
  const [status, setStatus] = useState<ConnectStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function callApi(path: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) throw new Error("Non authentifié");
    const res = await fetch(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function handleConnect() {
    if (!tokenInput.trim()) {
      setMessage("Token manquant.");
      setStatus("error");
      return;
    }
    setMessage(null);
    setStatus("connecting");
    try {
      const connect = await callApi("/api/integrations/pennylane/connect", {
        mode: "company_token",
        accessToken: tokenInput.trim(),
      });
      if (!connect.ok) {
        const msg =
          (connect.data as { detail?: string; error?: string })?.detail ??
          (connect.data as { error?: string })?.error ??
          "Connexion refusée";
        throw new Error(msg);
      }
      const connectionId = (connect.data as { connectionId: string }).connectionId;

      setStatus("syncing");
      const sync = await callApi("/api/integrations/pennylane/sync", { connectionId });
      if (!sync.ok) {
        const msg =
          (sync.data as { detail?: string; error?: string })?.detail ??
          (sync.data as { error?: string })?.error ??
          "Sync échoué";
        throw new Error(msg);
      }
      const report = (sync.data as { report?: { entities?: { itemsPersisted: number }[] } }).report;
      const total = report?.entities?.reduce((s, e) => s + e.itemsPersisted, 0) ?? 0;

      setMessage(`Synchronisation terminée — ${total} entité(s) persistée(s). Une nouvelle analyse a été créée.`);
      setStatus("done");
      setTokenInput("");
      // Notifie ConnectionsPanel pour qu'il se rafraîchisse.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("quantis:connections-changed"));
      }
      if (onSyncCompleted) await onSyncCompleted();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur inconnue");
      setStatus("error");
    }
  }

  const isBusy = status === "connecting" || status === "syncing";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-quantis-gold/30 bg-quantis-gold/10">
          <Plug className="h-5 w-5 text-quantis-gold" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Se connecter à Pennylane</h3>
          <p className="mt-1 text-xs text-white/55">
            Synchronisez vos données comptables. En attendant l'OAuth, collez un{" "}
            <strong className="text-white/70">Company Token</strong> depuis votre compte Pennylane
            (Settings → API Tokens).
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row">
        <input
          type="password"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="Pennylane Company Token"
          disabled={isBusy}
          className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:border-quantis-gold focus:outline-none disabled:opacity-40"
        />
        <button
          type="button"
          onClick={handleConnect}
          disabled={isBusy || !tokenInput.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-quantis-gold px-4 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isBusy ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {status === "connecting" ? "Vérification…" : "Sync en cours…"}
            </>
          ) : (
            "Se connecter"
          )}
        </button>
      </div>

      {message && (
        <p className={`text-xs ${status === "error" ? "text-red-400" : "text-emerald-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
