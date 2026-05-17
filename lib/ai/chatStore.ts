// File: lib/ai/chatStore.ts
// Role: persistance des conversations IA en Firestore (admin SDK, server-only).
//
// Schéma : chats/{userId}/conversations/{conversationId}
//   - kpiId         : string | null  (KPI focus à l'ouverture)
//   - createdAt     : Timestamp
//   - lastMessageAt : Timestamp
//   - title         : string         (= première question utilisateur tronquée)
//   - messages      : array          (append-only ; embarqué dans le doc pour
//                                      simplifier la lecture en 1 read)
//   - messageCount  : number         (= messages.length, dénormalisé pour la liste)
//   - lastAnswerPreview : string|null (extrait du dernier `assistant` — sert
//                                      à la liste sans relire les messages)
//
// ─── Pourquoi messages embedded vs. sub-collection ─────────────────────
//
// Embedded : 1 read = conversation entière, simple, atomique. Limite Firestore
// à 1 MiB par doc → on plafonne à ~50 messages × 4 ko = 200 ko, large marge.
// Sub-collection : utile au-delà (cf. AI_ARCHITECTURE.md §"Stockage"), mais
// pas justifié pour la première version. À revoir quand un chat dépassera
// 50 tours (alerte console au-delà).
//
// Toutes les fonctions ici utilisent l'admin SDK — réservées au serveur.
// Pour l'UI, consommer via les routes API qui les exposent.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/server/firebaseAdmin";
import type {
  ChatMessage,
  Conversation,
  ConversationSummary,
} from "@/lib/ai/types";

const TITLE_MAX_LENGTH = 80;
const PREVIEW_MAX_LENGTH = 140;
const MAX_MESSAGES_PER_CONVERSATION = 100;

type PersistedMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: Timestamp;
};

type PersistedConversation = {
  kpiId: string | null;
  createdAt: Timestamp;
  lastMessageAt: Timestamp;
  title: string;
  messages: PersistedMessage[];
  messageCount: number;
  lastAnswerPreview: string | null;
  /**
   * Conversation épinglée dans la liste. Rétro-compat : pour les conversations
   * existantes le champ est `undefined` côté Firestore — `toSummary` le
   * normalise en `false`. Aucun script de migration nécessaire.
   */
  pinned?: boolean;
};

function conversationsCollection(userId: string) {
  return getFirebaseAdminFirestore()
    .collection("chats")
    .doc(userId)
    .collection("conversations");
}

/**
 * Tronque proprement à `max` caractères en coupant sur un espace si possible.
 * Évite les "..." au milieu d'un mot.
 */
function truncate(text: string, max: number): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (cleaned.length <= max) return cleaned;
  const slice = cleaned.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

function toChatMessage(persisted: PersistedMessage): ChatMessage {
  return {
    role: persisted.role,
    content: persisted.content,
    timestamp:
      persisted.timestamp instanceof Timestamp
        ? persisted.timestamp.toMillis()
        : Date.now(),
  };
}

function toSummary(id: string, data: PersistedConversation): ConversationSummary {
  return {
    id,
    kpiId: data.kpiId,
    title: data.title,
    createdAt: data.createdAt.toMillis(),
    lastMessageAt: data.lastMessageAt.toMillis(),
    messageCount: data.messageCount,
    lastAnswerPreview: data.lastAnswerPreview,
    pinned: data.pinned === true,
  };
}

/**
 * Crée une nouvelle conversation avec sa première paire question/réponse.
 * Retourne la conversation entière (pour qu'on n'ait pas à refaire un read
 * juste après).
 */
export async function createConversation(params: {
  userId: string;
  kpiId: string | null;
  question: string;
  answer: string;
}): Promise<Conversation> {
  const now = Timestamp.now();
  const userMessage: PersistedMessage = {
    role: "user",
    content: params.question,
    timestamp: now,
  };
  const assistantMessage: PersistedMessage = {
    role: "assistant",
    content: params.answer,
    timestamp: now,
  };

  const data: PersistedConversation = {
    kpiId: params.kpiId,
    createdAt: now,
    lastMessageAt: now,
    title: truncate(params.question, TITLE_MAX_LENGTH),
    messages: [userMessage, assistantMessage],
    messageCount: 2,
    lastAnswerPreview: truncate(params.answer, PREVIEW_MAX_LENGTH),
    pinned: false,
  };

  const ref = await conversationsCollection(params.userId).add(data);

  return {
    id: ref.id,
    kpiId: data.kpiId,
    title: data.title,
    createdAt: data.createdAt.toMillis(),
    lastMessageAt: data.lastMessageAt.toMillis(),
    messageCount: data.messageCount,
    lastAnswerPreview: data.lastAnswerPreview,
    pinned: false,
    messages: data.messages.map(toChatMessage),
  };
}

/**
 * Append d'une paire question/réponse sur une conversation existante.
 * Atomique côté Firestore via FieldValue.arrayUnion (pas de race condition
 * si deux onglets envoient en même temps — chacune ajoute son tour, l'ordre
 * est préservé par le timestamp).
 */
export async function addMessage(params: {
  userId: string;
  conversationId: string;
  question: string;
  answer: string;
}): Promise<void> {
  const ref = conversationsCollection(params.userId).doc(params.conversationId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`Conversation ${params.conversationId} introuvable`);
  }
  const data = snap.data() as PersistedConversation;

  if (data.messageCount >= MAX_MESSAGES_PER_CONVERSATION) {
    throw new Error(
      `Conversation pleine (${MAX_MESSAGES_PER_CONVERSATION} messages max). Démarrez-en une nouvelle.`
    );
  }

  const now = Timestamp.now();
  const newMessages: PersistedMessage[] = [
    { role: "user", content: params.question, timestamp: now },
    { role: "assistant", content: params.answer, timestamp: now },
  ];

  await ref.update({
    messages: FieldValue.arrayUnion(...newMessages),
    messageCount: FieldValue.increment(2),
    lastMessageAt: now,
    lastAnswerPreview: truncate(params.answer, PREVIEW_MAX_LENGTH),
  });
}

/**
 * Liste les conversations d'un utilisateur, triées par dernière activité.
 * Retourne uniquement les métadonnées (pas les messages) — pour la vue liste.
 */
export async function listConversations(
  userId: string,
  options: { limit?: number } = {}
): Promise<ConversationSummary[]> {
  const limit = options.limit ?? 50;
  const snapshot = await conversationsCollection(userId)
    .orderBy("lastMessageAt", "desc")
    .limit(limit)
    .get();
  const summaries = snapshot.docs.map((d) =>
    toSummary(d.id, d.data() as PersistedConversation)
  );
  // Tri stable : épinglées d'abord (puis lastMessageAt desc), non-épinglées
  // ensuite (déjà triées desc par Firestore). On utilise un tri en mémoire
  // pour éviter un index composite Firestore — coût négligeable (≤ 50 items).
  return summaries.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastMessageAt - a.lastMessageAt;
  });
}

/**
 * Récupère une conversation complète avec ses messages.
 * Vérifie implicitement l'ownership puisqu'on lit sous `chats/{userId}/...`.
 */
export async function getConversation(
  userId: string,
  conversationId: string
): Promise<Conversation | null> {
  const snap = await conversationsCollection(userId).doc(conversationId).get();
  if (!snap.exists) return null;
  const data = snap.data() as PersistedConversation;
  return {
    ...toSummary(snap.id, data),
    messages: data.messages.map(toChatMessage),
  };
}

/**
 * Met à jour le titre d'une conversation. Le titre est trimmé puis tronqué à
 * TITLE_MAX_LENGTH. Lève si la conversation n'existe pas (le caller doit
 * mapper sur un 404 HTTP).
 */
export async function updateConversationTitle(
  userId: string,
  conversationId: string,
  title: string
): Promise<void> {
  const ref = conversationsCollection(userId).doc(conversationId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`Conversation ${conversationId} introuvable`);
  }
  await ref.update({
    title: truncate(title, TITLE_MAX_LENGTH),
  });
}

/**
 * Bascule l'état épinglé d'une conversation. Lève si introuvable.
 */
export async function updateConversationPinned(
  userId: string,
  conversationId: string,
  pinned: boolean
): Promise<void> {
  const ref = conversationsCollection(userId).doc(conversationId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`Conversation ${conversationId} introuvable`);
  }
  await ref.update({ pinned });
}

/**
 * Supprime définitivement une conversation et tous ses messages embedded.
 * Lève si introuvable. Ownership implicite via le chemin Firestore.
 */
export async function deleteConversation(
  userId: string,
  conversationId: string
): Promise<void> {
  const ref = conversationsCollection(userId).doc(conversationId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error(`Conversation ${conversationId} introuvable`);
  }
  await ref.delete();
}
