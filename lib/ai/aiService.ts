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

/** Plafond de tokens en sortie — cohérent avec AI_ARCHITECTURE.md §"Niveau 2". */
const CLAUDE_MAX_TOKENS = 600;

export interface AiService {
  /**
   * Pose une question à l'assistant. Retourne la réponse complète (pas de
   * streaming pour la première version — on l'ajoutera quand le niveau 3
   * multi-tour sera priorisé).
   */
  ask(params: AiAskParams): Promise<AiResponse>;
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
    return { answer, mode: "mock", structured };
  }
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
