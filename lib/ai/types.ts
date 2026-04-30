// File: lib/ai/types.ts
// Role: types partagés pour la couche IA (service, prompt, conversations).
//
// Volontairement isolés du reste de la base : tout module qui veut consommer
// l'assistant IA importe depuis `@/lib/ai/types` plutôt que de re-déclarer
// localement la forme d'un message ou d'une réponse.

import type { AnalysisRecord } from "@/types/analysis";

/**
 * Niveau de littératie financière déclaré par l'utilisateur.
 * Influence le ton du `system prompt` (vulgarisation vs. précision technique)
 * et la verbosité des explications.
 */
export type UserLevel = "beginner" | "intermediate" | "expert";

/**
 * Rôle d'un message dans une conversation. Identique à la nomenclature
 * Anthropic / OpenAI pour faciliter le branchement réel.
 */
export type ChatMessageRole = "user" | "assistant";

/**
 * Un message persisté dans une conversation.
 * Le timestamp est en millisecondes pour rester JSON-friendly côté client
 * (pas de `Date` ni `Timestamp` qui se sérialisent mal en SSR).
 */
export type ChatMessage = {
  role: ChatMessageRole;
  content: string;
  timestamp: number;
};

/**
 * Métadonnées d'une conversation, sans les messages (vue "liste").
 */
export type ConversationSummary = {
  id: string;
  kpiId: string | null;
  title: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
  /** Aperçu de la dernière réponse (tronqué) — pour la liste. */
  lastAnswerPreview: string | null;
};

/**
 * Conversation complète avec ses messages.
 */
export type Conversation = ConversationSummary & {
  messages: ChatMessage[];
};

/**
 * Paramètres d'un appel à un `AiService`.
 */
export type AiAskParams = {
  /** Question posée par l'utilisateur (texte libre). */
  question: string;
  /** KPI sur lequel l'utilisateur a cliqué (peut être null pour un chat libre). */
  kpiId: string | null;
  /**
   * Snapshot de l'analyse au moment de la question. Sert à injecter les
   * données réelles dans le system prompt (KPIs non-null, mappedData).
   */
  analysis: AnalysisRecord | null;
  /** Niveau utilisateur — ajuste le ton de la réponse. */
  userLevel: UserLevel;
  /**
   * Historique des tours précédents de la conversation (pour le mode multi-tour).
   * Vide pour la première question.
   */
  history?: ChatMessage[];
};

/**
 * Réponse retournée par un `AiService`.
 */
export type AiResponse = {
  /** Contenu de la réponse, en markdown. */
  answer: string;
  /** Mode utilisé (mock ou Claude réel) — utile en dev pour le badge UI. */
  mode: "mock" | "claude";
  /** Identifiant de modèle utilisé (côté Claude uniquement). */
  modelId?: string;
};
