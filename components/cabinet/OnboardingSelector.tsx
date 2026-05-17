// File: components/cabinet/OnboardingSelector.tsx
// Role: composant client qui propose 2 parcours à l'inscription :
//   - "Je pilote mon entreprise"   → flow company_owner (vers /documents)
//   - "Je gère un cabinet"          → flow firm_member (vers /cabinet/onboarding/connect)
//
// Sprint C Tâche 2. Conserve le flow dirigeant existant intact.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Users } from "lucide-react";
import { firebaseAuthGateway } from "@/services/auth";

type Step = "choose" | "firm-name";

export function OnboardingSelector() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [firmName, setFirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Flow company_owner : redirige vers /documents (parcours existant).
  function chooseCompanyOwner() {
    router.push("/documents");
  }

  // Flow firm_member : 1) saisie nom cabinet, 2) POST création, 3) redirect connect.
  async function submitFirmName() {
    if (!firmName.trim()) {
      setError("Le nom du cabinet est obligatoire.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const idToken = await firebaseAuthGateway.getIdToken();
      if (!idToken) throw new Error("Session expirée — reconnectez-vous.");
      const res = await fetch("/api/cabinet/firm/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: firmName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Création du cabinet échouée.");
      }
      // Redirect vers la page de connexion OAuth Firm Pennylane.
      router.push("/cabinet/onboarding/connect");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
      setBusy(false);
    }
  }

  if (step === "firm-name") {
    return (
      <div
        className="mx-auto w-full max-w-md rounded-2xl p-6"
        style={{
          backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
          border: "1px solid var(--app-border)",
          backdropFilter: "blur(24px)",
        }}
      >
        <h2 className="mb-2 text-xl font-semibold" style={{ color: "var(--app-text-primary)" }}>
          Nom de votre cabinet
        </h2>
        <p className="mb-5 text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Le nom affiché en haut de votre portefeuille — modifiable plus tard.
        </p>
        <input
          type="text"
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
          placeholder="Ex : Cabinet Dupont & Associés"
          maxLength={120}
          autoFocus
          disabled={busy}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            border: "1px solid var(--app-border-strong)",
            backgroundColor: "var(--app-surface-soft)",
            color: "var(--app-text-primary)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitFirmName();
          }}
        />
        {error ? (
          <p className="mt-2 text-xs" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep("choose")}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-xs transition disabled:opacity-50"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text-secondary)",
              backgroundColor: "transparent",
            }}
          >
            Retour
          </button>
          <button
            type="button"
            onClick={() => void submitFirmName()}
            disabled={busy || !firmName.trim()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-50"
            style={{
              border: "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)",
              color: "var(--app-brand-gold-deep)",
              backgroundColor: "rgb(var(--app-brand-gold-deep-rgb) / 12%)",
            }}
          >
            {busy ? "Création…" : "Créer le cabinet →"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8 text-center">
        <h1
          className="text-2xl font-semibold md:text-3xl"
          style={{ color: "var(--app-text-primary)" }}
        >
          Bienvenue sur Vyzor
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Comment souhaitez-vous utiliser la plateforme ?
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectorCard
          icon={<Building2 className="h-7 w-7" />}
          title="Je pilote mon entreprise"
          subtitle="Connectez votre comptabilité (Pennylane, MyU, FEC…) et suivez vos KPIs financiers en temps réel."
          ctaLabel="Continuer"
          onClick={chooseCompanyOwner}
        />
        <SelectorCard
          icon={<Users className="h-7 w-7" />}
          title="Je gère un cabinet comptable"
          subtitle="Connectez votre cabinet Pennylane et accédez à plusieurs dossiers clients depuis un portefeuille unique."
          ctaLabel="Continuer"
          onClick={() => setStep("firm-name")}
          highlighted
        />
      </div>
    </div>
  );
}

function SelectorCard({
  icon,
  title,
  subtitle,
  ctaLabel,
  onClick,
  highlighted,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  ctaLabel: string;
  onClick: () => void;
  highlighted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full flex-col items-start gap-3 rounded-2xl p-6 text-left transition hover:scale-[1.01]"
      style={{
        backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
        border: highlighted
          ? "1px solid rgb(var(--app-brand-gold-deep-rgb) / 40%)"
          : "1px solid var(--app-border)",
        backdropFilter: "blur(24px)",
        boxShadow: highlighted
          ? "0 8px 32px rgb(var(--app-brand-gold-deep-rgb) / 8%)"
          : "none",
      }}
    >
      <span
        className="inline-flex h-12 w-12 items-center justify-center rounded-xl"
        style={{
          backgroundColor: highlighted
            ? "rgb(var(--app-brand-gold-deep-rgb) / 14%)"
            : "var(--app-surface-soft)",
          color: highlighted ? "var(--app-brand-gold-deep)" : "var(--app-text-secondary)",
        }}
      >
        {icon}
      </span>
      <span
        className="text-base font-semibold"
        style={{ color: "var(--app-text-primary)" }}
      >
        {title}
      </span>
      <span className="text-sm leading-relaxed" style={{ color: "var(--app-text-secondary)" }}>
        {subtitle}
      </span>
      <span
        className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-medium"
        style={{
          color: highlighted ? "var(--app-brand-gold-deep)" : "var(--app-text-primary)",
        }}
      >
        {ctaLabel} →
      </span>
    </button>
  );
}
