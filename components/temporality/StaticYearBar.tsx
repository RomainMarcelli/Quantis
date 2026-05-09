// File: components/temporality/StaticYearBar.tsx
// Role: barre "Exercice <année>" affichée dans la ligne 2 du AppHeader
// pour les sources statiques (PDF/Excel) en remplacement de la
// TemporalityBar dynamique. Brief 09/06/2026 : l'utilisateur doit
// pouvoir basculer entre exercices quand son dossier en contient
// plusieurs (ex: 2 liasses Excel pour 2023 et 2024).
//
// Visuel aligné sur la TemporalityBar (icône calendrier + label
// "Exercice" + select sobre) pour rester cohérent dans le bandeau.
"use client";

import { Calendar } from "lucide-react";

export type StaticYearOption = {
  value: string;
  label: string;
};

type Props = {
  options: StaticYearOption[];
  value: string;
  onChange: (next: string) => void;
};

export function StaticYearBar({ options, value, onChange }: Props) {
  // Cas d'un seul exercice disponible : on affiche uniquement le label
  // (badge non-interactif) — pas de dropdown trompeur avec une seule
  // option. Le label est cohérent avec ce que la TemporalityBar
  // afficherait pour une source dynamique.
  const single = options.length <= 1;
  const currentLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "—";

  return (
    <div
      className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs"
      style={{
        border: "1px solid var(--app-border)",
        backgroundColor: "var(--app-surface-soft)",
        color: "var(--app-text-secondary)",
      }}
    >
      <Calendar className="h-3.5 w-3.5" />
      <span
        className="font-medium uppercase tracking-[0.06em]"
        style={{ color: "var(--app-text-tertiary)" }}
      >
        Exercice
      </span>
      {single ? (
        <span
          className="font-semibold"
          style={{ color: "var(--app-text-primary)" }}
        >
          {currentLabel}
        </span>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md px-2 py-0.5 outline-none transition"
          style={{
            border: "1px solid var(--app-border)",
            backgroundColor: "var(--app-card-bg)",
            color: "var(--app-text-primary)",
          }}
          aria-label="Sélectionner l'exercice"
        >
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              style={{ backgroundColor: "var(--app-card-bg)", color: "var(--app-text-primary)" }}
            >
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
