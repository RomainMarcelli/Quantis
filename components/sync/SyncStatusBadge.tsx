// File: components/sync/SyncStatusBadge.tsx
// Role: badge "dernière synchronisation" pour les connexions comptables
// et bancaires. 5 états visuels (cf. brief MVP sync manuel) :
//   - récent      (< 1h)    : "à l'instant"          / text-tertiary
//   - quelques h  (< 24h)   : "il y a X heures"      / text-tertiary
//   - quelques j  (< 7j)    : "il y a X jours"       / text-secondary
//   - vieux       (≥ 7j)    : "il y a X jours"       / text-warning + ⚠
//   - failed                : "Échec de la dernière synchronisation" / text-danger + tooltip
//   - in_progress           : "Synchronisation en cours…"             / spinner
//
// Pas de dépendance npm ajoutée — formatage relatif via helper interne
// (date-fns n'est pas dans le repo, et le helper formatRelativeFrench
// existant en lib/source/sourceKind.ts est privé à ce module).
"use client";

import { AlertTriangle, AlertCircle, Loader2 } from "lucide-react";

export type SyncStatus =
  | "success"
  | "failed"
  | "in_progress"
  | "partial"
  | "never";

type SyncStatusBadgeProps = {
  /** ISO string ou null si jamais sync. */
  lastSyncedAt: string | null;
  /** Statut du dernier sync. "never" → message d'invitation. */
  lastSyncStatus: SyncStatus;
  /** Message d'erreur abrégé pour le tooltip (état failed uniquement). */
  lastSyncError?: string | null;
  /** Date de référence injectable — facilite les tests déterministes. */
  now?: Date;
  className?: string;
};

const ALERT_THRESHOLD_DAYS = 7;

export function SyncStatusBadge({
  lastSyncedAt,
  lastSyncStatus,
  lastSyncError = null,
  now,
  className,
}: SyncStatusBadgeProps) {
  const baseClass = `inline-flex items-center gap-1.5 text-xs font-medium ${className ?? ""}`;

  if (lastSyncStatus === "in_progress") {
    return (
      <span
        className={baseClass}
        style={{ color: "var(--app-text-tertiary)" }}
        data-sync-state="in_progress"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Synchronisation en cours…
      </span>
    );
  }

  if (lastSyncStatus === "failed") {
    const tooltip = (lastSyncError ?? "").slice(0, 200);
    return (
      <span
        className={baseClass}
        style={{ color: "var(--app-danger)" }}
        data-sync-state="failed"
        title={tooltip || undefined}
        aria-label={`Échec de synchronisation${tooltip ? ` : ${tooltip}` : ""}`}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        Échec de la dernière synchronisation
      </span>
    );
  }

  if (lastSyncStatus === "never" || !lastSyncedAt) {
    return (
      <span
        className={baseClass}
        style={{ color: "var(--app-text-tertiary)" }}
        data-sync-state="never"
      >
        Jamais synchronisé
      </span>
    );
  }

  const ageMs = (now ?? new Date()).getTime() - new Date(lastSyncedAt).getTime();
  const formatted = formatAge(ageMs);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  // ≥ 7 jours → warning (jaune + icône triangle).
  if (ageDays >= ALERT_THRESHOLD_DAYS) {
    return (
      <span
        className={baseClass}
        style={{ color: "var(--app-warning)" }}
        data-sync-state="stale"
        title="Données potentiellement périmées — pensez à synchroniser."
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Synchronisé {formatted}
      </span>
    );
  }

  // < 24h → text-tertiary (info discrète) ; < 7j → text-secondary (neutre).
  const color =
    ageMs < 24 * 60 * 60 * 1000 ? "var(--app-text-tertiary)" : "var(--app-text-secondary)";
  const stateAttr = ageMs < 60 * 60 * 1000 ? "fresh" : ageMs < 24 * 60 * 60 * 1000 ? "recent" : "ok";
  return (
    <span className={baseClass} style={{ color }} data-sync-state={stateAttr}>
      Synchronisé {formatted}
    </span>
  );
}

/**
 * Format le delta âge en chaîne fr-FR :
 *   < 1 min  → "à l'instant"
 *   < 1 h    → "il y a X minutes"
 *   < 24 h   → "il y a X heures"
 *   < 7 j    → "il y a X jours"
 *   ≥ 7 j    → "il y a X jours" (le badge passera en warning visuel)
 *
 * Exporté pour les tests unitaires.
 */
export function formatAge(ageMs: number): string {
  if (ageMs < 60 * 1000) return "à l'instant";
  const minutes = Math.floor(ageMs / (60 * 1000));
  if (minutes < 60) {
    return minutes === 1 ? "il y a 1 minute" : `il y a ${minutes} minutes`;
  }
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  if (hours < 24) {
    return hours === 1 ? "il y a 1 heure" : `il y a ${hours} heures`;
  }
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  return days === 1 ? "il y a 1 jour" : `il y a ${days} jours`;
}
