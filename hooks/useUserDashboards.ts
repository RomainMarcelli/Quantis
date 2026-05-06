// File: hooks/useUserDashboards.ts
// Role: charge la liste des dashboards custom de l'utilisateur (Phase 4) et
// expose une API CRUD : createDashboard / deleteDashboard / renameDashboard.
//
// Filtre les layouts "système" (synthese, dashboard:*) — ne renvoie que les
// dashboards créés explicitement par l'utilisateur (id préfixé "custom:").
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteDashboardLayout,
  listUserDashboardLayouts,
  renameDashboardLayout,
  saveDashboardLayout
} from "@/services/dashboardLayoutStore";
import type { DashboardLayout } from "@/types/dashboard";

export type CustomDashboardSummary = {
  id: string;
  name: string;
};

const CUSTOM_PREFIX = "custom:";

function isCustomLayout(layout: DashboardLayout): boolean {
  return layout.id.startsWith(CUSTOM_PREFIX);
}

function generateCustomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${CUSTOM_PREFIX}${crypto.randomUUID()}`;
  }
  return `${CUSTOM_PREFIX}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type UseUserDashboardsResult = {
  dashboards: CustomDashboardSummary[];
  isLoading: boolean;
  createDashboard: (name: string) => Promise<string | null>;
  renameDashboard: (id: string, newName: string) => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;
};

export function useUserDashboards(userId: string | null): UseUserDashboardsResult {
  // State unifié : on conserve le `userId` ayant alimenté la liste pour
  // pouvoir détecter un changement pendant le render et reset proprement
  // sans avoir à appeler setState dans un useEffect (interdit par la règle
  // React 19 set-state-in-effect).
  const [state, setState] = useState<{
    userId: string | null;
    dashboards: CustomDashboardSummary[];
    isLoading: boolean;
  }>(() => ({
    userId,
    dashboards: [],
    isLoading: Boolean(userId)
  }));

  // Reset synchrone pendant le render quand userId change (login / logout /
  // changement d'identité). Pattern recommandé React 19 : "derived state
  // during render" — React détecte que le state setter est appelé pendant
  // le render et planifie un seul re-render combiné.
  if (state.userId !== userId) {
    setState({ userId, dashboards: [], isLoading: Boolean(userId) });
  }

  const dashboards = state.dashboards;
  const isLoading = state.isLoading;

  // Chargement initial — uniquement les layouts user-créés (préfixe `custom:`).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listUserDashboardLayouts(userId)
      .then((layouts) => {
        if (cancelled) return;
        const customs = layouts
          .filter(isCustomLayout)
          .map((l) => ({ id: l.id, name: l.name ?? "Dashboard sans nom" }));
        setState((s) => (s.userId === userId ? { ...s, dashboards: customs, isLoading: false } : s));
      })
      .catch(() => {
        if (cancelled) return;
        setState((s) => (s.userId === userId ? { ...s, dashboards: [], isLoading: false } : s));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Helper interne pour mettre à jour la liste des dashboards (sans toucher userId/isLoading).
  function setDashboards(updater: (prev: CustomDashboardSummary[]) => CustomDashboardSummary[]) {
    setState((s) => ({ ...s, dashboards: updater(s.dashboards) }));
  }

  const createDashboard = useCallback(
    async (name: string): Promise<string | null> => {
      if (!userId) {
        console.warn("[useUserDashboards] createDashboard appelé sans userId — utilisateur non connecté ?");
        return null;
      }
      const trimmed = name.trim();
      if (!trimmed) return null;

      const id = generateCustomId();
      const layout: DashboardLayout = {
        id,
        name: trimmed,
        widgets: []
      };
      try {
        await saveDashboardLayout(userId, layout);
        setDashboards((prev) => [...prev, { id, name: trimmed }]);
        return id;
      } catch (err) {
        // Cause typique : Firestore rules bloquent l'écriture sur
        // users/{uid}/dashboards/* — vérifier que les rules ont été déployées
        // (firebase deploy --only firestore:rules).
        console.error("[useUserDashboards] createDashboard a échoué", err);
        return null;
      }
    },
    [userId]
  );

  const renameDashboard = useCallback(
    async (id: string, newName: string): Promise<void> => {
      if (!userId) return;
      const trimmed = newName.trim();
      if (!trimmed) return;
      try {
        await renameDashboardLayout(userId, id, trimmed);
        setDashboards((prev) => prev.map((d) => (d.id === id ? { ...d, name: trimmed } : d)));
      } catch (err) {
        console.error("[useUserDashboards] renameDashboard a échoué", err);
      }
    },
    [userId]
  );

  const deleteDashboard = useCallback(
    async (id: string): Promise<void> => {
      if (!userId) return;
      try {
        await deleteDashboardLayout(userId, id);
        setDashboards((prev) => prev.filter((d) => d.id !== id));
      } catch (err) {
        console.error("[useUserDashboards] deleteDashboard a échoué", err);
      }
    },
    [userId]
  );

  return { dashboards, isLoading, createDashboard, renameDashboard, deleteDashboard };
}
