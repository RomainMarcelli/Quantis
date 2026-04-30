// File: components/analysis/SourceBadge.tsx
// Role: badge visuel qui indique d'où viennent les données affichées dans le
// dashboard. Deux états :
//   - dynamique (Pennylane / MyUnisoft / Odoo / FEC) : "Données live · <provider>
//     · sync il y a <relatif>"
//   - statique (upload PDF) : "Document statique · <date du document>"
//
// Conçu pour s'insérer dans le user bandeau des pages /synthese et /analysis.
"use client";

import { Activity, FileText, Lock } from "lucide-react";
import type { SourceMetadata } from "@/types/connectors";

const PROVIDER_LABELS: Record<string, string> = {
  pennylane: "Pennylane",
  myunisoft: "MyUnisoft",
  odoo: "Odoo",
  chift: "Chift",
  bridge: "Bridge",
  fec: "Import FEC",
  upload: "Upload manuel",
};

type SourceBadgeProps = {
  /** Métadonnées de source de l'analyse (peut être null pour les anciennes analyses). */
  sourceMetadata: SourceMetadata | null | undefined;
  /** Date de création de l'analyse — fallback pour le mode statique. */
  analysisCreatedAt: string;
};

export function SourceBadge({ sourceMetadata, analysisCreatedAt }: SourceBadgeProps) {
  const meta = sourceMetadata;

  // Dynamique : indicateur live + provider + ancienneté du dernier sync.
  if (meta?.type === "dynamic") {
    const providerLabel = PROVIDER_LABELS[meta.provider] ?? meta.provider;
    const syncedRelative = formatRelativeSince(meta.syncedAt);
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300"
        title={`Données dynamiques — provider ${providerLabel}, dernière synchro le ${formatAbsolute(
          meta.syncedAt
        )}`}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
        <Activity className="h-3 w-3" />
        Données live · {providerLabel} · sync {syncedRelative}
      </span>
    );
  }

  // Statique : pas de sourceMetadata (legacy) ou sourceMetadata.type === "static".
  // On affiche la date de référence du document = période de fin si fournie,
  // sinon `analysisCreatedAt`.
  const documentDate = meta?.periodEnd ?? analysisCreatedAt;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/65"
      title={`Document statique — analyse du ${formatAbsolute(analysisCreatedAt)}`}
    >
      <Lock className="h-3 w-3 text-white/50" />
      <FileText className="h-3 w-3" />
      Document statique · {formatShortDate(documentDate)}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * "il y a 3 min", "il y a 2h", "il y a 4j", "il y a 2 sem.", etc.
 * Choisit l'unité la plus pertinente. Pour > 30 jours, on bascule sur la date courte.
 */
function formatRelativeSince(iso: string): string {
  const target = new Date(iso);
  const now = Date.now();
  if (Number.isNaN(target.getTime())) return iso;
  const deltaMs = Math.max(0, now - target.getTime());
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  if (days < 30) return `il y a ${Math.floor(days / 7)} sem.`;
  return `le ${formatShortDate(iso)}`;
}
