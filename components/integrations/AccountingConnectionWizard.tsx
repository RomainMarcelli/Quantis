// File: components/integrations/AccountingConnectionWizard.tsx
// Role: assistant pas-à-pas pour connecter un logiciel comptable (Pennylane, MyUnisoft,
// Odoo, Tiime, Autre). Trois étapes : choix → instructions contextuelles → récap connecté.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  Plug,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";

export type ProviderId = "pennylane" | "myunisoft" | "odoo" | "tiime" | "other";

type ProviderCard = {
  id: ProviderId;
  name: string;
  subtitle: string;
  /**
   * Logo en deux variantes :
   *   - `light` : version sombre/colorée pensée pour fond clair (mode jour)
   *   - `dark`  : version blanche/inversée pensée pour fond sombre (mode nuit).
   * Si `dark` est null, c'est que `light` reste lisible sur fond sombre (logos
   * monochromes hauts en contraste comme l'icône Pennylane).
   * Si tout est null, c'est la carte "Autre logiciel" → fallback icône.
   */
  logo: { light: string; dark: string | null } | null;
  available: boolean;
};

const PROVIDERS: ProviderCard[] = [
  // L'icône Pennylane (vert/teal) reste lisible sur fond clair ET sombre — pas de variante dédiée.
  { id: "pennylane", name: "Pennylane",      subtitle: "Connexion automatique",      logo: { light: "/images/integrations/pennylane.png", dark: null },                                       available: true  },
  { id: "myunisoft", name: "MyUnisoft",      subtitle: "Connexion automatique",      logo: { light: "/images/integrations/myunisoft.png", dark: "/images/integrations/myunisoft-dark.webp" }, available: true  },
  { id: "odoo",      name: "Odoo",           subtitle: "Connexion automatique",      logo: { light: "/images/integrations/odoo.svg",      dark: "/images/integrations/odoo-dark.svg" },        available: true  },
  { id: "tiime",     name: "Tiime",          subtitle: "Bientôt disponible",         logo: { light: "/images/integrations/tiime.svg",     dark: "/images/integrations/tiime-dark.svg" },       available: false },
  { id: "other",     name: "Autre logiciel", subtitle: "Import manuel (FEC ou PDF)", logo: null,                                                                                                available: true  },
];

type ConnectedRecap = {
  provider: ProviderId;
  connectionId: string;
  tokenPreview: string;
  itemsPersisted: number;
  syncedAt: string; // ISO
};

type WizardProps = {
  /** Appelé après une synchro réussie pour rafraîchir le parent (analyses, panneau de connections, etc.). */
  onSyncCompleted?: () => void | Promise<void>;
  /**
   * Provider à pré-sélectionner. Court-circuite l'écran "choisir un
   * logiciel" — utilisé quand le wizard est ouvert depuis une tuile
   * spécifique de la grille /documents.
   */
  initialProvider?: ProviderId | null;
};

export function AccountingConnectionWizard({
  onSyncCompleted,
  initialProvider = null,
}: WizardProps) {
  const [chosen, setChosen] = useState<ProviderId | null>(initialProvider);
  const [recap, setRecap] = useState<ConnectedRecap | null>(null);

  function reset() {
    setChosen(null);
    setRecap(null);
  }

  async function handleResync() {
    if (!recap) return;
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) return;
    const res = await fetch(`/api/integrations/${recap.provider}/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: recap.connectionId }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      report?: { entities?: { itemsPersisted: number }[] };
    };
    if (!res.ok) return;
    const total = data.report?.entities?.reduce((s, e) => s + e.itemsPersisted, 0) ?? 0;
    setRecap({ ...recap, itemsPersisted: total, syncedAt: new Date().toISOString() });
    if (onSyncCompleted) await onSyncCompleted();
  }

  async function handleDisconnect() {
    if (!recap) return;
    if (!confirm("Supprimer cette connexion ?")) return;
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) return;
    await fetch(`/api/integrations/${recap.provider}/disconnect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: recap.connectionId }),
    });
    reset();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("quantis:connections-changed"));
    }
    if (onSyncCompleted) await onSyncCompleted();
  }

  // ─── Étape 3 : statut connecté ─────────────────────────────────────────────
  if (recap) {
    return (
      <WizardShell>
        <ConnectedRecapCard
          recap={recap}
          onResync={handleResync}
          onDisconnect={handleDisconnect}
          onAddAnother={reset}
        />
      </WizardShell>
    );
  }

  // ─── Étape 1 : choix du logiciel ───────────────────────────────────────────
  if (!chosen) {
    return (
      <WizardShell>
        <Header
          title="Connectez votre logiciel comptable"
          subtitle="Choisissez votre logiciel pour synchroniser automatiquement vos données."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setChosen(p.id)}
              className="group flex flex-col items-start gap-3 rounded-xl border border-quantis-border bg-quantis-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-quantis-gold/50 hover:bg-quantis-surface/80"
            >
              <ProviderBadge provider={p} />
              <div>
                <p className="text-sm font-semibold text-white">{p.name}</p>
                <p className="mt-0.5 text-xs text-white/55">{p.subtitle}</p>
              </div>
              {!p.available && (
                <span className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
                  Bientôt
                </span>
              )}
            </button>
          ))}
        </div>
      </WizardShell>
    );
  }

  // ─── Étape 2 : instructions + formulaire ───────────────────────────────────
  return (
    <WizardShell>
      <BackButton onBack={() => setChosen(null)} />
      {chosen === "pennylane" && (
        <PennylaneStep onConnected={setRecap} onSyncCompleted={onSyncCompleted} />
      )}
      {chosen === "myunisoft" && (
        <MyUnisoftStep onConnected={setRecap} onSyncCompleted={onSyncCompleted} />
      )}
      {chosen === "odoo" && (
        <OdooStep onConnected={setRecap} onSyncCompleted={onSyncCompleted} />
      )}
      {chosen === "tiime" && <TiimeStep />}
      {chosen === "other" && <OtherStep />}
    </WizardShell>
  );
}

// ─── Coquille commune ────────────────────────────────────────────────────────
function WizardShell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-quantis-border bg-quantis-surface p-5 md:p-6">
      {children}
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-quantis-gold" />
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>
      <p className="mt-1 text-xs text-white/55">{subtitle}</p>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-quantis-border bg-quantis-base/60 px-2.5 py-1 text-[11px] text-white/70 transition hover:border-quantis-gold/40 hover:text-white"
    >
      <ArrowLeft className="h-3 w-3" />
      Changer de logiciel
    </button>
  );
}

/**
 * Rend le logo officiel du provider sur un plateau adapté au thème :
 *   - mode jour (`[data-theme="light"]`) : plateau blanc + logo couleur sombre
 *   - mode nuit (par défaut)             : plateau transparent (juste une bordure
 *     subtile) + logo blanc/clair, ou logo couleur si la version sombre suffit.
 *
 * Les deux variantes du logo sont rendues côte à côte ; on utilise les variants
 * Tailwind `dark:` pour switcher la visibilité (Tailwind est configuré en
 * `darkMode: "class"` et `ThemeProvider` ajoute la classe `dark`/`light` à <html>).
 */
function ProviderBadge({ provider, size = "md" }: { provider: ProviderCard; size?: "md" | "lg" }) {
  const dims = size === "lg" ? "h-12 w-32" : "h-10 w-24";

  if (!provider.logo) {
    // Cas "Autre logiciel" — pas de logo officiel : icône Plus sur plateau identique
    // aux autres cartes (blanc en jour, blanc translucide en nuit).
    return (
      <div
        className={`flex ${dims} items-center justify-center rounded-lg border border-quantis-border bg-white dark:border-white/10 dark:bg-white/5`}
      >
        <Plus className="h-5 w-5 text-quantis-gold" />
      </div>
    );
  }

  const hasDarkVariant = provider.logo.dark !== null;

  return (
    <div
      className={`relative flex ${dims} items-center justify-center overflow-hidden rounded-lg border border-quantis-border bg-white dark:border-white/10 dark:bg-white/5`}
    >
      {/* Variante "jour" (logo couleur sombre) — visible en light mode, masquée en dark. */}
      <Image
        src={provider.logo.light}
        alt={`Logo ${provider.name}`}
        fill
        sizes="128px"
        className={`object-contain p-2 ${hasDarkVariant ? "dark:hidden" : ""}`}
      />
      {/* Variante "nuit" (logo blanc/inversé) — montée par-dessus en dark mode. */}
      {hasDarkVariant && provider.logo.dark && (
        <Image
          src={provider.logo.dark}
          alt={`Logo ${provider.name}`}
          fill
          sizes="128px"
          className="hidden object-contain p-2 dark:block"
        />
      )}
    </div>
  );
}

function Instruction({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-quantis-border bg-quantis-base/60 p-4">
      <p className="text-xs uppercase tracking-wider text-quantis-gold">Étape</p>
      <p className="mt-1 text-sm leading-relaxed text-white/80">{children}</p>
    </div>
  );
}

function PrivacyNote() {
  return (
    <p className="mt-3 flex items-start gap-2 text-[11px] text-white/50">
      <Lock className="mt-0.5 h-3 w-3 shrink-0 text-quantis-gold" />
      <span>Vos données restent privées et chiffrées. Nous accédons en lecture seule.</span>
    </p>
  );
}

function SecureField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  sensitive,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "email";
  disabled?: boolean;
  sensitive?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-white/80">
        {label}
        {sensitive && (
          <span title="Chiffré et sécurisé" className="inline-flex">
            <Lock className="h-3 w-3 text-quantis-gold" />
          </span>
        )}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-quantis-border bg-quantis-base px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:border-quantis-gold focus:outline-none disabled:opacity-40"
      />
      {hint && <span className="mt-1 block text-[11px] text-white/45">{hint}</span>}
    </label>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  busy,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-quantis-gold px-4 py-2 text-xs font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

// ─── Réseau commun ───────────────────────────────────────────────────────────
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

function extractError(data: unknown, fallback: string): string {
  const obj = data as { detail?: string; error?: string } | undefined;
  return obj?.detail ?? obj?.error ?? fallback;
}

function totalPersisted(data: unknown): number {
  const report = (data as { report?: { entities?: { itemsPersisted: number }[] } }).report;
  return report?.entities?.reduce((s, e) => s + e.itemsPersisted, 0) ?? 0;
}

// L'auto-activation post-sync a été retirée : avec le nouveau modèle
// "source active" stocké en Firestore, l'activation est explicite via le
// toggle binaire vert/rouge de /documents (cf. useActiveDataSource).
// Une sync ne doit plus forcer la bascule pour respecter le choix
// utilisateur (notamment cross-device).

type ConnectedHandler = (recap: ConnectedRecap) => void;

// ─── Pennylane ───────────────────────────────────────────────────────────────
//
// Comportement attendu côté UX :
//   - Si une connection ACTIVE Pennylane existe déjà pour cet utilisateur,
//     on affiche directement un panneau "Vous êtes déjà connecté" + Resync
//     en un clic. Le token n'est PAS redemandé — il est persisté chiffré
//     dans Firestore et l'utilisateur n'a aucune raison de le retaper.
//   - Sinon, on affiche le formulaire token classique (premier setup).
//   - Un lien discret "Remplacer le token" laisse la possibilité de
//     supprimer la connection existante puis d'en créer une nouvelle
//     (cas : le token a fuité ou a été révoqué côté Pennylane).
function PennylaneStep({
  onConnected,
  onSyncCompleted,
}: {
  onConnected: ConnectedHandler;
  onSyncCompleted?: () => void | Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Brief 13/05/2026 + 14/05/2026 : la Vue 3 peut exposer jusqu'à 3 méthodes
  // de connexion selon les feature flags :
  //   - "cabinet"    → OAuth Firm     — visible UNIQUEMENT si PENNYLANE_FIRM_VISIBLE=true
  //                                     (gaté : tant que la notion de compte
  //                                     cabinet n'existe pas dans le produit,
  //                                     les bêta-testeurs sont dirigeants TPE/PME)
  //   - "entreprise" → OAuth Company  — visible UNIQUEMENT si PENNYLANE_COMPANY_ENABLED=true
  //                                     (en attente de validation Pennylane)
  //   - "token"      → token manuel   — toujours visible (comportement
  //                                     historique pré-OAuth)
  // Quand AUCUN OAuth n'est visible, on bypass le sélecteur et on rend
  // directement le formulaire token (UX pré-OAuth conservée).
  type ConnectionMethod = "selector" | "token";
  // Init "token" par défaut. Si firmVisible OU companyEnabled passe à true
  // après chargement de la config, on bascule en "selector".
  const [method, setMethod] = useState<ConnectionMethod>("token");

  // Feature flags exposés par /api/integrations/pennylane/config.
  // undefined = en cours de chargement (on rend le token form par défaut).
  const [companyOAuthEnabled, setCompanyOAuthEnabled] = useState<boolean | undefined>(undefined);
  const [firmOAuthVisible, setFirmOAuthVisible] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/integrations/pennylane/config");
        if (!res.ok) {
          if (!cancelled) {
            setCompanyOAuthEnabled(false);
            setFirmOAuthVisible(false);
          }
          return;
        }
        const data = (await res.json()) as {
          companyEnabled: boolean;
          firmVisible: boolean;
        };
        if (cancelled) return;
        const company = Boolean(data.companyEnabled);
        const firm = Boolean(data.firmVisible);
        setCompanyOAuthEnabled(company);
        setFirmOAuthVisible(firm);
        // Si au moins un OAuth est exposé, on présente le sélecteur ;
        // sinon on reste sur le formulaire token (UX pré-OAuth).
        if (company || firm) {
          setMethod("selector");
        }
      } catch {
        if (!cancelled) {
          setCompanyOAuthEnabled(false);
          setFirmOAuthVisible(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Connection existante détectée au mount — null tant qu'on ne sait pas.
  type ExistingConnection = {
    id: string;
    tokenPreview: string;
    lastSyncAt: string | null;
    lastSyncStatus: string;
    externalCompanyId: string;
  };
  const [existing, setExisting] = useState<ExistingConnection | null | undefined>(undefined);
  const [forceNewToken, setForceNewToken] = useState(false);

  // Détection de la connection active au mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const idToken = await firebaseAuthGateway.getIdToken();
        if (!idToken) {
          if (!cancelled) setExisting(null);
          return;
        }
        const res = await fetch("/api/integrations/connections", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          if (!cancelled) setExisting(null);
          return;
        }
        const data = (await res.json()) as {
          connections: Array<{
            id: string;
            provider: string;
            status: string;
            tokenPreview: string;
            lastSyncAt: string | null;
            lastSyncStatus: string;
            externalCompanyId: string;
          }>;
        };
        const active = data.connections.find(
          (c) => c.provider === "pennylane" && c.status === "active"
        );
        if (cancelled) return;
        setExisting(
          active
            ? {
                id: active.id,
                tokenPreview: active.tokenPreview,
                lastSyncAt: active.lastSyncAt,
                lastSyncStatus: active.lastSyncStatus,
                externalCompanyId: active.externalCompanyId,
              }
            : null
        );
      } catch {
        if (!cancelled) setExisting(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConnect() {
    if (!token.trim()) {
      setError("Token manquant.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const connect = await callApi("/api/integrations/pennylane/connect", {
        mode: "company_token",
        accessToken: token.trim(),
      });
      if (!connect.ok) throw new Error(extractError(connect.data, "Connexion refusée"));
      const connectionId = (connect.data as { connectionId: string }).connectionId;
      const tokenPreview = (connect.data as { tokenPreview?: string }).tokenPreview ?? "••••";
      const sync = await callApi("/api/integrations/pennylane/sync", { connectionId });
      if (!sync.ok) throw new Error(extractError(sync.data, "Synchronisation échouée"));
      // Active automatiquement la nouvelle analyse Pennylane comme source du
      // dashboard. Sans ça l'utilisateur sync mais reste sur sa source précédente
      // (PDF, Excel) sans s'en rendre compte — c'est exactement la friction
      // qu'on cherche à éliminer.

      onConnected({
        provider: "pennylane",
        connectionId,
        tokenPreview,
        itemsPersisted: totalPersisted(sync.data),
        syncedAt: new Date().toISOString(),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("quantis:connections-changed"));
      }
      if (onSyncCompleted) await onSyncCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  // Resync sur la connection existante — sans redemander le token.
  async function handleResyncExisting() {
    if (!existing) return;
    setError(null);
    setBusy(true);
    try {
      const sync = await callApi("/api/integrations/pennylane/sync", {
        connectionId: existing.id,
      });
      if (!sync.ok) throw new Error(extractError(sync.data, "Synchronisation échouée"));
      // Idem que handleConnect : on bascule la source active sur la nouvelle
      // analyse Pennylane générée par ce resync, pour que le dashboard reflète
      // immédiatement les chiffres frais.

      onConnected({
        provider: "pennylane",
        connectionId: existing.id,
        tokenPreview: existing.tokenPreview,
        itemsPersisted: totalPersisted(sync.data),
        syncedAt: new Date().toISOString(),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("quantis:connections-changed"));
      }
      if (onSyncCompleted) await onSyncCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  // Supprime la connection existante puis bascule sur le formulaire token —
  // utilisé quand l'utilisateur veut entrer un NOUVEAU token (rotation,
  // changement de société). Demande une confirmation explicite.
  async function handleReplaceToken() {
    if (!existing) return;
    if (!confirm("Remplacer le token Pennylane ? La connexion actuelle sera supprimée.")) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Non authentifié");
      const res = await fetch("/api/integrations/pennylane/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: existing.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(extractError(data, "Suppression échouée"));
      }
      setExisting(null);
      setForceNewToken(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("quantis:connections-changed"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  // ── Vue 1 : on attend de savoir s'il y a une connection existante ──
  if (existing === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Header title="Connectez votre Pennylane" subtitle="Vérification en cours..." />
        <Loader2 className="h-4 w-4 animate-spin text-quantis-gold" />
      </div>
    );
  }

  // ── Vue 2 : connection existante détectée → Resync direct ──
  if (existing && !forceNewToken) {
    return (
      <div className="flex flex-col gap-4">
        <Header
          title="Vous êtes déjà connecté à Pennylane"
          subtitle="Pas besoin de retaper votre token — il est conservé chiffré dans votre compte."
        />
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-300" />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Connexion active</p>
              <p className="mt-0.5 font-mono text-[11px] text-white/70">
                Token : {existing.tokenPreview}
              </p>
              <p className="mt-0.5 text-[11px] text-white/55">
                Société : <span className="font-mono text-white/80">{existing.externalCompanyId || "—"}</span>
              </p>
              {existing.lastSyncAt && (
                <p className="mt-0.5 text-[11px] text-white/55">
                  Dernier sync :{" "}
                  <span className="text-white/80">
                    {new Date(existing.lastSyncAt).toLocaleString("fr-FR")}
                  </span>{" "}
                  ({existing.lastSyncStatus})
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={() => void handleResyncExisting()} disabled={busy} busy={busy}>
            {busy ? "Synchronisation..." : "Synchroniser et utiliser cette source"}
          </PrimaryButton>
          <button
            type="button"
            onClick={() => void handleReplaceToken()}
            disabled={busy}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            Remplacer le token
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <PrivacyNote />
      </div>
    );
  }

  // ── Démarre un flow OAuth (firm | company) → redirige vers Pennylane ──
  async function startOAuth(kind: "firm" | "company") {
    setError(null);
    setBusy(true);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Session expirée — reconnectez-vous.");
      const res = await fetch("/api/integrations/pennylane/connect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "oauth2", kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractError(data, "Initialisation OAuth échouée"));
      const { authorizeUrl } = data as { authorizeUrl: string };
      // Redirection navigateur vers Pennylane. Au retour, le callback
      // (/api/integrations/pennylane/callback) crée la connexion puis
      // redirige vers /documents?pennylane_oauth=success&kind=...
      window.location.href = authorizeUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setBusy(false);
    }
  }

  // ── Vue 3 : sélecteur de méthode de connexion (OAuth Cabinet / Entreprise / Token manuel) ──
  if (method === "selector") {
    return (
      <div className="flex flex-col gap-4">
        <Header
          title="Connectez votre Pennylane"
          subtitle="Choisissez la méthode adaptée à votre profil."
        />

        {/* Méthode PRIMAIRE — Cabinet (Firm OAuth) — gatée par
            PENNYLANE_FIRM_VISIBLE (brief 14/05/2026). Tant que la notion
            de compte cabinet n'existe pas dans le produit, on masque la
            tuile aux dirigeants TPE/PME. Le back-end OAuth Firm reste
            fonctionnel — Antoine peut activer le flag sur preview pour
            tester le flow bout-en-bout. */}
        {firmOAuthVisible ? (
          <button
            type="button"
            onClick={() => void startOAuth("firm")}
            disabled={busy}
            className="flex flex-col items-start gap-1.5 rounded-xl border border-quantis-gold/30 bg-quantis-gold/[0.06] px-4 py-3 text-left transition hover:border-quantis-gold/60 hover:bg-quantis-gold/[0.1] disabled:opacity-50"
          >
            <span className="text-sm font-semibold text-quantis-gold">
              Connecter mon cabinet Pennylane
            </span>
            <span className="text-xs text-white/70">
              Recommandé si vous êtes expert-comptable et souhaitez connecter plusieurs dossiers clients.
            </span>
          </button>
        ) : null}

        {/* Méthode SECONDAIRE — Entreprise (Company OAuth, conditionnel feature flag) */}
        {companyOAuthEnabled ? (
          <button
            type="button"
            onClick={() => void startOAuth("company")}
            disabled={busy}
            className="flex flex-col items-start gap-1.5 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-left transition hover:border-white/30 hover:bg-white/[0.06] disabled:opacity-50"
          >
            <span className="text-sm font-semibold text-white">
              Connecter mon entreprise
            </span>
            <span className="text-xs text-white/65">
              Recommandé si vous êtes dirigeant et souhaitez connecter votre propre dossier.
            </span>
          </button>
        ) : null}

        {/* Méthode TERTIAIRE — Token manuel (fallback compat bêta-testeurs) */}
        <button
          type="button"
          onClick={() => setMethod("token")}
          disabled={busy}
          className="text-left text-xs text-white/55 underline-offset-2 hover:text-white/85 hover:underline disabled:opacity-50"
        >
          J&apos;ai déjà un token API (collez-le manuellement)
        </button>

        {error && <p className="text-xs text-red-400">{error}</p>}
        <PrivacyNote />
      </div>
    );
  }

  // ── Vue 4 : formulaire token manuel (méthode tertiaire) ──
  return (
    <div className="flex flex-col gap-4">
      <Header title="Connectez votre Pennylane" subtitle="Synchronisation en lecture seule depuis votre compte." />
      <Instruction>
        Dans votre compte Pennylane, allez dans <strong className="text-white">Paramètres → Connectivité → Développeurs → Générer un token API</strong>.
      </Instruction>
      <SecureField
        label="Collez votre token ici"
        value={token}
        onChange={setToken}
        placeholder="Pennylane Company Token"
        type="password"
        sensitive
        disabled={busy}
      />
      <div className="flex flex-wrap gap-2">
        <PrimaryButton onClick={() => void handleConnect()} disabled={busy || !token.trim()} busy={busy}>
          {busy ? "Connexion en cours…" : "Connecter"}
        </PrimaryButton>
        {/* "Retour" affiché uniquement si une méthode OAuth est exposée
            (sélecteur disponible). En mode dirigeant pur (PENNYLANE_FIRM_VISIBLE
            et PENNYLANE_COMPANY_ENABLED tous deux false), le formulaire
            token est l'unique vue — pas de retour à proposer. */}
        {firmOAuthVisible || companyOAuthEnabled ? (
          <button
            type="button"
            onClick={() => setMethod("selector")}
            disabled={busy}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40"
          >
            Retour
          </button>
        ) : null}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <PrivacyNote />
    </div>
  );
}

// ─── MyUnisoft ───────────────────────────────────────────────────────────────
function MyUnisoftStep({
  onConnected,
  onSyncCompleted,
}: {
  onConnected: ConnectedHandler;
  onSyncCompleted?: () => void | Promise<void>;
}) {
  const [jwt, setJwt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    if (!jwt.trim()) {
      setError("Token JWT obligatoire.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // L'externalCompanyId est dérivé côté serveur depuis le JWT
      // (claim `sub`/`cabinet_id`) — l'utilisateur n'a pas à le saisir.
      const connect = await callApi("/api/integrations/myunisoft/connect", {
        accessToken: jwt.trim(),
      });
      if (!connect.ok) throw new Error(extractError(connect.data, "Connexion refusée"));
      const connectionId = (connect.data as { connectionId: string }).connectionId;
      const tokenPreview = (connect.data as { tokenPreview?: string }).tokenPreview ?? "••••";
      const sync = await callApi("/api/integrations/myunisoft/sync", { connectionId });
      if (!sync.ok) throw new Error(extractError(sync.data, "Synchronisation échouée"));
      onConnected({
        provider: "myunisoft",
        connectionId,
        tokenPreview,
        itemsPersisted: totalPersisted(sync.data),
        syncedAt: new Date().toISOString(),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("quantis:connections-changed"));
      }
      if (onSyncCompleted) await onSyncCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Header title="Connectez votre MyUnisoft" subtitle="Synchronisation en lecture seule depuis votre dossier." />
      <Instruction>
        Dans MyUnisoft, allez dans <strong className="text-white">Paramètres → Connecteurs dossier → Sélectionnez Vyzor → Cliquez Générer</strong>.
      </Instruction>
      <div className="grid grid-cols-1 gap-3">
        <SecureField
          label="Token JWT"
          value={jwt}
          onChange={setJwt}
          placeholder="JWT…"
          type="password"
          sensitive
          disabled={busy}
        />
      </div>
      <div>
        <PrimaryButton
          onClick={() => void handleConnect()}
          disabled={busy || !jwt.trim()}
          busy={busy}
        >
          {busy ? "Connexion en cours…" : "Connecter"}
        </PrimaryButton>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <PrivacyNote />
    </div>
  );
}

// ─── Odoo ────────────────────────────────────────────────────────────────────
function OdooStep({
  onConnected,
  onSyncCompleted,
}: {
  onConnected: ConnectedHandler;
  onSyncCompleted?: () => void | Promise<void>;
}) {
  const [instanceUrl, setInstanceUrl] = useState("");
  const [login, setLogin] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [database, setDatabase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    if (!instanceUrl.trim() || !login.trim() || !apiKey.trim()) {
      setError("URL, email et clé API sont obligatoires.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, string> = {
        instanceUrl: instanceUrl.trim(),
        login: login.trim(),
        apiKey: apiKey.trim(),
      };
      if (database.trim()) body.database = database.trim();
      const connect = await callApi("/api/integrations/odoo/connect", body);
      if (!connect.ok) throw new Error(extractError(connect.data, "Connexion refusée"));
      const connectionId = (connect.data as { connectionId: string }).connectionId;
      const tokenPreview = (connect.data as { tokenPreview?: string }).tokenPreview ?? "••••";
      const sync = await callApi("/api/integrations/odoo/sync", { connectionId });
      if (!sync.ok) throw new Error(extractError(sync.data, "Synchronisation échouée"));
      onConnected({
        provider: "odoo",
        connectionId,
        tokenPreview,
        itemsPersisted: totalPersisted(sync.data),
        syncedAt: new Date().toISOString(),
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("quantis:connections-changed"));
      }
      if (onSyncCompleted) await onSyncCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Header title="Connectez votre Odoo" subtitle="Compatible SaaS, Odoo.com et self-hosted." />
      <Instruction>
        Dans votre Odoo, allez dans <strong className="text-white">Préférences → Compte → Clés API → Nouvelle clé API</strong>.
      </Instruction>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SecureField
          label="URL de votre Odoo"
          value={instanceUrl}
          onChange={setInstanceUrl}
          placeholder="monentreprise.odoo.com"
          disabled={busy}
        />
        <SecureField
          label="Email de connexion"
          value={login}
          onChange={setLogin}
          placeholder="vous@entreprise.com"
          type="email"
          disabled={busy}
        />
        <SecureField
          label="Clé API"
          value={apiKey}
          onChange={setApiKey}
          placeholder="Clé API Odoo"
          type="password"
          sensitive
          disabled={busy}
        />
        <SecureField
          label="Base de données"
          value={database}
          onChange={setDatabase}
          placeholder="(optionnel)"
          hint="Laissez vide si vous êtes sur odoo.com"
          disabled={busy}
        />
      </div>
      <div>
        <PrimaryButton
          onClick={() => void handleConnect()}
          disabled={busy || !instanceUrl.trim() || !login.trim() || !apiKey.trim()}
          busy={busy}
        >
          {busy ? "Connexion en cours…" : "Connecter"}
        </PrimaryButton>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <PrivacyNote />
    </div>
  );
}

// ─── Tiime (bientôt) ─────────────────────────────────────────────────────────
function TiimeStep() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    if (!email.trim() || !email.includes("@")) return;
    // Stocke localement la demande de notification — le back consommera ça plus tard.
    if (typeof window !== "undefined") {
      const key = "quantis:tiime-notify";
      const existing = JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[];
      if (!existing.includes(email.trim())) {
        existing.push(email.trim());
        window.localStorage.setItem(key, JSON.stringify(existing));
      }
    }
    setSubmitted(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <Header title="Tiime arrive bientôt" subtitle="L'intégration directe est en cours de développement." />
      <Instruction>
        Bientôt disponible — nous y travaillons. Laissez-nous votre email pour être prévenu(e) du lancement.
      </Instruction>
      {submitted ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Merci, nous vous tenons au courant.
        </div>
      ) : (
        <>
          <SecureField
            label="Email pour être notifié"
            value={email}
            onChange={setEmail}
            placeholder="vous@entreprise.com"
            type="email"
          />
          <div>
            <PrimaryButton onClick={handleSubmit} disabled={!email.trim()}>
              <Mail className="h-3.5 w-3.5" />
              Me prévenir
            </PrimaryButton>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Autre logiciel (FEC, Excel, PDF) ────────────────────────────────────────
function OtherStep() {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <Header
        title="Importez vos données comptables"
        subtitle="FEC, Excel ou PDF — le parser détecte automatiquement le format."
      />

      <div className="rounded-xl border border-quantis-border bg-quantis-base/60 p-4">
        <p className="text-xs leading-relaxed text-white/65">
          Depuis votre logiciel comptable (Sage, Cegid, EBP…), exportez votre{" "}
          <strong className="text-white">Fichier des Écritures Comptables (FEC)</strong>{" "}
          — généralement dans <em>Menu → Exports → FEC</em>. Vous pouvez aussi déposer un{" "}
          <strong className="text-white">tableur Excel</strong> (bilan, compte de résultat) ou un{" "}
          <strong className="text-white">PDF</strong> de liasse fiscale.
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <FormatBadge label="FEC" recommended />
          <FormatBadge label="Excel (.xlsx, .xls, .csv)" />
          <FormatBadge label="PDF" />
        </div>

        <button
          type="button"
          onClick={() => router.push("/upload")}
          className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-quantis-border bg-quantis-base/40 px-4 py-7 text-center transition hover:border-quantis-gold/50 hover:bg-quantis-base/60"
        >
          <Upload className="h-5 w-5 text-quantis-gold" />
          <span className="text-sm font-medium text-white/85">
            Glissez votre fichier ici, ou cliquez pour parcourir
          </span>
          <span className="text-[11px] text-white/45">FEC · .xlsx · .xls · .csv · .pdf</span>
        </button>
      </div>
    </div>
  );
}

function FormatBadge({ label, recommended }: { label: string; recommended?: boolean }) {
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
        recommended
          ? "border-quantis-gold/40 bg-quantis-gold/10 text-quantis-gold"
          : "border-quantis-border bg-quantis-base text-white/60"
      }`}
    >
      {recommended ? `${label} · recommandé` : label}
    </span>
  );
}

// ─── Étape 3 — recap connecté ────────────────────────────────────────────────
function ConnectedRecapCard({
  recap,
  onResync,
  onDisconnect,
  onAddAnother,
}: {
  recap: ConnectedRecap;
  onResync: () => void | Promise<void>;
  onDisconnect: () => void | Promise<void>;
  onAddAnother: () => void;
}) {
  const [resyncing, setResyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const provider = PROVIDERS.find((p) => p.id === recap.provider);
  const synced = new Date(recap.syncedAt);

  async function doResync() {
    setResyncing(true);
    try {
      await onResync();
    } finally {
      setResyncing(false);
    }
  }
  async function doDisconnect() {
    setDisconnecting(true);
    try {
      await onDisconnect();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {provider && <ProviderBadge provider={provider} size="lg" />}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-white">{provider?.name ?? recap.provider}</h3>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              Connecté
            </span>
          </div>
          <p className="mt-1 text-xs text-white/55">
            Dernier sync :{" "}
            <span className="text-white/80">
              {synced.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </span>
            {" · "}
            <span className="text-white/80">{recap.itemsPersisted}</span> entité(s) persistée(s)
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-white/45">
            <Lock className="h-3 w-3 text-quantis-gold" />
            Token : <span className="font-mono text-white/70">{recap.tokenPreview}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void doResync()}
          disabled={resyncing || disconnecting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-quantis-border bg-quantis-base/60 px-3 py-1.5 text-xs font-medium text-white/85 transition hover:border-quantis-gold/40 hover:bg-quantis-base disabled:opacity-40"
        >
          {resyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Synchroniser maintenant
        </button>
        <button
          type="button"
          onClick={() => void doDisconnect()}
          disabled={resyncing || disconnecting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
        >
          {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Déconnecter
        </button>
        <button
          type="button"
          onClick={onAddAnother}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-quantis-border bg-quantis-base/60 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-quantis-gold/40 hover:text-white"
        >
          Ajouter une autre source
        </button>
      </div>
    </div>
  );
}
