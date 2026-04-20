// File: components/ui/PremiumStateCard.tsx
// Role: etat UI premium unifie (loading, empty, error, info) avec actions contextualisees.
"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CircleAlert, Inbox, Sparkles } from "lucide-react";
import { PremiumLoader } from "@/components/ui/PremiumLoader";

type PremiumStateVariant = "loading" | "empty" | "error" | "info";
type PremiumStateTone = "gold" | "neutral" | "danger";

type PremiumStateAction = {
  label: string;
  onClick: () => void;
  tone?: PremiumStateTone;
  icon?: ReactNode;
  disabled?: boolean;
};

type PremiumStateCardProps = {
  variant: PremiumStateVariant;
  title: string;
  description?: string;
  className?: string;
  viewportCentered?: boolean;
  compact?: boolean;
  actions?: PremiumStateAction[];
  loadingLabel?: string;
  loaderIntensity?: "subtle" | "balanced" | "wow";
};

export function PremiumStateCard({
  variant,
  title,
  description,
  className,
  viewportCentered = false,
  compact = false,
  actions = [],
  loadingLabel,
  loaderIntensity
}: PremiumStateCardProps) {
  const icon = resolveVariantIcon(variant);
  const isLoading = variant === "loading";
  const spacingClass = compact ? "p-5" : "p-8";
  const titleClass = compact ? "text-base" : "text-lg";
  const resolvedLoaderIntensity = loaderIntensity ?? (compact ? "subtle" : "balanced");

  const card = (
    <section
      className={`precision-card quantis-state-card rounded-2xl text-center ${spacingClass} ${className ?? ""}`}
      aria-busy={isLoading}
      role={variant === "error" ? "alert" : "status"}
    >
      <div className="quantis-state-card__layer" aria-hidden="true" />
      <div className="relative z-[1] mx-auto flex max-w-xl flex-col items-center">
        {isLoading ? (
          <PremiumLoader
            size={compact ? "sm" : "md"}
            intensity={resolvedLoaderIntensity}
            label={loadingLabel ?? "Traitement en cours..."}
            className="mb-4"
          />
        ) : (
          <span className={`quantis-state-card__icon ${variant === "error" ? "is-error" : ""}`} aria-hidden="true">
            {icon}
          </span>
        )}

        <h2 className={`${titleClass} font-semibold text-white`}>{title}</h2>
        {description ? <p className="mt-2 text-sm text-white/70">{description}</p> : null}

        {actions.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {actions.map((action, index) => (
              <button
                key={`${action.label}-${index}`}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={resolveActionClass(action.tone ?? "neutral")}
              >
                {action.icon ? <span className="shrink-0">{action.icon}</span> : null}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );

  if (!viewportCentered) {
    return card;
  }

  return (
    <div className="flex min-h-[68vh] w-full items-center justify-center">
      {card}
    </div>
  );
}

function resolveVariantIcon(variant: PremiumStateVariant): ReactNode {
  if (variant === "empty") {
    return <Inbox className="h-5 w-5" />;
  }
  if (variant === "error") {
    return <AlertTriangle className="h-5 w-5" />;
  }
  if (variant === "info") {
    return <CircleAlert className="h-5 w-5" />;
  }
  return <Sparkles className="h-5 w-5" />;
}

function resolveActionClass(tone: PremiumStateTone): string {
  const base =
    "inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55";

  if (tone === "gold") {
    return `${base} btn-gold-premium`;
  }

  if (tone === "danger") {
    return `${base} border-rose-400/35 bg-rose-500/12 text-rose-200 hover:bg-rose-500/20`;
  }

  return `${base} border-white/15 bg-white/5 text-white/85 hover:bg-white/10`;
}
