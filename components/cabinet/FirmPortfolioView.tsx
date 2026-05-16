// File: components/cabinet/FirmPortfolioView.tsx
// Role: vue Portefeuille du cabinet (Sprint C Tâche 5).
//
// Affiche une grille de cartes = dossiers actifs du cabinet, avec KPIs
// synthétiques. Bouton "Ajouter un dossier" → retour vers connect.
// Bouton "Synchroniser tous" → POST batch sync (à câbler en C6/D).
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ExternalLink, Loader2, Plus, RefreshCcw } from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";

type Dossier = {
  companyId: string;
  name: string;
  externalCompanyId: string | null;
  externalCompanyName: string | null;
  connectionId: string;
  lastSyncedAt: string | null;
  lastSyncStatus: "success" | "failed" | "in_progress" | "partial" | "never" | "unknown";
  kpis: {
    ca: number | null;
    tresorerieNette: number | null;
    vyzorScore: number | null;
  };
};

type PortfolioData = {
  firm: { firmId: string; name: string };
  dossiers: Dossier[];
  total: number;
};

function formatEUR(n: number | null): string {
  if (n === null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)} K€`;
  return `${Math.round(n)} €`;
}

function formatSyncDate(iso: string | null): string {
  if (!iso) return "Jamais";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function syncBadgeStyle(status: Dossier["lastSyncStatus"]): {
  label: string;
  color: string;
  bg: string;
} {
  switch (status) {
    case "success":
      return { label: "Sync OK", color: "#22C55E", bg: "rgb(34 197 94 / 12%)" };
    case "partial":
      return { label: "Partiel", color: "#F59E0B", bg: "rgb(245 158 11 / 12%)" };
    case "failed":
      return { label: "Erreur", color: "#EF4444", bg: "rgb(239 68 68 / 12%)" };
    case "in_progress":
      return { label: "En cours", color: "#3B82F6", bg: "rgb(59 130 246 / 12%)" };
    case "never":
    case "unknown":
    default:
      return {
        label: "Jamais syncé",
        color: "var(--app-text-tertiary)",
        bg: "var(--app-surface-soft)",
      };
  }
}

export function FirmPortfolioView() {
  const router = useRouter();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  async function reload() {
    setError(null);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Session expirée.");
      const res = await fetch("/api/cabinet/portefeuille", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const payload = await res.json();
      if (!res.ok) {
        if (res.status === 403 && payload.error?.includes("firm_member")) {
          // Non-firm_member → on les redirige vers le dashboard standard.
          router.replace("/analysis");
          return;
        }
        throw new Error(payload.error || "Chargement portefeuille échoué.");
      }
      setData(payload as PortfolioData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  // Liste unique des Connections (pour le bouton "Sync tous").
  const connectionIds = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.dossiers.map((d) => d.connectionId));
    return Array.from(set);
  }, [data]);

  async function syncAll() {
    if (connectionIds.length === 0) return;
    setSyncBusy(true);
    setError(null);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Session expirée.");
      // Pour chaque Connection, on déclenche /api/sync/trigger.
      // Sprint C minimal : pas de runSyncForFirmConnection batch HTTP — on
      // appelle séquentiellement les triggers existants. Une route dédiée
      // /api/cabinet/sync/all sera ajoutée en Sprint D si nécessaire.
      const results = await Promise.allSettled(
        connectionIds.map((connectionId) =>
          fetch("/api/sync/trigger", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ connectionId }),
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        setError(`${failed} sync échoué(s) sur ${results.length}.`);
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setSyncBusy(false);
    }
  }

  if (!data && !error) {
    return (
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 py-12">
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--app-brand-gold-deep)" }} />
        <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Chargement du portefeuille…
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-5xl py-12">
        <p className="text-sm" style={{ color: "var(--app-danger, #EF4444)" }}>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p
            className="text-xs uppercase tracking-[0.15em]"
            style={{ color: "var(--app-text-tertiary)" }}
          >
            Portefeuille
          </p>
          <h1
            className="mt-1 text-2xl font-semibold md:text-3xl"
            style={{ color: "var(--app-text-primary)" }}
          >
            {data.firm.name}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--app-text-secondary)" }}>
            {data.total} dossier{data.total > 1 ? "s" : ""} actif{data.total > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/cabinet/onboarding/connect")}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition"
            style={{ border: "1px solid var(--app-border)", color: "var(--app-text-secondary)" }}
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un dossier
          </button>
          <button
            type="button"
            onClick={() => void syncAll()}
            disabled={syncBusy || connectionIds.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-50"
            style={{
              border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)",
              color: "var(--app-brand-gold-deep)",
              backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 12%)",
            }}
          >
            {syncBusy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Synchronisation…
              </>
            ) : (
              <>
                <RefreshCcw className="h-3.5 w-3.5" />
                Synchroniser tous
              </>
            )}
          </button>
        </div>
      </header>

      {error ? (
        <p className="mb-4 text-xs" style={{ color: "var(--app-danger, #EF4444)" }}>
          {error}
        </p>
      ) : null}

      {data.dossiers.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
            border: "1px solid var(--app-border)",
            backdropFilter: "blur(24px)",
          }}
        >
          <Building2
            className="mx-auto mb-3 h-10 w-10"
            style={{ color: "var(--app-text-tertiary)" }}
          />
          <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>
            Aucun dossier actif
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--app-text-secondary)" }}>
            Connectez votre cabinet Pennylane pour commencer.
          </p>
          <button
            type="button"
            onClick={() => router.push("/cabinet/onboarding/connect")}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition"
            style={{
              border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)",
              color: "var(--app-brand-gold-deep)",
              backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 12%)",
            }}
          >
            Connecter Pennylane →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.dossiers.map((d) => {
            const badge = syncBadgeStyle(d.lastSyncStatus);
            return (
              <button
                key={d.companyId}
                type="button"
                onClick={() => router.push(`/cabinet/dossier/${encodeURIComponent(d.companyId)}`)}
                className="flex flex-col gap-4 rounded-2xl p-5 text-left transition hover:scale-[1.005]"
                style={{
                  backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
                  border: "1px solid var(--app-border)",
                  backdropFilter: "blur(24px)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3
                      className="truncate text-base font-semibold"
                      style={{ color: "var(--app-text-primary)" }}
                    >
                      {d.externalCompanyName || d.name}
                    </h3>
                    {d.externalCompanyId ? (
                      <p
                        className="mt-0.5 truncate font-mono text-[11px]"
                        style={{ color: "var(--app-text-tertiary)" }}
                      >
                        ID {d.externalCompanyId}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="flex-shrink-0 rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wider"
                    style={{ color: badge.color, backgroundColor: badge.bg }}
                  >
                    {badge.label}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <KpiCell label="CA" value={formatEUR(d.kpis.ca)} />
                  <KpiCell label="Trésorerie nette" value={formatEUR(d.kpis.tresorerieNette)} />
                  <KpiCell
                    label="Score Vyzor"
                    value={d.kpis.vyzorScore !== null ? `${Math.round(d.kpis.vyzorScore)}/100` : "—"}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span style={{ color: "var(--app-text-tertiary)" }}>
                    Dernier sync : {formatSyncDate(d.lastSyncedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1" style={{ color: "var(--app-text-secondary)" }}>
                    Ouvrir <ExternalLink className="h-3 w-3" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "var(--app-text-tertiary)" }}
      >
        {label}
      </p>
      <p
        className="mt-0.5 font-mono text-sm font-semibold"
        style={{ color: "var(--app-text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}
