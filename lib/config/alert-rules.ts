// File: lib/config/alert-rules.ts
// Role: catalogue des règles d'alerte évaluées sur le portefeuille cabinet.
// Centralisé pour pouvoir enrichir les règles sans toucher au composant
// d'affichage. Chaque règle porte sa propre condition (`check`), son
// libellé, son CTA et un flag `enabled` pour activation/désactivation.
//
// Quand l'agent IA P5 sera prêt, `check` pourra appeler une route API qui
// renvoie un score — la signature reste compatible.

import { ROUTES } from "./routes";

export type AlertSeverity = "urgent" | "watch";

/**
 * Forme attendue par les règles — aligné sur le DTO renvoyé par
 * /api/cabinet/portefeuille pour rester compatible avec le composant
 * PortfolioTable et AlertCard sans transformation intermédiaire.
 */
export interface AlertableCompany {
  companyId: string;
  name: string;
  source?: string | null;
  lastSyncedAt?: string | null;
  kpis?: {
    ca?: number | null;
    tresorerieNette?: number | null;
    ebitda?: number | null;
    resultatNet?: number | null;
    vyzorScore?: number | null;
  } | null;
}

export interface AlertRule {
  id: string;
  severity: AlertSeverity;
  label: string;
  description: (company: AlertableCompany) => string;
  check: (company: AlertableCompany) => boolean;
  cta: {
    label: string;
    href: (company: AlertableCompany) => string;
  };
  enabled: boolean;
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function formatEUR(n: number | null | undefined): string {
  if (typeof n !== "number") return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)} K€`;
  return `${Math.round(n)} €`;
}

export const ALERT_RULES: AlertRule[] = [
  {
    id: "treso_negative",
    severity: "urgent",
    label: "Trésorerie négative",
    description: (c) => `Trésorerie nette : ${formatEUR(c.kpis?.tresorerieNette)}`,
    check: (c) =>
      typeof c.kpis?.tresorerieNette === "number" && c.kpis.tresorerieNette < 0,
    cta: {
      label: "Voir le dossier",
      href: (c) => ROUTES.CABINET_DOSSIER(c.companyId),
    },
    enabled: true,
  },
  {
    id: "result_negative",
    severity: "watch",
    label: "Résultat net négatif",
    description: (c) => `Résultat net : ${formatEUR(c.kpis?.resultatNet)}`,
    // Ne déclenche pas si la tréso est déjà négative — on évite le doublon
    // d'alertes sur la même entreprise.
    check: (c) => {
      const rn = c.kpis?.resultatNet;
      const treso = c.kpis?.tresorerieNette;
      const tresoNeg = typeof treso === "number" && treso < 0;
      return typeof rn === "number" && rn < 0 && !tresoNeg;
    },
    cta: {
      label: "Préparer une recommandation",
      href: (c) => ROUTES.CABINET_DOSSIER(c.companyId),
    },
    enabled: true,
  },
  {
    id: "sync_stale",
    severity: "watch",
    label: "Données non synchronisées",
    description: (c) => {
      const days = daysSince(c.lastSyncedAt);
      if (days === Infinity) return "Jamais synchronisé";
      return `Dernière sync : il y a ${days} jour${days > 1 ? "s" : ""}`;
    },
    check: (c) => {
      // Skip si la source est manuelle / fec / static_file — pas de notion
      // de sync pour les uploads ponctuels (l'alerte n'a pas de sens).
      const src = c.source ?? "";
      const isAutoSync = src === "pennylane_oauth" || src === "myu";
      if (!isAutoSync) return false;
      return daysSince(c.lastSyncedAt) >= 14;
    },
    cta: {
      label: "Resynchroniser",
      href: (c) => ROUTES.CABINET_DOSSIER(c.companyId),
    },
    enabled: true,
  },
];

export const getEnabledAlertRules = (): AlertRule[] =>
  ALERT_RULES.filter((r) => r.enabled);

export interface AlertHit {
  rule: AlertRule;
  company: AlertableCompany;
}

export function evaluateAlerts(companies: AlertableCompany[]): AlertHit[] {
  const hits: AlertHit[] = [];
  for (const company of companies) {
    for (const rule of getEnabledAlertRules()) {
      if (rule.check(company)) hits.push({ rule, company });
    }
  }
  return hits;
}

/** Priorité : urgent d'abord, puis watch. Stable dans l'ordre des companies. */
export function sortAlertsBySeverity(hits: AlertHit[]): AlertHit[] {
  return [...hits].sort((a, b) => {
    if (a.rule.severity === b.rule.severity) return 0;
    return a.rule.severity === "urgent" ? -1 : 1;
  });
}
