// File: components/cabinet/OnboardingSelector.tsx
// Role: picker pré-auth (company_owner vs firm_member). Toutes les options +
// routes viennent de `lib/config/onboarding.ts` → aucune valeur hard-codée
// ici, le composant est purement présentationnel.
//
// Le choix est stocké en localStorage (clé `vyzor_account_type`) puis
// consommé par AuthPage après signup pour écrire users/{uid}.accountType
// et créer la Firm si firm_member.
"use client";

import { useRouter } from "next/navigation";
import { Building2, Users } from "lucide-react";
import { ONBOARDING_OPTIONS, type OnboardingOption } from "@/lib/config/onboarding";
import { PRE_AUTH_STORAGE_KEYS, ACCOUNT_TYPES } from "@/lib/config/account-types";

// Mapping icône emoji → composant Lucide pour les cartes (l'emoji du config
// reste consommable par les éventuelles surfaces purement textuelles).
const ICON_BY_ID = {
  [ACCOUNT_TYPES.COMPANY_OWNER]: <Building2 className="h-7 w-7" />,
  [ACCOUNT_TYPES.FIRM_MEMBER]: <Users className="h-7 w-7" />,
} as const;

export function OnboardingSelector() {
  const router = useRouter();

  function choose(option: OnboardingOption): void {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PRE_AUTH_STORAGE_KEYS.accountType, option.id);
      // Si l'user repasse sur company_owner, on nettoie d'éventuelles clés firm
      // résiduelles (cas backtrack depuis /cabinet/setup → /onboarding).
      if (option.id === ACCOUNT_TYPES.COMPANY_OWNER) {
        window.localStorage.removeItem(PRE_AUTH_STORAGE_KEYS.firmName);
        window.localStorage.removeItem(PRE_AUTH_STORAGE_KEYS.firmExpected);
      }
    }
    router.push(option.redirectTo);
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
        {ONBOARDING_OPTIONS.map((option) => (
          <SelectorCard
            key={option.id}
            icon={ICON_BY_ID[option.id]}
            title={option.title}
            subtitle={option.description}
            onClick={() => choose(option)}
            highlighted={option.highlighted}
          />
        ))}
      </div>
    </div>
  );
}

function SelectorCard({
  icon,
  title,
  subtitle,
  onClick,
  highlighted,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
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
      <span className="text-base font-semibold" style={{ color: "var(--app-text-primary)" }}>
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
        Continuer →
      </span>
    </button>
  );
}
