// File: lib/dashboard/premiumDashboardAdapter.ts
// Role: adapte les KPI backend vers le contrat UI premium et expose les helpers purs (score/jauges/animation).
import type { CalculatedKpis } from "@/types/analysis";

// Ce contrat UI est volontairement minimal pour brancher le design premium
// sans exposer toute la structure KPI metier au composant de presentation.
export type PremiumKpis = {
  ca: number | null;
  tresorerie: number | null;
  ebe: number | null;
  healthScore: number | null;
  croissance: number | null;
  runway: number | null;
};

export type PremiumHealthState = {
  label: string;
  message: string;
  colorHex: string;
  severity: "excellent" | "warning" | "critical" | "neutral";
};

const DIAL_DEFAULT_RADIUS = 130;

// Mapping strict demande par le produit:
// ca -> kpis.ca, tresorerie -> kpis.disponibilites, etc.
export function toPremiumKpis(kpis: CalculatedKpis): PremiumKpis {
  return {
    ca: kpis.ca,
    tresorerie: kpis.disponibilites,
    ebe: kpis.ebe,
    healthScore: kpis.healthScore,
    croissance: kpis.tcam,
    runway: kpis.cashRunwayMonths
  };
}

// Le score pilote les messages et la couleur du cadran selon les seuils fixes.
export function getPremiumHealthState(score: number | null): PremiumHealthState {
  if (score === null) {
    return {
      label: "Indeterminee",
      message: "Donnees insuffisantes pour etablir la sante globale.",
      colorHex: "#8b8b93",
      severity: "neutral"
    };
  }

  if (score > 80) {
    return {
      label: "Excellente",
      message:
        "Structure financière robuste. La capacité d'autofinancement soutient le plan de croissance.",
      colorHex: "#10B981",
      severity: "excellent"
    };
  }

  if (score > 40) {
    return {
      label: "Sous Tension",
      message: "Tension detectee. Une surveillance rapprochee des encaissements est recommandee.",
      colorHex: "#F59E0B",
      severity: "warning"
    };
  }

  return {
    label: "Critique",
    message: "Alerte liquidité. Le risque de tension court terme est élevé.",
    colorHex: "#EF4444",
    severity: "critical"
  };
}

// Conversion score -> progression SVG (strokeDashoffset) avec clamp defensif.
export function computeHealthStrokeDashoffset(
  score: number | null,
  radius: number = DIAL_DEFAULT_RADIUS
): number {
  const circumference = 2 * Math.PI * radius;
  const normalized = score === null ? 0 : clamp(score, 0, 100);
  return circumference - (normalized / 100) * circumference;
}

// Cette fonction borne le compteur anime pour ne jamais depasser la cible.
export function interpolateAnimatedValue(from: number, to: number, progress: number): number {
  const easedProgress = clamp(progress, 0, 1);
  const eased = 1 - Math.pow(1 - easedProgress, 3);
  const raw = from + (to - from) * eased;

  if (to >= from) {
    return Math.min(raw, to);
  }

  return Math.max(raw, to);
}

// L'EBE est compare a un objectif UX configurable (50k par defaut).
export function computeEbeProgressPercent(ebe: number | null, target: number = 50000): number {
  if (ebe === null || target <= 0) {
    return 0;
  }
  return clamp((ebe / target) * 100, 0, 100);
}

// Helper utilitaire unique pour centraliser le comportement de clamp.
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
