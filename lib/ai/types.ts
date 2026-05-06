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
   * Valeur courante du KPI fournie par le front. Override prioritaire sur
   * `analysis.kpis[kpiId]` — utile quand le tooltip a la valeur mais pas
   * l'analysisId pour la lookup serveur.
   */
  kpiValue?: number | null;
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
  /**
   * Réponse structurée optionnelle — disponible en mode mock (et calculable
   * côté client pour Claude via `buildStructuredFromMarkdown`). Permet au
   * front de rendre les blocs A-F (diagnostic, explication, data, comparaison,
   * actions, follow-up) au lieu d'un markdown brut.
   */
  structured?: AiStructuredResponse;
};

// ─── Réponse structurée ────────────────────────────────────────────────

export type AiDiagnosticStatus = "danger" | "good" | "neutral";

export type AiDataPoint = {
  label: string;
  value: string;
  /** Optionnel : kpiId vers lequel naviguer au clic. */
  kpiId?: string;
  /** Variation vs N-1 en % (ex. -75.4 = baisse 75.4%). Affichée à droite du
   *  chiffre avec flèche colorée si fournie. */
  variationPct?: number | null;
  /** Série mensuelle (6 derniers mois) pour le sparkline inline. Ignorée si
   *  moins de 2 points (pas de tendance interprétable). */
  sparklinePoints?: number[];
};

export type AiComparison = {
  current: { label: string; value: number };
  reference: { label: string; value: number };
};

export type AiActionType = "simulate" | "navigate" | "compare";
/** Icônes lucide-react autorisées pour les chips d'action (tree-shaking). */
export type AiActionIcon =
  | "Sliders"
  | "BarChart3"
  | "ArrowRight"
  | "TrendingUp"
  | "Eye"
  | "Calendar";

export type AiAction = {
  label: string;
  icon: AiActionIcon;
  type: AiActionType;
  /** Cible : kpiId pour navigate, scénario id pour simulate, période id pour compare. */
  target: string;
};

/**
 * Forme structurée d'une réponse IA — rendue sous forme de blocs visuels
 * dans `AiChatPanel`. Le markdown brut reste disponible dans `AiResponse.answer`
 * pour la persistance et l'historique.
 */
export type AiStructuredResponse = {
  diagnostic: { status: AiDiagnosticStatus; message: string };
  /** Explication 2-4 phrases — peut contenir des **gras** simples. */
  explanation: string;
  /** Chiffres clés en micro-cards (2-3 max). */
  dataPoints?: AiDataPoint[];
  /** Comparaison binaire actuel vs référence (mini-graph horizontal). */
  comparison?: AiComparison;
  /** Chips d'actions recommandées. */
  actions: AiAction[];
  /** Questions de suivi pré-remplies (2 max). */
  followUpQuestions: string[];
};
