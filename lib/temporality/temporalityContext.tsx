// File: lib/temporality/temporalityContext.tsx
// Role: contexte global de filtrage temporel — granularité (jour/semaine/mois/trimestre/année)
// + période sélectionnée (dates de début/fin). Persistant via localStorage pour survivre
// aux navigations. Utilisé par les barres de filtre, les graphes et les recompositions de KPI.
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Granularity = "day" | "week" | "month" | "quarter" | "year";

export const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "Jour",
  week: "Semaine",
  month: "Mois",
  quarter: "Trimestre",
  year: "Année",
};

export type TemporalityState = {
  granularity: Granularity;
  // Période courante (bornes ISO YYYY-MM-DD).
  periodStart: string;
  periodEnd: string;
  // Libellé lisible (ex. "Avril 2026", "Q1 2026", "Semaine 16 2026").
  periodLabel: string;
};

type TemporalityContextValue = TemporalityState & {
  setGranularity: (granularity: Granularity) => void;
  goPrevious: () => void;
  goNext: () => void;
  goToCurrent: () => void;
};

// v2 (2026-04-29) : bump après changement du défaut "12 derniers mois". Les
// utilisateurs qui avaient cliqué "Année" + "Suivant" avant le fix gardaient
// un periodStart en 2027 dans leur localStorage v1, ce qui leur affichait
// "Année 2027" au démarrage. Bump = invalide tous les anciens états sans avoir
// à demander à l'utilisateur de vider son localStorage manuellement.
const STORAGE_KEY = "quantis.temporality.v2";

const TemporalityContext = createContext<TemporalityContextValue | null>(null);

// ─── Helpers de calcul de période ───────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function startOfIsoWeek(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  return monday;
}

function isoWeekNumber(d: Date): { isoYear: number; week: number } {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  const isoYear = target.getUTCFullYear();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const week = 1 + Math.round((firstThursday - target.valueOf()) / 604_800_000);
  return { isoYear, week };
}

const MONTH_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/**
 * Construit la période "année glissante 12 derniers mois" se terminant à `date`.
 * Conserve `granularity: "year"` pour rester compatible avec le picker (un clic
 * sur "Année" rebascule sur l'année calendaire via `setGranularity`), mais le
 * libellé et les bornes initiales reflètent le rolling.
 */
export function buildRolling12MonthsFromDate(date: Date): TemporalityState {
  const ref = startOfDay(date);
  const end = endOfDay(ref);
  // 12 derniers mois pleins se terminant aujourd'hui (incl.). Ex. si date=29/04/2026,
  // période = 30/04/2025 → 29/04/2026.
  const start = new Date(Date.UTC(ref.getUTCFullYear() - 1, ref.getUTCMonth(), ref.getUTCDate() + 1));
  return {
    granularity: "year",
    periodStart: toIsoDate(start),
    periodEnd: toIsoDate(end),
    periodLabel: "12 derniers mois",
  };
}

export function buildPeriodFromDate(date: Date, granularity: Granularity): TemporalityState {
  const ref = startOfDay(date);

  switch (granularity) {
    case "day": {
      const start = ref;
      const end = endOfDay(ref);
      return {
        granularity,
        periodStart: toIsoDate(start),
        periodEnd: toIsoDate(end),
        periodLabel: `${pad(ref.getUTCDate())} ${MONTH_LABELS[ref.getUTCMonth()]} ${ref.getUTCFullYear()}`,
      };
    }
    case "week": {
      const monday = startOfIsoWeek(ref);
      const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6, 23, 59, 59, 999));
      const { isoYear, week } = isoWeekNumber(ref);
      return {
        granularity,
        periodStart: toIsoDate(monday),
        periodEnd: toIsoDate(sunday),
        periodLabel: `Semaine ${pad(week)} ${isoYear}`,
      };
    }
    case "month": {
      const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
      const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      return {
        granularity,
        periodStart: toIsoDate(start),
        periodEnd: toIsoDate(end),
        periodLabel: `${MONTH_LABELS[ref.getUTCMonth()]} ${ref.getUTCFullYear()}`,
      };
    }
    case "quarter": {
      const q = Math.floor(ref.getUTCMonth() / 3);
      const start = new Date(Date.UTC(ref.getUTCFullYear(), q * 3, 1));
      const end = new Date(Date.UTC(ref.getUTCFullYear(), q * 3 + 3, 0, 23, 59, 59, 999));
      return {
        granularity,
        periodStart: toIsoDate(start),
        periodEnd: toIsoDate(end),
        periodLabel: `Trimestre ${q + 1} ${ref.getUTCFullYear()}`,
      };
    }
    case "year": {
      const start = new Date(Date.UTC(ref.getUTCFullYear(), 0, 1));
      const end = new Date(Date.UTC(ref.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
      return {
        granularity,
        periodStart: toIsoDate(start),
        periodEnd: toIsoDate(end),
        periodLabel: `Année ${ref.getUTCFullYear()}`,
      };
    }
  }
}

function shiftPeriod(state: TemporalityState, direction: -1 | 1): TemporalityState {
  // Repère = milieu de la période courante. On décale d'une unité de granularité.
  const start = new Date(`${state.periodStart}T12:00:00.000Z`);
  let next: Date;
  switch (state.granularity) {
    case "day":
      next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + direction));
      break;
    case "week":
      next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7 * direction));
      break;
    case "month":
      next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + direction, 15));
      break;
    case "quarter":
      next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3 * direction, 15));
      break;
    case "year":
      next = new Date(Date.UTC(start.getUTCFullYear() + direction, 6, 1));
      break;
  }
  return buildPeriodFromDate(next, state.granularity);
}

// ─── Persistance ────────────────────────────────────────────────────────────

type StoredState = { granularity: Granularity; periodStart: string };

function loadStored(): StoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    const validG: Granularity[] = ["day", "week", "month", "quarter", "year"];
    if (!validG.includes(parsed.granularity)) return null;
    if (typeof parsed.periodStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.periodStart)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(state: TemporalityState) {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredState = { granularity: state.granularity, periodStart: state.periodStart };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* swallow — pas critique */
  }
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function TemporalityProvider({ children }: { children: ReactNode }) {
  // Initial : "12 derniers mois" glissants (couvre l'horizon utile pour un dashboard
  // financier dès l'arrivée). Surchargé par localStorage côté client si présent.
  const [state, setState] = useState<TemporalityState>(() => buildRolling12MonthsFromDate(new Date()));

  // Hydratation depuis localStorage côté client (évite mismatch SSR).
  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      const ref = new Date(`${stored.periodStart}T12:00:00.000Z`);
      setState(buildPeriodFromDate(ref, stored.granularity));
    }
  }, []);

  useEffect(() => {
    saveStored(state);
  }, [state]);

  const setGranularity = useCallback((granularity: Granularity) => {
    setState((prev) => {
      // Conserver le milieu de la période courante comme repère.
      const ref = new Date(`${prev.periodStart}T12:00:00.000Z`);
      return buildPeriodFromDate(ref, granularity);
    });
  }, []);

  const goPrevious = useCallback(() => setState((prev) => shiftPeriod(prev, -1)), []);
  const goNext = useCallback(() => setState((prev) => shiftPeriod(prev, +1)), []);
  const goToCurrent = useCallback(() => {
    setState((prev) => buildPeriodFromDate(new Date(), prev.granularity));
  }, []);

  const value = useMemo<TemporalityContextValue>(
    () => ({ ...state, setGranularity, goPrevious, goNext, goToCurrent }),
    [state, setGranularity, goPrevious, goNext, goToCurrent]
  );

  return <TemporalityContext.Provider value={value}>{children}</TemporalityContext.Provider>;
}

export function useTemporality(): TemporalityContextValue {
  const ctx = useContext(TemporalityContext);
  if (!ctx) {
    throw new Error("useTemporality must be used inside <TemporalityProvider>");
  }
  return ctx;
}

// Variante safe : utilisable hors provider (renvoie null).
export function useTemporalityOptional(): TemporalityContextValue | null {
  return useContext(TemporalityContext);
}
