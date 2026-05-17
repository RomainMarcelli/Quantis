// File: components/cabinet/OnboardingSelector.tsx
// Role: composant client PRÉ-signup qui propose 2 parcours :
//   - "Je pilote mon entreprise"  → localStorage company_owner + /register
//   - "Je gère un cabinet"        → localStorage firm_member  + /cabinet/setup
//
// feature/cabinet-ux : le picker est désormais accessible AVANT création
// de compte. La saisie du nom du cabinet a été déplacée dans /cabinet/setup.
// L'écriture accountType + Firm en Firestore se fait dans AuthPage après
// signup réussi (lecture des clés localStorage `vyzor_account_type` et
// `vyzor_firm_name`).
"use client";

import { useRouter } from "next/navigation";
import { Building2, Users } from "lucide-react";

const LS_KEYS = {
  accountType: "vyzor_account_type",
  firmName: "vyzor_firm_name",
  firmExpected: "vyzor_firm_expected_dossiers",
} as const;

export function OnboardingSelector() {
  const router = useRouter();

  function chooseCompanyOwner() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_KEYS.accountType, "company_owner");
      // Nettoyage des clés firm résiduelles si l'user change d'avis.
      window.localStorage.removeItem(LS_KEYS.firmName);
      window.localStorage.removeItem(LS_KEYS.firmExpected);
    }
    router.push("/register?next=/synthese");
  }

  function chooseFirmMember() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_KEYS.accountType, "firm_member");
    }
    router.push("/cabinet/setup");
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
          Comment souhaitez-vous utiliser la plateforme&nbsp;?
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
          onClick={chooseFirmMember}
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
