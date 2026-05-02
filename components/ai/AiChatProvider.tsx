// File: components/ai/AiChatProvider.tsx
// Role: contexte React global qui PILOTE l'OUVERTURE du chat IA.
//
// Avant : le provider rendait `<AiChatPanel />` à la racine et le toggle
// `open()` montait le tiroir latéral. Refonte produit : le chat est
// désormais une PAGE PLEIN ÉCRAN (`/assistant-ia/chat`) avec la sidebar
// principale toujours visible — pattern LLM classique (ChatGPT, Claude,
// Perplexity). L'effet "je peux revenir en arrière" est préservé.
//
// Le provider continue d'exister pour deux raisons :
//   1. Compat — tous les call-sites existants (KpiTooltip, page Assistant
//      conversations, etc.) appellent `useAiChat().open(payload)` ; on garde
//      cette API mais elle fait maintenant un `router.push(/assistant-ia/chat?...)`.
//   2. Garder un point central pour `setAnalysisContext` (l'analysisId courant
//      est passé en query param à chaque ouverture).
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage } from "@/lib/ai/types";

type OpenChatPayload = {
  /** KPI focus (ou null pour un chat libre). */
  kpiId?: string | null;
  /** Valeur actuelle du KPI — alimente le header de la page chat. */
  kpiValue?: number | null;
  /** Valeur N-1 du KPI — réservé pour la variation (non utilisé pour l'instant). */
  kpiPreviousValue?: number | null;
  /** Question pré-remplie qui sera envoyée automatiquement. */
  initialQuestion?: string | null;
  /** Conversation existante à reprendre. */
  conversationId?: string | null;
  /** Messages déjà connus (non transmis pour l'instant — la page va lire
   *  la conversation depuis Firestore via `conversationId`). */
  initialMessages?: ChatMessage[];
};

type AiChatContextValue = {
  open: (payload?: OpenChatPayload) => void;
  /** Ferme = retour navigateur (équivalent à un back). Conservé pour compat. */
  close: () => void;
  /** Toujours false — le provider ne gère plus d'overlay. Conservé pour compat. */
  isOpen: boolean;
  /** Met à jour l'analysisId courant (consommé par les pages d'analyse). */
  setAnalysisContext: (analysisId: string | null) => void;
};

const AiChatContext = createContext<AiChatContextValue | null>(null);

export function AiChatProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  const open = useCallback(
    (payload?: OpenChatPayload) => {
      const params = new URLSearchParams();
      if (payload?.kpiId) params.set("kpiId", payload.kpiId);
      if (payload?.initialQuestion) params.set("q", payload.initialQuestion);
      if (
        typeof payload?.kpiValue === "number" &&
        Number.isFinite(payload.kpiValue)
      ) {
        params.set("kpiValue", String(payload.kpiValue));
      }
      if (payload?.conversationId) params.set("conversationId", payload.conversationId);
      if (analysisId) params.set("analysisId", analysisId);
      const qs = params.toString();
      router.push(`/assistant-ia/chat${qs ? `?${qs}` : ""}`);
    },
    [router, analysisId]
  );

  const close = useCallback(() => {
    router.back();
  }, [router]);

  const setAnalysisContext = useCallback((id: string | null) => {
    setAnalysisId(id);
  }, []);

  const value = useMemo<AiChatContextValue>(
    () => ({ open, close, isOpen: false, setAnalysisContext }),
    [open, close, setAnalysisContext]
  );

  return (
    <AiChatContext.Provider value={value}>{children}</AiChatContext.Provider>
  );
}

/**
 * Accède au provider. Si appelé hors d'un `AiChatProvider`, on retourne un
 * no-op pour ne pas casser les pages publiques (le clic sur un tooltip sans
 * provider mounté ne fera rien — comportement préférable à un crash).
 */
export function useAiChat(): AiChatContextValue {
  const ctx = useContext(AiChatContext);
  if (!ctx) {
    return {
      open: () => {},
      close: () => {},
      isOpen: false,
      setAnalysisContext: () => {},
    };
  }
  return ctx;
}
