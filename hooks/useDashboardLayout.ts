// File: hooks/useDashboardLayout.ts
// Role: charge un layout depuis Firestore au mount, expose une API mutation
// (addWidget / removeWidget / reorderWidgets / updateWidget) avec save
// debouncé Firestore. Si pas de layout existant → fallback sur le default.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadDashboardLayout,
  saveDashboardLayout
} from "@/services/dashboardLayoutStore";
import type {
  CustomChartConfig,
  DashboardLayout,
  WidgetInstance,
  WidgetSize,
  WidgetVizType,
  WidgetWidth
} from "@/types/dashboard";

const SAVE_DEBOUNCE_MS = 800;

type UseDashboardLayoutOptions = {
  userId: string | null;
  layoutId: string;
  defaultLayout: DashboardLayout;
};

export type UseDashboardLayoutResult = {
  layout: DashboardLayout;
  isLoading: boolean;
  isSaving: boolean;
  addWidget: (
    kpiId: string,
    vizType: WidgetVizType,
    size?: WidgetWidth,
    customConfig?: CustomChartConfig,
    height?: WidgetSize,
  ) => void;
  removeWidget: (instanceId: string) => void;
  reorderWidgets: (orderedIds: string[]) => void;
  updateWidget: (instanceId: string, patch: Partial<WidgetInstance>) => void;
  resetToDefault: () => void;
};

export function useDashboardLayout({
  userId,
  layoutId,
  defaultLayout
}: UseDashboardLayoutOptions): UseDashboardLayoutResult {
  const [layout, setLayout] = useState<DashboardLayout>(defaultLayout);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(userId));
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Garde la référence du dernier layout sauvegardé pour éviter de redéclencher
  // une écriture Firestore sur un layout identique au précédent.
  const lastSavedSerialized = useRef<string | null>(null);

  // Refs miroir du state — utilisées par flushSave (sur unmount) car la
  // cleanup synchrone de useEffect ne peut pas lire le state React final
  // via closure si on ne les met pas à jour à chaque render.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  // ATTENTION : `defaultLayout` n'est PAS dans la dep array du load effect.
  // Plusieurs callers (DashboardFinancialTestContent, AnalysisDetailView…)
  // recréent l'objet à chaque render — l'inclure dans les deps ferait
  // refire le load à chaque mutation, qui écraserait alors la modif locale
  // par le contenu Firestore (race condition perdue côté UI).
  // On le lit via ref au lieu de capture closure.
  const defaultLayoutRef = useRef(defaultLayout);
  defaultLayoutRef.current = defaultLayout;

  // Chargement initial — déclenché uniquement quand userId ou layoutId change.
  useEffect(() => {
    if (!userId) {
      setLayout(defaultLayoutRef.current);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    loadDashboardLayout(userId, layoutId)
      .then((existing) => {
        if (cancelled) return;
        const next = existing ?? defaultLayoutRef.current;
        setLayout(next);
        lastSavedSerialized.current = JSON.stringify(next.widgets);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[useDashboardLayout] load failed", { layoutId, err });
        setLayout(defaultLayoutRef.current);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, layoutId]);

  // Auto-save debouncé sur changement de widgets.
  // ATTENTION : pas de cleanup qui clear le timeout — sinon chaque render
  // (= chaque mutation) annulerait le save en cours et on n'écrirait
  // jamais. Le clear se fait UNIQUEMENT en interne avant de re-poser un
  // nouveau timeout (mutations rapides debouncées). Le flush à l'unmount
  // est géré par l'effet dédié plus bas.
  useEffect(() => {
    if (!userId || isLoading) return;
    const serialized = JSON.stringify(layout.widgets);
    if (serialized === lastSavedSerialized.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      saveTimeoutRef.current = null;
      setIsSaving(true);
      try {
        await saveDashboardLayout(userId, layout);
        lastSavedSerialized.current = serialized;
      } catch (err) {
        // Cause typique : règles Firestore non déployées qui bloquent
        // l'écriture sur users/{uid}/dashboards/* (PERMISSION_DENIED).
        // On log explicitement pour que l'utilisateur voie le pb dans
        // la console plutôt que de silencer.
        console.error("[useDashboardLayout] auto-save failed", err);
      } finally {
        setIsSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [userId, layout, isLoading]);

  // Flush du save pendant à l'unmount (changement de page, démontage du
  // dashboard). Sans ça, une modif faite dans les 800ms avant navigation
  // serait perdue car le timeout debouncé n'aurait jamais le temps de
  // tirer. On dispatche un save fire-and-forget via les refs courantes.
  //
  // GARDE-FOU CRITIQUE : on ne flushe QUE si le load initial s'est terminé
  // (`lastSavedSerialized.current !== null`). Sinon : si Fast Refresh ou
  // une remount cascade fait démonter le hook avant que son load ne se
  // termine, on flusherait le DEFAULT_LAYOUT (état initial) et on
  // ÉCRASERAIT les vraies données Firestore. Ce bug a coûté plusieurs
  // sessions de debug — ne pas retirer ce check.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const uid = userIdRef.current;
      if (!uid) return;
      // Pas de load complet → on n'a aucune référence "dernier état
      // Firestore". Tout flush ici écraserait le serveur avec la valeur
      // initiale (= default). On skip.
      if (lastSavedSerialized.current === null) return;
      const serialized = JSON.stringify(layoutRef.current.widgets);
      if (serialized === lastSavedSerialized.current) return;
      // Fire-and-forget — le composant est en train d'être démonté, on
      // ne peut plus await ni mettre à jour de state. La promesse est
      // trackée dans `pendingSaves` côté store : si un load remonte avant
      // la fin de l'écriture, il attendra automatiquement.
      saveDashboardLayout(uid, layoutRef.current).catch((err) => {
        console.error("[useDashboardLayout] flush-on-unmount save failed", err);
      });
      lastSavedSerialized.current = serialized;
    };
  }, []);

  const addWidget = useCallback(
    (
      kpiId: string,
      vizType: WidgetVizType,
      size: WidgetWidth = "M",
      customConfig?: CustomChartConfig,
      height?: WidgetSize,
    ) => {
      setLayout((prev) => ({
        ...prev,
        widgets: [
          ...prev.widgets,
          {
            id: generateWidgetId(),
            kpiId,
            vizType,
            size,
            ...(height ? { height } : {}),
            ...(customConfig ? { customConfig } : {}),
          },
        ],
      }));
    },
    []
  );

  const removeWidget = useCallback((instanceId: string) => {
    setLayout((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((w) => w.id !== instanceId)
    }));
  }, []);

  const reorderWidgets = useCallback((orderedIds: string[]) => {
    setLayout((prev) => {
      const byId = new Map(prev.widgets.map((w) => [w.id, w]));
      const next: WidgetInstance[] = [];
      for (const id of orderedIds) {
        const w = byId.get(id);
        if (w) next.push(w);
      }
      return { ...prev, widgets: next };
    });
  }, []);

  const updateWidget = useCallback(
    (instanceId: string, patch: Partial<WidgetInstance>) => {
      setLayout((prev) => ({
        ...prev,
        widgets: prev.widgets.map((w) =>
          w.id === instanceId ? { ...w, ...patch } : w
        )
      }));
    },
    []
  );

  const resetToDefault = useCallback(() => {
    setLayout(defaultLayout);
  }, [defaultLayout]);

  return {
    layout,
    isLoading,
    isSaving,
    addWidget,
    removeWidget,
    reorderWidgets,
    updateWidget,
    resetToDefault
  };
}

// ID stable basé sur crypto.randomUUID si dispo (évergreen browsers + Node 19+).
// Fallback timestamp+random pour les navigateurs anciens — accepté V1.
function generateWidgetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
