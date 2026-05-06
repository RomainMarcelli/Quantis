// File: components/ai/AiChatProvider.tsx
// Role: contexte React global qui pilote l'ouverture du `AiChatPanel`.
//
// Pourquoi un provider plutôt qu'un panel mounté dans chaque page ? Parce
// qu'on veut pouvoir ouvrir le drawer depuis n'importe où (tooltip d'un
// KPI, page Assistant IA, header global) sans dupliquer la logique
// d'ouverture/auth. Un seul `AiChatPanel` est mounté à la racine de l'app
// (via `app/layout.tsx`) et tout consommateur appelle `useAiChat().open(…)`.
//
// L'`analysisId` courant est un état du provider — l'app le met à jour
// quand l'utilisateur change d'analyse via `useAiChat().setAnalysisContext`.
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AiChatPanel } from "@/components/ai/AiChatPanel";
import type { ChatMessage } from "@/lib/ai/types";

type OpenChatPayload = {
  /** KPI focus (ou null pour un chat libre). */
  kpiId?: string | null;
  /** Valeur actuelle du KPI — alimente le header mini-cockpit. */
  kpiValue?: number | null;
  /** Valeur N-1 du KPI — calcule la variation affichée dans le header. */
  kpiPreviousValue?: number | null;
  /** Question pré-remplie qui sera envoyée automatiquement. */
  initialQuestion?: string | null;
  /** Conversation existante à reprendre. */
  conversationId?: string | null;
  /** Messages déjà connus (évite un GET supplémentaire si on les a). */
  initialMessages?: ChatMessage[];
};

type AiChatContextValue = {
  open: (payload?: OpenChatPayload) => void;
  close: () => void;
  isOpen: boolean;
  /** Met à jour l'analysisId courant (consommé par les pages d'analyse). */
  setAnalysisContext: (analysisId: string | null) => void;
};

const AiChatContext = createContext<AiChatContextValue | null>(null);

export function AiChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [kpiId, setKpiId] = useState<string | null>(null);
  const [kpiValue, setKpiValue] = useState<number | null>(null);
  const [kpiPreviousValue, setKpiPreviousValue] = useState<number | null>(null);
  const [initialQuestion, setInitialQuestion] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  const open = useCallback((payload?: OpenChatPayload) => {
    setKpiId(payload?.kpiId ?? null);
    setKpiValue(payload?.kpiValue ?? null);
    setKpiPreviousValue(payload?.kpiPreviousValue ?? null);
    setInitialQuestion(payload?.initialQuestion ?? null);
    setConversationId(payload?.conversationId ?? null);
    setInitialMessages(payload?.initialMessages ?? []);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const setAnalysisContext = useCallback((id: string | null) => {
    setAnalysisId(id);
  }, []);

  const value = useMemo<AiChatContextValue>(
    () => ({ open, close, isOpen, setAnalysisContext }),
    [open, close, isOpen, setAnalysisContext]
  );

  return (
    <AiChatContext.Provider value={value}>
      {children}
      <AiChatPanel
        open={isOpen}
        onClose={close}
        kpiId={kpiId}
        kpiValue={kpiValue}
        kpiPreviousValue={kpiPreviousValue}
        initialQuestion={initialQuestion}
        analysisId={analysisId}
        conversationId={conversationId}
        initialMessages={initialMessages}
      />
    </AiChatContext.Provider>
  );
}

/**
 * Accède au provider. Si le hook est appelé hors d'un `AiChatProvider`,
 * on retourne un no-op pour ne pas casser les pages qui ne l'ont pas
 * (typiquement les pages publiques auth). Le clic sur un tooltip sans
 * provider mounté ne fera rien — comportement préférable à un crash.
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
