import Anthropic from "@anthropic-ai/sdk";
import type { MappedFinancialData } from "@/types/analysis";

export interface LlmExtractionResult {
  success: boolean;
  data: Partial<MappedFinancialData> | null;
  confidenceScore: number;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCost: number;
  durationMs: number;
  error?: string;
  parserVersion: "v2";
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-5";
const CONFIDENCE_THRESHOLD = 0.75;
const TIMEOUT_MS = 90_000;

const LLM_FIELDS = [
  "immob_incorp", "immob_corp", "immob_fin", "total_actif_immo",
  "stocks_mp", "stocks_march", "total_stocks",
  "clients", "autres_creances", "vmp", "dispo", "cca",
  "total_actif_circ", "total_actif",
  "capital", "reserve_legale", "autres_reserves", "ran", "res_net",
  "total_cp", "total_prov",
  "emprunts", "fournisseurs", "dettes_fisc_soc", "autres_dettes",
  "total_dettes", "total_passif",
  "ventes_march", "prod_vendue", "prod_stockee", "prod_immo",
  "subv_expl", "autres_prod_expl", "total_prod_expl",
  "prod_fin", "prod_excep",
  "achats_march", "var_stock_march", "achats_mp", "var_stock_mp",
  "ace", "impots_taxes", "salaires", "charges_soc",
  "dap", "dprov", "autres_charges_expl", "total_charges_expl",
  "charges_fin", "charges_excep", "is_impot",
  "ebit", "resultat_exercice", "ca_n_minus_1"
] as const;

export function buildLlmPrompt(rawText: string): { system: string; user: string } {
  const system = `Tu es un expert-comptable français spécialisé dans l'analyse de liasses fiscales.
Tu reçois le texte brut extrait d'un document comptable français (bilan, compte de résultat, annexes).
Tu dois extraire exactement les champs financiers listés ci-dessous et retourner UNIQUEMENT un JSON valide.

RÈGLES ABSOLUES :
- Retourner UNIQUEMENT du JSON valide, aucun texte avant ou après
- null si un champ est absent ou illisible — jamais inventer une valeur
- Prendre TOUJOURS la colonne N (exercice courant, à gauche), jamais N-1 (exercice précédent, à droite)
- Si le document mentionne "en milliers d'euros" ou "k€" → multiplier toutes les valeurs par 1000
- Les valeurs entre parenthèses sont NÉGATIVES : (10 021) = -10021
- Les espaces dans les nombres sont des séparateurs : "1 173 877" = 1173877
- Chercher TOUJOURS la ligne de TOTAL, jamais une sous-ligne ou un composant
- Les totaux sont souvent en gras ou précédés de "TOTAL" ou "Total général"
- Ne jamais confondre un numéro de compte PCG (ex: 10610100) avec une valeur financière

FORMATS RECONNUS :
- Formulaire 2050-SD (bilan actif) : TOTAL GÉNÉRAL ligne 110
- Formulaire 2051-SD (bilan passif) : TOTAL GÉNÉRAL ligne 180
- Formulaire 2052-SD (CDR) : BÉNÉFICE OU PERTE ligne 310
- Formulaire 2033-SD (simplifié) : totaux lignes 096, 110, 180, 232, 264, 310
- Format Sage/Cegid : tableau 4 colonnes Brut/Amort/Net N/Net N-1
- Format Regnology : tableaux N et N-1 séparés
- Format balance générale : numéros de compte + libellé + montant N + montant N-1

RÈGLE SUR LES COLONNES :
- La colonne N est la première colonne de gauche avec des valeurs
- Si deux nombres sur la même ligne : prendre le premier (gauche)
- Exception : si "Exercice N-1" est à gauche → prendre la droite

CHAMPS À EXTRAIRE (retourner null si absent) :
{
  "immob_incorp": null,
  "immob_corp": null,
  "immob_fin": null,
  "total_actif_immo": null,
  "stocks_mp": null,
  "stocks_march": null,
  "total_stocks": null,
  "clients": null,
  "autres_creances": null,
  "vmp": null,
  "dispo": null,
  "cca": null,
  "total_actif_circ": null,
  "total_actif": null,
  "capital": null,
  "reserve_legale": null,
  "autres_reserves": null,
  "ran": null,
  "res_net": null,
  "total_cp": null,
  "total_prov": null,
  "emprunts": null,
  "fournisseurs": null,
  "dettes_fisc_soc": null,
  "autres_dettes": null,
  "total_dettes": null,
  "total_passif": null,
  "ventes_march": null,
  "prod_vendue": null,
  "prod_stockee": null,
  "prod_immo": null,
  "subv_expl": null,
  "autres_prod_expl": null,
  "total_prod_expl": null,
  "prod_fin": null,
  "prod_excep": null,
  "achats_march": null,
  "var_stock_march": null,
  "achats_mp": null,
  "var_stock_mp": null,
  "ace": null,
  "impots_taxes": null,
  "salaires": null,
  "charges_soc": null,
  "dap": null,
  "dprov": null,
  "autres_charges_expl": null,
  "total_charges_expl": null,
  "charges_fin": null,
  "charges_excep": null,
  "is_impot": null,
  "ebit": null,
  "resultat_exercice": null,
  "ca_n_minus_1": null,
  "fiscal_year": null,
  "unite": "euros"
}`;

  const user = `Voici le texte brut extrait du document financier. Extrais les champs demandés et retourne le JSON.\n\n${rawText}`;

  return { system, user };
}

function parseLlmResponse(text: string): Partial<MappedFinancialData> & { fiscal_year?: number | null; unite?: string | null } | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed !== "object" || parsed === null) return null;
    const result: Record<string, number | string | null> = {};
    for (const field of LLM_FIELDS) {
      const val = parsed[field];
      if (val === null || val === undefined) {
        result[field] = null;
      } else if (typeof val === "number" && Number.isFinite(val)) {
        result[field] = val;
      } else if (typeof val === "string") {
        const cleaned = val.replace(/[\s\u00A0\u202F]/g, "").replace(",", ".");
        const num = parseFloat(cleaned);
        result[field] = Number.isFinite(num) ? num : null;
      } else {
        result[field] = null;
      }
    }
    if (parsed.fiscal_year !== undefined) result.fiscal_year = parsed.fiscal_year;
    if (parsed.unite !== undefined) result.unite = parsed.unite;
    return result as Partial<MappedFinancialData> & { fiscal_year?: number | null; unite?: string | null };
  } catch {
    return null;
  }
}

export function computeConfidenceScore(data: Record<string, unknown>): number {
  const criticalFields = [
    "total_actif", "total_passif", "total_cp", "resultat_exercice",
    "total_prod_expl", "total_charges_expl"
  ];
  const importantFields = [
    "ventes_march", "prod_vendue", "ace", "salaires",
    "charges_soc", "dap", "fournisseurs", "dettes_fisc_soc", "emprunts"
  ];

  const criticalFilled = criticalFields.filter((f) => data[f] !== null && data[f] !== undefined).length;
  const importantFilled = importantFields.filter((f) => data[f] !== null && data[f] !== undefined).length;

  return (criticalFilled / criticalFields.length) * 0.7 +
    (importantFilled / importantFields.length) * 0.3;
}

function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  if (model === HAIKU_MODEL) {
    return tokensIn * (0.25 / 1_000_000) + tokensOut * (1.25 / 1_000_000);
  }
  return tokensIn * (3 / 1_000_000) + tokensOut * (15 / 1_000_000);
}

async function callLlm(
  rawText: string,
  model: string
): Promise<{ data: Record<string, unknown> | null; rawResponse: string; tokensInput: number; tokensOutput: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey });
  const { system, user } = buildLlmPrompt(rawText);

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }]
  });

  const rawResponse = response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const tokensInput = response.usage?.input_tokens ?? 0;
  const tokensOutput = response.usage?.output_tokens ?? 0;

  const data = parseLlmResponse(rawResponse);
  return { data: data as Record<string, unknown> | null, rawResponse, tokensInput, tokensOutput };
}

export async function extractWithLlm(
  rawText: string,
  pdfName: string
): Promise<LlmExtractionResult> {
  const startMs = Date.now();

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let usedModel = HAIKU_MODEL;

  try {
    const haikuResult = await callLlm(rawText, HAIKU_MODEL);
    totalTokensIn += haikuResult.tokensInput;
    totalTokensOut += haikuResult.tokensOutput;

    let data = haikuResult.data;
    let confidenceScore = data ? computeConfidenceScore(data) : 0;

    if (confidenceScore < CONFIDENCE_THRESHOLD) {
      console.log(`[V2] Haiku score ${confidenceScore.toFixed(2)} < ${CONFIDENCE_THRESHOLD} → Sonnet`);
      usedModel = SONNET_MODEL;
      const sonnetResult = await callLlm(rawText, SONNET_MODEL);
      totalTokensIn += sonnetResult.tokensInput;
      totalTokensOut += sonnetResult.tokensOutput;

      if (sonnetResult.data) {
        const sonnetScore = computeConfidenceScore(sonnetResult.data);
        if (sonnetScore > confidenceScore) {
          data = sonnetResult.data;
          confidenceScore = sonnetScore;
          console.log(`[V2] Sonnet score ${sonnetScore.toFixed(2)} → adopté`);
        }
      }
    }

    const durationMs = Date.now() - startMs;
    const estimatedCost = estimateCost(HAIKU_MODEL, haikuResult.tokensInput, haikuResult.tokensOutput) +
      (usedModel === SONNET_MODEL ? estimateCost(SONNET_MODEL, totalTokensIn - haikuResult.tokensInput, totalTokensOut - haikuResult.tokensOutput) : 0);

    if (!data) {
      console.error(`[V2] Échec — aucune donnée parsée`);
      return {
        success: false, data: null, confidenceScore: 0,
        model: usedModel, tokensInput: totalTokensIn, tokensOutput: totalTokensOut,
        estimatedCost, durationMs, error: "Failed to parse LLM response",
        parserVersion: "v2"
      };
    }

    const mappedData = applyUniteMultiplier(data);
    const filledCount = LLM_FIELDS.filter((f) => mappedData[f] !== null && mappedData[f] !== undefined).length;
    const success = confidenceScore >= 0.4;

    console.log(
      `[V2] ${success ? "OK" : "Score insuffisant"} — ${filledCount}/${LLM_FIELDS.length} champs — score: ${confidenceScore.toFixed(2)} — ${usedModel.split("-").slice(1, 3).join("-")} — $${estimatedCost.toFixed(4)} — ${(durationMs / 1000).toFixed(1)}s`
    );

    return {
      success,
      data: mappedData as Partial<MappedFinancialData>,
      confidenceScore,
      model: usedModel,
      tokensInput: totalTokensIn,
      tokensOutput: totalTokensOut,
      estimatedCost,
      durationMs,
      parserVersion: "v2"
    };
  } catch (error) {
    const durationMs = Date.now() - startMs;
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[V2] ERREUR: ${message}`);
    return {
      success: false, data: null, confidenceScore: 0,
      model: usedModel, tokensInput: totalTokensIn, tokensOutput: totalTokensOut,
      estimatedCost: estimateCost(usedModel, totalTokensIn, totalTokensOut),
      durationMs, error: message, parserVersion: "v2"
    };
  }
}

function applyUniteMultiplier(data: Record<string, unknown>): Record<string, unknown> {
  if (data.unite !== "milliers_euros") return data;
  console.log("[V2] Détection k€ : ×1000");
  const result = { ...data };
  for (const field of LLM_FIELDS) {
    const val = result[field];
    if (typeof val === "number") {
      result[field] = val * 1000;
    }
  }
  return result;
}
