// File: components/cabinet/AddCompanyView.tsx
// Role: picker multi-source pour ajouter une entreprise au cabinet.
// La liste des sources vient de `lib/config/data-sources.ts` — activable
// via `enabled` sans toucher au composant.
//
// Types de source :
//   - oauth      → redirect vers l'endpoint /authorize-url du provider
//   - api_key    → redirect vers /cabinet/entreprises/ajouter/{provider}
//                  (page form clé API, à créer par provider)
//   - file_upload→ redirect vers /cabinet/entreprises/ajouter/manuel?source=…
//
// Le bouton mock (Pennylane fictif) reste visible en haut si
// NEXT_PUBLIC_MOCK_OAUTH_ENABLED === "true".
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, Lock, Sparkles } from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";
import { useAccountType } from "@/hooks/useAccountType";
import { ROUTES } from "@/lib/config/routes";
import { ACCOUNT_TYPES } from "@/lib/config/account-types";
import {
  getEnabledDataSources,
  DATA_SOURCES,
  type DataSource,
} from "@/lib/config/data-sources";

export function AddCompanyView() {
  const router = useRouter();
  const { accountType, loading: accountLoading } = useAccountType();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Garde firm_member-only.
  if (!accountLoading && accountType !== ACCOUNT_TYPES.FIRM_MEMBER) {
    router.replace(ROUTES.SYNTHESE);
    return null;
  }

  const mockEnabled = process.env.NEXT_PUBLIC_MOCK_OAUTH_ENABLED === "true";
  const enabled = getEnabledDataSources();
  const disabled = DATA_SOURCES.filter((s) => !s.enabled);
  const automated = enabled.filter((s) => s.type === "oauth" || s.type === "api_key");
  const manual = enabled.filter((s) => s.type === "file_upload");

  async function handleOAuth(source: DataSource): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      // À ce stade, seul Pennylane Firm est câblé. Les autres providers
      // OAuth pointeront vers leur propre authorize-url quand dispo.
      if (source.provider !== "pennylane_firm") {
        throw new Error(`OAuth ${source.name} non encore câblé. Contactez le support.`);
      }
      const res = await fetch(ROUTES.API_OAUTH_AUTHORIZE);
      if (!res.ok) throw new Error("Échec de l'init OAuth.");
      const { authorizeUrl } = (await res.json()) as { authorizeUrl: string };
      window.location.href = authorizeUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur OAuth.");
      setBusy(false);
    }
  }

  async function handleMockOAuth(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const user = firebaseAuthGateway.getCurrentUser();
      if (!user) throw new Error("Utilisateur non authentifié.");
      const firmName =
        (typeof window !== "undefined" && window.localStorage.getItem("vyzor_firm_name")) ||
        "Cabinet Test";
      const url = `${ROUTES.API_MOCK_OAUTH}?uid=${encodeURIComponent(user.uid)}&firmName=${encodeURIComponent(firmName)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Mock OAuth a échoué.");
      }
      const data = (await res.json()) as { connectionId: string };
      router.push(`${ROUTES.CABINET_PICKER}?connectionId=${encodeURIComponent(data.connectionId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mock OAuth a échoué.");
      setBusy(false);
    }
  }

  function handleApiKey(source: DataSource): void {
    // Pour l'instant, les API-key providers (MyU…) renvoient sur la page
    // d'ajout manuel — la création de la Company + collecte du token sera
    // déléguée à une page dédiée par provider quand le pipeline sera prêt.
    router.push(`${ROUTES.CABINET_ADD_COMPANY_MANUAL}?source=${encodeURIComponent(source.provider)}`);
  }

  function handleFileUpload(source: DataSource): void {
    router.push(`${ROUTES.CABINET_ADD_COMPANY_MANUAL}?source=${encodeURIComponent(source.provider)}`);
  }

  function clickSource(source: DataSource): void {
    if (!source.enabled) return;
    switch (source.type) {
      case "oauth":
        void handleOAuth(source);
        break;
      case "api_key":
        handleApiKey(source);
        break;
      case "file_upload":
        handleFileUpload(source);
        break;
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <button
        type="button"
        onClick={() => router.push(ROUTES.CABINET_PORTFOLIO)}
        className="mb-4 inline-flex items-center gap-1.5 text-xs"
        style={{ color: "var(--app-text-tertiary)" }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour au portefeuille
      </button>

      <div className="mb-6">
        <h1
          className="text-2xl font-semibold md:text-3xl"
          style={{ color: "var(--app-text-primary)" }}
        >
          Ajouter une entreprise
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Choisissez comment importer les données comptables de votre client.
        </p>
      </div>

      {mockEnabled ? (
        <div
          className="mb-6 rounded-xl p-4"
          style={{
            backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 8%)",
            border: "1px dashed rgb(var(--app-brand-gold-deep-rgb) / 40%)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--app-brand-gold-deep)" }}
              >
                ⚠️ Mode développement
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                Seed 3 dossiers Pennylane fictifs sans creds réels.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleMockOAuth()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-50"
              style={{
                border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 60%)",
                color: "var(--app-brand-gold-deep)",
                backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 18%)",
              }}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Simuler Pennylane (3 dossiers)
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className="mb-4 rounded-lg p-3 text-xs"
          style={{
            backgroundColor: "rgb(var(--app-danger-rgb, 239 68 68) / 10%)",
            color: "var(--app-danger, #EF4444)",
            border: "1px solid rgb(var(--app-danger-rgb, 239 68 68) / 30%)",
          }}
        >
          {error}
        </p>
      ) : null}

      {/* ─── Connexion automatique ─────────────────────────────────────── */}
      <SectionTitle>Connexion automatique</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {automated.map((s) => (
          <SourceCard key={s.id} source={s} busy={busy} onClick={() => clickSource(s)} />
        ))}
      </div>

      {/* ─── Import manuel ─────────────────────────────────────────────── */}
      <SectionTitle className="mt-8">Import manuel</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {manual.map((s) => (
          <SourceCard key={s.id} source={s} busy={busy} onClick={() => clickSource(s)} />
        ))}
      </div>

      {/* ─── Bientôt disponible ────────────────────────────────────────── */}
      {disabled.length > 0 ? (
        <>
          <SectionTitle className="mt-8">Bientôt disponible</SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {disabled.map((s) => (
              <SourceCard key={s.id} source={s} busy={false} onClick={() => undefined} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2
      className={`mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] ${className ?? ""}`}
      style={{ color: "var(--app-text-tertiary)" }}
    >
      {children}
    </h2>
  );
}

function SourceCard({
  source,
  busy,
  onClick,
}: {
  source: DataSource;
  busy: boolean;
  onClick: () => void;
}) {
  const disabled = !source.enabled || busy;
  const badgeLabel =
    source.type === "oauth"
      ? "OAuth"
      : source.type === "api_key"
        ? "Clé API"
        : "Upload fichier";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="precision-card flex flex-col gap-2 rounded-2xl p-5 text-left transition disabled:opacity-50"
      style={{
        backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
        border: "1px solid var(--app-border)",
        backdropFilter: "blur(24px)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = "rgb(var(--app-brand-gold-deep-rgb) / 40%)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--app-border)";
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xl">{source.icon}</span>
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
          style={{
            color: source.enabled ? "var(--app-text-tertiary)" : "var(--app-text-tertiary)",
            border: "1px solid var(--app-border)",
            backgroundColor: "var(--app-surface-soft)",
          }}
        >
          {source.enabled ? badgeLabel : <><Lock className="h-3 w-3" /> Bientôt</>}
        </span>
      </div>
      <h3
        className="text-base font-semibold"
        style={{ color: "var(--app-text-primary)" }}
      >
        {source.name}
      </h3>
      <p
        className="text-sm leading-relaxed"
        style={{ color: "var(--app-text-secondary)" }}
      >
        {source.description}
      </p>
      {source.enabled ? (
        <span
          className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-medium"
          style={{ color: "var(--app-text-secondary)" }}
        >
          Choisir
          <ExternalLink className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
}
