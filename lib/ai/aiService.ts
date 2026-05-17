// File: lib/ai/aiService.ts
// Role: interface abstraite `AiService` + deux implémentations.
//
//   - `MockAiService` : retourne une réponse pré-générée par KPI/diagnostic.
//     Utilisé tant qu'aucune `ANTHROPIC_API_KEY` n'est configurée. Latence
//     artificielle de 1.5 s pour reproduire l'effet réseau côté UI (le
//     spinner doit être visible).
//
//   - `ClaudeAiService` : appelle l'API Claude (`@anthropic-ai/sdk`).
//     Si la clé est absente au runtime, fallback automatique sur le mock
//     avec un log console — pour qu'un dev qui clone le repo sans .env
//     puisse quand même cliquer sur l'assistant et voir une réponse.
//
// La factory `getAiService()` est le seul point d'entrée — un consommateur
// (`/api/ai/ask`) ne devrait jamais instancier directement les classes ;
// c'est l'env qui décide.
//
// ─── Pourquoi pas un singleton exporté ────────────────────────────────────
//
// On préfère une factory parce qu'en test on veut pouvoir injecter un mock
// déterministe (sans 1.5 s de latence). La factory accepte un override pour
// les tests, et lit l'env en mode runtime sinon.

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/ai/promptBuilder";
import { getMockResponse, MOCK_LATENCY_MS } from "@/lib/ai/mockResponses";
import { buildStructuredFromContext } from "@/lib/ai/structuredResponse";
import type { AiAskParams, AiResponse } from "@/lib/ai/types";

/**
 * Modèle Claude utilisé en production. Voir docs/AI_ARCHITECTURE.md §"Modèle cible".
 * Volontairement non lu depuis l'env : on veut que la version soit traçable
 * dans la conversation Firestore (cf. `modelVersion` dans le schéma).
 */
export const CLAUDE_MODEL_ID = "claude-sonnet-4-6";

// 1500 tokens ≈ 900-1000 mots français. Permet des réponses analytiques
// multi-points (3 actions, 2 leviers, causes multiples) sans troncature.
// À surveiller via response.usage pour ajuster en Phase 2.
const CLAUDE_MAX_TOKENS = 1500;

export interface AiService {
  /**
   * Pose une question à l'assistant. Retourne la réponse complète (mode
   * bloquant — conservé pour la rétro-compat avec les chemins existants
   * qui n'utilisent pas le streaming).
   */
  ask(params: AiAskParams): Promise<AiResponse>;

  /**
   * Variante streaming : yield les fragments de texte au fur et à mesure
   * qu'ils arrivent du modèle. Utilisé par `POST /api/ai/ask` pour servir
   * une réponse SSE au front. La persistance Firestore est faite côté route
   * (à la fin du stream), pas ici.
   */
  askStream(params: AiAskParams): AsyncGenerator<string, void, void>;
}

// ─── MockAiService ──────────────────────────────────────────────────────

/**
 * Service mock — retourne `getMockResponse()` après une latence artificielle.
 * Le délai est paramétrable (utile en test pour passer 0 ms).
 */
export class MockAiService implements AiService {
  private readonly latencyMs: number;

  constructor(latencyMs: number = MOCK_LATENCY_MS) {
    this.latencyMs = latencyMs;
  }

  async ask(params: AiAskParams): Promise<AiResponse> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    const { answer, structured } = generateMockAnswer(params);
    return { answer, mode: "mock", structured };
  }

  /**
   * Stream simulé — yield mot par mot avec un petit délai (~30 ms) pour
   * reproduire visuellement l'effet streaming sans dépendre d'une clé API
   * Anthropic. Le contenu est identique à `ask()` (factorisé via
   * `generateMockAnswer`).
   */
  async *askStream(params: AiAskParams): AsyncGenerator<string, void, void> {
    const { answer } = generateMockAnswer(params);
    const tokens = answer.split(/(\s+)/); // garde les espaces comme tokens
    // Délai par token proportionnel à la latence globale : à `MOCK_LATENCY_MS`
    // par défaut (1500), on tape ~30 ms/token ; en test (latency=0) on est
    // instantané. Plafonné à 50 ms pour ne pas faire patiner sur les longues
    // réponses (50 ms × 200 tokens = 10 s max).
    const perToken = Math.min(50, Math.max(0, this.latencyMs / 50));
    for (const tok of tokens) {
      if (!tok) continue;
      if (perToken > 0) {
        await new Promise((resolve) => setTimeout(resolve, perToken));
      }
      yield tok;
    }
  }
}

/** Génère le couple `(answer, structured)` pour un appel mock — partagé
 *  entre `ask` (bloquant) et `askStream` (streaming simulé). */
function generateMockAnswer(params: AiAskParams): {
  answer: string;
  structured: ReturnType<typeof buildStructuredFromContext>;
} {
  const value = getKpiValue(params);
  const answer = getMockResponse({
    kpiId: params.kpiId,
    question: params.question,
    value,
    userLevel: params.userLevel,
  });
  const structured = buildStructuredFromContext({
    kpiId: params.kpiId,
    value,
    markdown: answer,
  });
  return { answer, structured };
}

// ─── ClaudeAiService ────────────────────────────────────────────────────

/**
 * Service réel — appelle l'API Anthropic.
 *
 * Important : on instancie `Anthropic` paresseusement dans `ask()` plutôt
 * qu'au constructor, pour que la classe puisse exister sans clé (la clé est
 * seulement requise à l'appel). Ça évite des crash cycle de boot en test.
 */
export class ClaudeAiService implements AiService {
  private readonly apiKey: string;
  private readonly fallback: AiService;

  constructor(apiKey: string, fallback: AiService = new MockAiService()) {
    this.apiKey = apiKey;
    this.fallback = fallback;
  }

  async ask(params: AiAskParams): Promise<AiResponse> {
    try {
      const client = new Anthropic({ apiKey: this.apiKey });
      const systemPrompt = buildSystemPrompt({
        analysis: params.analysis,
        kpiId: params.kpiId,
        kpiValue: params.kpiValue ?? null,
        userLevel: params.userLevel,
      });

      const messages = [
        ...(params.history ?? []).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: params.question },
      ];

      const response = await client.messages.create({
        model: CLAUDE_MODEL_ID,
        max_tokens: CLAUDE_MAX_TOKENS,
        system: systemPrompt,
        messages,
      });

      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text"
      );
      const answer = textBlock?.text ?? "Désolé, je n'ai pas pu produire de réponse.";

      return { answer, mode: "claude", modelId: CLAUDE_MODEL_ID };
    } catch (error) {
      // En cas d'erreur API (quota, réseau, modèle indisponible), on retombe
      // sur le mock pour que l'utilisateur ait quand même une réponse — un
      // 500 serait pire UX qu'une réponse mock dégradée mais informative.
      console.error("AI: Claude API call failed, falling back to mock", error);
      return this.fallback.ask(params);
    }
  }

  /**
   * Streaming SSE-compatible : utilise `client.messages.stream(...)` qui
   * expose un AsyncIterable d'évènements bas niveau. On filtre les
   * `content_block_delta` de type `text_delta` et on yield uniquement le
   * texte — le wrapper SSE côté route serialize les chunks.
   *
   * Si la première étape (création du stream) échoue (clé invalide, modèle
   * inaccessible), on retombe sur le mock du fallback pour ne pas casser
   * l'UX. Une erreur en cours de stream propage normalement — la route
   * convertit ça en event `error` SSE.
   */
  async *askStream(params: AiAskParams): AsyncGenerator<string, void, void> {
    let stream: Awaited<ReturnType<Anthropic["messages"]["stream"]>>;
    try {
      const client = new Anthropic({ apiKey: this.apiKey });
      const systemPrompt = buildSystemPrompt({
        analysis: params.analysis,
        kpiId: params.kpiId,
        kpiValue: params.kpiValue ?? null,
        userLevel: params.userLevel,
      });

      const messages = [
        ...(params.history ?? []).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: params.question },
      ];

      stream = client.messages.stream({
        model: CLAUDE_MODEL_ID,
        max_tokens: CLAUDE_MAX_TOKENS,
        system: systemPrompt,
        messages,
      });
    } catch (error) {
      console.error("AI: Claude streaming setup failed, falling back to mock", error);
      yield* this.fallback.askStream(params);
      return;
    }

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

/**
 * Override possible pour les tests qui veulent injecter un mock contrôlé.
 * Reset par `setAiServiceOverride(null)` après le test.
 */
let serviceOverride: AiService | null = null;

export function setAiServiceOverride(service: AiService | null): void {
  serviceOverride = service;
}

/**
 * Retourne le service à utiliser :
 *   - override de test si présent
 *   - sinon Claude si `ANTHROPIC_API_KEY` est défini
 *   - sinon mock (avec log console pour signaler le mode dégradé)
 */
export function getAiService(): AiService {
  if (serviceOverride) return serviceOverride;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("AI: using mock (no API key configured)");
    return new MockAiService();
  }

  return new ClaudeAiService(apiKey);
}

// ─── Helpers internes ───────────────────────────────────────────────────

/**
 * Récupère la valeur courante d'un KPI. Priorité :
 *   1. `params.kpiValue` (fourni par le front depuis la carte KPI cliquée)
 *   2. `analysis.kpis[kpiId]` (lookup côté serveur si analysisId fourni)
 *   3. null (le mock a un branchement dédié pour les valeurs absentes)
 *
 * Cette priorité corrige le bug "non disponible" : le tooltip a toujours
 * la valeur, mais pas forcément l'analysisId (synthèse, widgets hors page
 * d'analyse).
 */
function getKpiValue(params: AiAskParams): number | null {
  if (typeof params.kpiValue === "number" && Number.isFinite(params.kpiValue)) {
    return params.kpiValue;
  }
  if (!params.kpiId || !params.analysis) return null;
  const kpis = params.analysis.kpis as Record<string, number | null | undefined>;
  const raw = kpis[params.kpiId];
  return typeof raw === "number" ? raw : null;
}
