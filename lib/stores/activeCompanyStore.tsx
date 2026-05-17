// File: lib/stores/activeCompanyStore.tsx
// Role: store global de la company active (Sprint C Tâche 6).
//
// Pour les firm_members qui ont N Companies, on stocke quelle Company est
// actuellement consultée. Persisté en localStorage pour survie au reload.
// Les company_owners ne consomment pas ce store (ils ont 1 seule Company).
//
// Décision audit-sprint-C Q2 : React Context (pas de zustand). Aligné
// sur le pattern existant useSidebarCollapsedPreference.
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const ACTIVE_COMPANY_STORAGE_KEY = "vyzor:activeCompanyId";

interface ActiveCompanyContextValue {
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string | null) => void;
}

const ActiveCompanyContext = createContext<ActiveCompanyContextValue | null>(null);

// Exporté pour tests purs (pas besoin de @testing-library/react).
export function readActiveCompanyFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeActiveCompanyToStorage(value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
    else window.localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, value);
  } catch {
    /* swallow — localStorage indispo ne casse pas l'app */
  }
}

export function ActiveCompanyProvider({ children }: { children: ReactNode }) {
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);

  // Hydratation depuis localStorage au mount (évite mismatch SSR/CSR).
  useEffect(() => {
    const persisted = readActiveCompanyFromStorage();
    if (persisted) setActiveCompanyIdState(persisted);
  }, []);

  function setActiveCompanyId(id: string | null): void {
    setActiveCompanyIdState(id);
    writeActiveCompanyToStorage(id);
  }

  const value = useMemo(
    () => ({ activeCompanyId, setActiveCompanyId }),
    [activeCompanyId]
  );

  return (
    <ActiveCompanyContext.Provider value={value}>
      {children}
    </ActiveCompanyContext.Provider>
  );
}

/**
 * Hook pour consommer le store. Retourne un fallback noop si appelé hors
 * Provider (ex: page company_owner qui ne le mount pas) — évite d'avoir
 * à wrapper toute l'app inutilement.
 */
export function useActiveCompany(): ActiveCompanyContextValue {
  const ctx = useContext(ActiveCompanyContext);
  if (ctx) return ctx;
  // Fallback no-op : permet aux composants partagés (sidebar) de
  // consommer le store sans crasher sur les routes company_owner.
  return {
    activeCompanyId: null,
    setActiveCompanyId: () => {
      /* no-op */
    },
  };
}
