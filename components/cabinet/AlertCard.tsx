// File: components/cabinet/AlertCard.tsx
// Role: carte d'alerte dans la section "À traiter" du portefeuille cabinet.
// Affiche le nom de l'entreprise, l'intitulé de l'alerte, sa description
// contextuelle, et un CTA déterminé par la règle (cf. alert-rules.ts).
// Sévérité urgent (rouge) ou watch (ambre).
"use client";

import { useRouter } from "next/navigation";
import type { AlertHit } from "@/lib/config/alert-rules";

export function AlertCard({ hit }: { hit: AlertHit }) {
  const router = useRouter();
  const { rule, company } = hit;

  const colors =
    rule.severity === "urgent"
      ? {
          border: "rgb(var(--app-danger-rgb, 239 68 68) / 30%)",
          bg: "rgb(var(--app-danger-rgb, 239 68 68) / 6%)",
          accent: "var(--app-danger, #EF4444)",
        }
      : {
          border: "rgb(245 158 11 / 30%)",
          bg: "rgb(245 158 11 / 6%)",
          accent: "#F59E0B",
        };

  return (
    <div
      className="flex items-center gap-4 rounded-lg px-5 py-3.5 transition"
      style={{ border: `1px solid ${colors.border}`, backgroundColor: colors.bg }}
    >
      <span
        aria-hidden
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: colors.accent }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--app-text-primary)" }}
          >
            {company.name}
          </span>
          <span className="text-xs font-medium" style={{ color: colors.accent }}>
            {rule.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>
          {rule.description(company)}
        </p>
      </div>

      <button
        type="button"
        onClick={() => router.push(rule.cta.href(company))}
        className="flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition"
        style={{
          border: "1px solid var(--app-border)",
          color: "var(--app-text-secondary)",
          backgroundColor: "transparent",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "rgb(var(--app-brand-gold-deep-rgb) / 60%)";
          e.currentTarget.style.color = "var(--app-brand-gold-deep)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--app-border)";
          e.currentTarget.style.color = "var(--app-text-secondary)";
        }}
      >
        {rule.cta.label}
      </button>
    </div>
  );
}
