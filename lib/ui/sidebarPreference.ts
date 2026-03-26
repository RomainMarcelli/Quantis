// File: lib/ui/sidebarPreference.ts
// Role: centralise la persistance de l'état d'affichage du menu latéral.

export const DASHBOARD_SIDEBAR_COLLAPSED_KEY = "quantis.dashboard.sidebar.collapsed";

export function readSidebarCollapsedPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(DASHBOARD_SIDEBAR_COLLAPSED_KEY) === "1";
}

export function writeSidebarCollapsedPreference(isCollapsed: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DASHBOARD_SIDEBAR_COLLAPSED_KEY, isCollapsed ? "1" : "0");
}

