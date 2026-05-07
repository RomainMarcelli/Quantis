// File: components/integrations/DataSourceToggle.tsx
// Role: toggle binaire vert/rouge "Active / Désactivée" pour activer une
// source de données depuis la page /documents.
//
// Cible visuelle : compact (~110 px de large), 28 px de hauteur,
// glassmorphism cohérent avec le reste de la page.
//
// 3 états :
//   - active (vert)        : source courante, clic désactive (toggle off)
//   - inactive (rouge)     : pas active, clic active
//   - disabled (gris)      : source non connectée — interaction bloquée
//                            (typiquement Bridge tant que pas de connexion)
//
// Pendant la mutation Firestore on affiche un mini spinner à la place de
// l'icône — empêche les double-clics et donne le feedback de progression.
"use client";

import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

type DataSourceToggleProps = {
  /** True = vert "Active", false = rouge "Désactivée". */
  isActive: boolean;
  /** Mutation à exécuter sur clic. Reçoit la nouvelle valeur attendue. */
  onToggle: (next: boolean) => void | Promise<void>;
  /** Désactive l'interaction (source non connectée, etc.). */
  disabled?: boolean;
  /** Titre tooltip (HTMLAttribute title). */
  title?: string;
  /** Label personnalisé (sinon "Active" / "Désactivée"). */
  label?: { active?: string; inactive?: string; disabled?: string };
  /** Override classes (positionnement dans la card). */
  className?: string;
};

const COLOR_ACTIVE = "#22C55E";
const COLOR_INACTIVE = "#EF4444";
const COLOR_DISABLED = "#6B7280";

export function DataSourceToggle({
  isActive,
  onToggle,
  disabled = false,
  title,
  label,
  className,
}: DataSourceToggleProps) {
  const [busy, setBusy] = useState(false);

  const labelText: string = disabled
    ? label?.disabled ?? "Indisponible"
    : isActive
      ? label?.active ?? "Active"
      : label?.inactive ?? "Désactivée";

  const color = disabled ? COLOR_DISABLED : isActive ? COLOR_ACTIVE : COLOR_INACTIVE;

  async function handleClick() {
    if (disabled || busy) return;
    setBusy(true);
    try {
      await onToggle(!isActive);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      title={title}
      aria-pressed={isActive}
      aria-disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
        disabled ? "cursor-not-allowed" : "cursor-pointer hover:opacity-90"
      } ${className ?? ""}`}
      style={{
        minWidth: 110,
        minHeight: 28,
        color,
        backgroundColor: "rgba(15, 15, 18, 0.85)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: `1px solid ${color}40`,
        boxShadow: disabled ? "none" : `0 0 0 1px ${color}20 inset`,
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Dot color={color} />
      )}
      <span>{labelText}</span>
    </button>
  );
}

function Dot({ color }: { color: string }): ReactNode {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: 9999,
        backgroundColor: color,
        boxShadow: `0 0 6px ${color}`,
      }}
    />
  );
}
