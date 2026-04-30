// File: components/integrations/OdooConnectCard.tsx
// Role: carte de connexion Odoo (URL d'instance + login + API key + base optionnelle).
"use client";

import { useState } from "react";
import { Loader2, Plug } from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";

type ConnectStatus = "idle" | "connecting" | "syncing" | "done" | "error";

type OdooConnectCardProps = {
  onSyncCompleted?: () => void | Promise<void>;
};

export function OdooConnectCard({ onSyncCompleted }: OdooConnectCardProps) {
  const [instanceUrl, setInstanceUrl] = useState("");
  const [login, setLogin] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [database, setDatabase] = useState("");
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
    if (!instanceUrl.trim() || !login.trim() || !apiKey.trim()) {
      setMessage("URL, login et API key sont obligatoires.");
      setStatus("error");
      return;
    }
    setMessage(null);
    setStatus("connecting");
    try {
      const body: Record<string, string> = {
        instanceUrl: instanceUrl.trim(),
        login: login.trim(),
        apiKey: apiKey.trim(),
      };
      if (database.trim()) body.database = database.trim();

      const connect = await callApi("/api/integrations/odoo/connect", body);
      if (!connect.ok) {
        const msg =
          (connect.data as { detail?: string; error?: string })?.detail ??
          (connect.data as { error?: string })?.error ??
          "Connexion refusée";
        throw new Error(msg);
      }
      const connectionId = (connect.data as { connectionId: string }).connectionId;

      setStatus("syncing");
      const sync = await callApi("/api/integrations/odoo/sync", { connectionId });
      if (!sync.ok) {
        const msg =
          (sync.data as { detail?: string; error?: string })?.detail ??
          (sync.data as { error?: string })?.error ??
          "Sync échoué";
        throw new Error(msg);
      }
      const report = (sync.data as { report?: { entities?: { itemsPersisted: number }[] } }).report;
      const total = report?.entities?.reduce((s, e) => s + e.itemsPersisted, 0) ?? 0;

      setMessage(`Synchronisation terminée — ${total} entité(s) persistée(s). Nouvelle analyse créée.`);
      setStatus("done");
      setInstanceUrl("");
      setLogin("");
      setApiKey("");
      setDatabase("");
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
          <h3 className="text-sm font-semibold text-white">Se connecter à Odoo</h3>
          <p className="mt-1 text-xs text-white/55">
            Connectez votre instance Odoo (SaaS Custom ou self-hosted). Générez une clé API depuis
            <strong className="text-white/70"> Préférences → Compte → Clés API</strong>.
            La base est auto-détectée pour les instances <code className="text-white/70">.odoo.com</code>.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <input
          type="text"
          value={instanceUrl}
          onChange={(e) => setInstanceUrl(e.target.value)}
          placeholder="URL instance (ex. acme.odoo.com)"
          disabled={isBusy}
          className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:border-quantis-gold focus:outline-none disabled:opacity-40"
        />
        <input
          type="email"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="Email"
          disabled={isBusy}
          className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:border-quantis-gold focus:outline-none disabled:opacity-40"
        />
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Clé API"
          disabled={isBusy}
          className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:border-quantis-gold focus:outline-none disabled:opacity-40"
        />
        <input
          type="text"
          value={database}
          onChange={(e) => setDatabase(e.target.value)}
          placeholder="Base de données (optionnel)"
          disabled={isBusy}
          className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:border-quantis-gold focus:outline-none disabled:opacity-40"
        />
      </div>

      <button
        type="button"
        onClick={handleConnect}
        disabled={isBusy || !instanceUrl.trim() || !login.trim() || !apiKey.trim()}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-quantis-gold px-4 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isBusy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {status === "connecting" ? "Vérification…" : "Sync en cours…"}
          </>
        ) : (
          "Connecter"
        )}
      </button>

      {message && (
        <p className={`text-xs ${status === "error" ? "text-red-400" : "text-emerald-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
