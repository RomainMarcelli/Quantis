// File: components/cabinet/FirmPortfolioView.tsx
// Role: Console de gestion du cabinet — Option B (cabinet-ux).
//   - Header "Portefeuille" + bouton "Ajouter une entreprise"
//   - Section "À traiter" : cards d'alertes dérivées des règles
//     déterministes (lib/config/alert-rules.ts)
//   - Section "Tous les dossiers" : table triable + recherche
//   - Modal d'invitation dirigeant (composant inline en bas)
//
// Le shell AppHeader + AppSidebar est conservé pour s'aligner sur les
// autres pages cockpit. Le bouton "Synchroniser tous" du brief
// précédent est retiré (l'action passe désormais par chaque dossier).
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Plus, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { firebaseAuthGateway } from "@/services/auth";
import { ROUTES } from "@/lib/config/routes";
import {
  evaluateAlerts,
  sortAlertsBySeverity,
  type AlertableCompany,
} from "@/lib/config/alert-rules";
import { AlertCard } from "@/components/cabinet/AlertCard";
import { PortfolioTable, type PortfolioCompany } from "@/components/cabinet/PortfolioTable";

type PortfolioData = {
  firm: { firmId: string; name: string };
  dossiers: PortfolioCompany[];
  total: number;
};

export function FirmPortfolioView() {
  const router = useRouter();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Mappe dossiers → AlertableCompany (mêmes champs, juste un re-narrow
  // de type pour clarifier le contrat avec alert-rules.ts).
  const alertableCompanies = useMemo<AlertableCompany[]>(() => {
    if (!data) return [];
    return data.dossiers.map((d) => ({
      companyId: d.companyId,
      name: d.externalCompanyName || d.name,
      source: d.source,
      lastSyncedAt: d.lastSyncedAt,
      kpis: d.kpis,
    }));
  }, [data]);

  const alerts = useMemo(
    () => sortAlertsBySeverity(evaluateAlerts(alertableCompanies)),
    [alertableCompanies]
  );

  const companyCount = data?.dossiers.length ?? 0;

  return (
    <div className="space-y-4">
      <AppHeader
        variant="simple"
        companyName={data?.firm.name ?? "Cabinet"}
        subtitle="Console cabinet"
        actionSlot={
          <button
            type="button"
            onClick={() => router.push(ROUTES.CABINET_ADD_COMPANY)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition"
            style={{
              border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)",
              color: "var(--app-brand-gold-deep)",
              backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 12%)",
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter une entreprise
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <AppSidebar activeRoute="cabinet-portefeuille" accountFirstName={firstName} />

        <section className="space-y-6">
          <div>
            <h1
              className="text-xl font-semibold md:text-2xl"
              style={{ color: "var(--app-text-primary)" }}
            >
              Portefeuille
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--app-text-secondary)" }}>
              {data?.firm.name ?? "Cabinet"} — {companyCount} dossier{companyCount > 1 ? "s" : ""}
              {alerts.length > 0
                ? ` • ${alerts.length} alerte${alerts.length > 1 ? "s" : ""}`
                : ""}
            </p>
          </div>

          {error ? (
            <p
              className="rounded-lg p-3 text-xs"
              style={{
                backgroundColor: "rgb(var(--app-danger-rgb, 239 68 68) / 10%)",
                color: "var(--app-danger, #EF4444)",
                border: "1px solid rgb(var(--app-danger-rgb, 239 68 68) / 30%)",
              }}
            >
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
          ) : data ? (
            <>
              {alerts.length > 0 ? (
                <div className="space-y-2">
                  <h2
                    className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                    style={{ color: "var(--app-text-tertiary)" }}
                  >
                    À traiter
                  </h2>
                  <div className="space-y-2">
                    {alerts.map((hit, idx) => (
                      <AlertCard
                        key={`${hit.rule.id}-${hit.company.companyId}-${idx}`}
                        hit={hit}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <PortfolioTable
                companies={data.dossiers}
                onInvite={(c) =>
                  setInviteTarget({
                    companyId: c.companyId,
                    companyName: c.externalCompanyName || c.name,
                  })
                }
              />
            </>
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

// ─── Modal d'invitation dirigeant (inline pour éviter un nouveau fichier) ──
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
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
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
