// File: components/cabinet/FirmPortfolioView.tsx
// Role: Console de gestion du cabinet (Sprint C Tâche 5, refactor feature/cabinet-ux).
//
// Vue d'ensemble des dossiers clients du cabinet. Visible uniquement pour
// les firm_member (gardée côté API + côté sidebar nav). Reprend les codes
// visuels de l'app (AppHeader + AppSidebar layout, precision-card,
// CSS variables --app-*).
//
// Layout :
//   - Header (AppHeader variant="simple", subtitle "Console cabinet")
//   - Ligne 1 : 3 KPIs synthétiques (nb dossiers, CA moyen, EBITDA moyen)
//   - Ligne 2 : liste alphabétique des dossiers, chaque ligne clickable
//     → /cabinet/dossier/[companyId]
//   - Boutons "Ajouter un dossier" + "Synchroniser tous" en haut à droite
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Building2, ExternalLink, Loader2, Mail, Plus, RefreshCcw, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { firebaseAuthGateway } from "@/services/auth";
import { useActiveCompany } from "@/lib/stores/activeCompanyStore";
import { ROUTES } from "@/lib/config/routes";

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
    ebitda: number | null;
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

function syncBadge(status: Dossier["lastSyncStatus"]): { label: string; color: string; bg: string } {
  switch (status) {
    case "success":     return { label: "Sync OK", color: "#22C55E", bg: "rgb(34 197 94 / 12%)" };
    case "partial":     return { label: "Partiel",  color: "#F59E0B", bg: "rgb(245 158 11 / 12%)" };
    case "failed":      return { label: "Erreur",   color: "#EF4444", bg: "rgb(239 68 68 / 12%)" };
    case "in_progress": return { label: "En cours", color: "#3B82F6", bg: "rgb(59 130 246 / 12%)" };
    default:            return { label: "Jamais",   color: "var(--app-text-tertiary)", bg: "var(--app-surface-soft)" };
  }
}

function mean(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function FirmPortfolioView() {
  const router = useRouter();
  const { setActiveCompanyId } = useActiveCompany();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [firstName, setFirstName] = useState<string | undefined>(undefined);
  const [inviteTarget, setInviteTarget] = useState<{ companyId: string; companyName: string } | null>(null);

  async function reload() {
    setError(null);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Session expirée.");
      const res = await fetch(ROUTES.API_CABINET_PORTEFEUILLE, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const payload = await res.json();
      if (!res.ok) {
        if (res.status === 403 && payload.error?.includes("firm_member")) {
          router.replace(ROUTES.SYNTHESE);
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
    const user = firebaseAuthGateway.getCurrentUser();
    if (user?.displayName) setFirstName(user.displayName.split(" ")[0]);
  }, []);

  // Tri alphabétique + KPIs agrégés.
  const sortedDossiers = useMemo(() => {
    if (!data) return [];
    return [...data.dossiers].sort((a, b) =>
      (a.externalCompanyName || a.name).localeCompare(b.externalCompanyName || b.name, "fr", { sensitivity: "base" })
    );
  }, [data]);

  const aggregateKpis = useMemo(() => {
    if (!data) return { count: 0, caMean: null as number | null, ebitdaMean: null as number | null };
    return {
      count: data.dossiers.length,
      caMean: mean(data.dossiers.map((d) => d.kpis.ca)),
      ebitdaMean: mean(data.dossiers.map((d) => d.kpis.ebitda)),
    };
  }, [data]);

  const connectionIds = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.dossiers.map((d) => d.connectionId)));
  }, [data]);

  async function syncAll() {
    if (connectionIds.length === 0) return;
    setSyncBusy(true);
    setError(null);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Session expirée.");
      const results = await Promise.allSettled(
        connectionIds.map((connectionId) =>
          fetch("/api/sync/trigger", {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ connectionId }),
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) setError(`${failed} sync échoué(s) sur ${results.length}.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setSyncBusy(false);
    }
  }

  function openDossier(companyId: string) {
    setActiveCompanyId(companyId);
    router.push(ROUTES.CABINET_DOSSIER(encodeURIComponent(companyId)));
  }

  return (
    <div className="space-y-4">
      <AppHeader
        variant="simple"
        companyName={data?.firm.name ?? "Cabinet"}
        subtitle="Console cabinet"
        actionSlot={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(ROUTES.CABINET_ADD_COMPANY)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition"
              style={{
                border: "1px solid var(--app-border)",
                color: "var(--app-text-secondary)",
                backgroundColor: "var(--app-surface-soft)",
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter une entreprise
            </button>
            <button
              type="button"
              onClick={() => void syncAll()}
              disabled={syncBusy || connectionIds.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50"
              style={{
                border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)",
                color: "var(--app-brand-gold-deep)",
                backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 12%)",
              }}
            >
              {syncBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              {syncBusy ? "Sync…" : "Synchroniser tous"}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <AppSidebar activeRoute="cabinet-portefeuille" accountFirstName={firstName} />

        <section className="space-y-4">
          {/* KPI row */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <KpiCard
              label="Dossiers actifs"
              value={aggregateKpis.count.toString()}
              icon={<Briefcase className="h-4 w-4" />}
            />
            <KpiCard
              label="CA moyen"
              value={formatEUR(aggregateKpis.caMean)}
            />
            <KpiCard
              label="EBITDA moyen"
              value={formatEUR(aggregateKpis.ebitdaMean)}
            />
          </div>

          {error ? (
            <p className="text-xs" style={{ color: "var(--app-danger, #EF4444)" }}>
              {error}
            </p>
          ) : null}

          {!data && !error ? (
            <div className="flex items-center gap-2 py-12">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--app-brand-gold-deep)" }} />
              <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
                Chargement du portefeuille…
              </p>
            </div>
          ) : data && data.dossiers.length === 0 ? (
            <div
              className="precision-card rounded-2xl p-10 text-center"
              style={{ backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)", border: "1px solid var(--app-border)" }}
            >
              <Building2 className="mx-auto mb-3 h-10 w-10" style={{ color: "var(--app-text-tertiary)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>
                Aucun dossier actif
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                Connectez votre cabinet Pennylane pour commencer.
              </p>
              <button
                type="button"
                onClick={() => router.push(ROUTES.CABINET_ADD_COMPANY)}
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
          ) : data ? (
            <div
              className="precision-card overflow-hidden rounded-2xl"
              style={{
                backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
                border: "1px solid var(--app-border)",
              }}
            >
              <div
                className="grid grid-cols-[1.6fr_1fr_1fr_0.7fr_0.9fr_0.5fr] gap-3 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  color: "var(--app-text-tertiary)",
                  borderBottom: "1px solid var(--app-border)",
                  backgroundColor: "var(--app-surface-soft)",
                }}
              >
                <span>Dossier</span>
                <span className="text-right">CA</span>
                <span className="text-right">EBITDA</span>
                <span className="text-right">Score</span>
                <span>Dernier sync</span>
                <span />
              </div>

              <ul>
                {sortedDossiers.map((d) => {
                  const badge = syncBadge(d.lastSyncStatus);
                  return (
                    <li key={d.companyId} className="relative">
                      <button
                        type="button"
                        onClick={() => openDossier(d.companyId)}
                        className="grid w-full grid-cols-[1.6fr_1fr_1fr_0.7fr_0.9fr_0.5fr] items-center gap-3 px-5 py-3 text-left transition"
                        style={{ borderBottom: "1px solid var(--app-border)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "var(--app-surface-soft)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-medium"
                            style={{ color: "var(--app-text-primary)" }}
                          >
                            {d.externalCompanyName || d.name}
                          </p>
                          {d.externalCompanyId ? (
                            <p
                              className="truncate font-mono text-[10px]"
                              style={{ color: "var(--app-text-tertiary)" }}
                            >
                              {d.externalCompanyId}
                            </p>
                          ) : null}
                        </div>
                        <p
                          className="text-right font-mono text-sm"
                          style={{ color: "var(--app-text-primary)" }}
                        >
                          {formatEUR(d.kpis.ca)}
                        </p>
                        <p
                          className="text-right font-mono text-sm"
                          style={{
                            color:
                              d.kpis.ebitda !== null && d.kpis.ebitda < 0
                                ? "#EF4444"
                                : "var(--app-text-primary)",
                          }}
                        >
                          {formatEUR(d.kpis.ebitda)}
                        </p>
                        <p
                          className="text-right font-mono text-sm"
                          style={{ color: "var(--app-text-primary)" }}
                        >
                          {d.kpis.vyzorScore !== null ? `${Math.round(d.kpis.vyzorScore)}` : "—"}
                        </p>
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--app-text-tertiary)" }}>
                          <span
                            className="inline-block rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
                            style={{ color: badge.color, backgroundColor: badge.bg }}
                          >
                            {badge.label}
                          </span>
                          <span className="truncate">{formatSyncDate(d.lastSyncedAt)}</span>
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setInviteTarget({
                                companyId: d.companyId,
                                companyName: d.externalCompanyName || d.name,
                              });
                            }}
                            role="button"
                            title="Inviter le dirigeant"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md transition"
                            style={{
                              color: "var(--app-text-tertiary)",
                              border: "1px solid var(--app-border)",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLSpanElement).style.color =
                                "var(--app-brand-gold-deep)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLSpanElement).style.color =
                                "var(--app-text-tertiary)";
                            }}
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </span>
                          <ExternalLink
                            className="h-3.5 w-3.5"
                            style={{ color: "var(--app-text-tertiary)" }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      {inviteTarget ? (
        <InviteDirigeantModal
          companyId={inviteTarget.companyId}
          companyName={inviteTarget.companyName}
          onClose={() => setInviteTarget(null)}
        />
      ) : null}
    </div>
  );
}

function InviteDirigeantModal({
  companyId,
  companyName,
  onClose,
}: {
  companyId: string;
  companyName: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Session expirée.");
      const res = await fetch(ROUTES.API_CABINET_INVITE, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, email }),
      });
      const payload = (await res.json().catch(() => ({}))) as { inviteUrl?: string; error?: string };
      if (!res.ok || !payload.inviteUrl) {
        throw new Error(payload.error || "Création de l'invitation échouée.");
      }
      setInviteUrl(payload.inviteUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgb(0 0 0 / 60%)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 95%)",
          border: "1px solid var(--app-border-strong)",
          backdropFilter: "blur(24px)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--app-text-primary)" }}>
              Inviter le dirigeant
            </h3>
            <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>
              {companyName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 rounded p-1 transition"
            style={{ color: "var(--app-text-tertiary)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {inviteUrl ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium" style={{ color: "var(--app-text-secondary)" }}>
              Lien d'invitation créé — copiez-le pour l'envoyer au dirigeant :
            </p>
            <div
              className="rounded-lg p-3"
              style={{
                backgroundColor: "var(--app-surface-soft)",
                border: "1px solid var(--app-border)",
              }}
            >
              <p className="break-all font-mono text-[11px]" style={{ color: "var(--app-text-primary)" }}>
                {inviteUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-medium transition"
              style={{
                border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)",
                color: "var(--app-brand-gold-deep)",
                backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 12%)",
              }}
            >
              {copied ? "Lien copié ✓" : "Copier le lien"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg px-3 py-2 text-xs transition"
              style={{ color: "var(--app-text-tertiary)" }}
            >
              Fermer
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dirigeant@entreprise.fr"
              autoFocus
              disabled={busy}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                border: "1px solid var(--app-border-strong)",
                backgroundColor: "var(--app-surface-soft)",
                color: "var(--app-text-primary)",
              }}
            />
            {error ? (
              <p className="text-[11px]" style={{ color: "var(--app-danger, #EF4444)" }}>
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !email}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-50"
              style={{
                border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)",
                color: "var(--app-brand-gold-deep)",
                backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 12%)",
              }}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {busy ? "Génération du lien…" : "Créer le lien d'invitation"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg px-3 py-2 text-xs transition"
              style={{ color: "var(--app-text-tertiary)" }}
            >
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div
      className="precision-card rounded-2xl px-5 py-4"
      style={{
        backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
        border: "1px solid var(--app-border)",
      }}
    >
      <div className="flex items-center gap-2">
        {icon ? (
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
            style={{
              backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 14%)",
              color: "var(--app-brand-gold-deep)",
            }}
          >
            {icon}
          </span>
        ) : null}
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-text-tertiary)" }}
        >
          {label}
        </p>
      </div>
      <p
        className="mt-2 font-mono text-xl font-semibold"
        style={{ color: "var(--app-text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}
