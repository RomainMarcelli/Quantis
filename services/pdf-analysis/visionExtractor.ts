import Anthropic from "@anthropic-ai/sdk";
import type { ParsedFinancialData } from "@/services/pdf-analysis/types";
import { logVisionCall } from "@/services/pdf-analysis/visionLogger";

export type VisionFinancialData = {
  ca: number | null;
  prod_vendue: number | null;
  ventes_march: number | null;
  autres_prod_expl: number | null;
  total_prod_expl: number | null;
  ace: number | null;
  salaires: number | null;
  charges_soc: number | null;
  dap: number | null;
  dprov: number | null;
  impots_taxes: number | null;
  autres_charges_expl: number | null;
  total_charges_expl: number | null;
  charges_fin: number | null;
  prod_fin: number | null;
  prod_excep: number | null;
  charges_excep: number | null;
  is_impot: number | null;
  resultat_net: number | null;
  total_actif_immo: number | null;
  immob_incorp: number | null;
  immob_corp: number | null;
  immob_fin: number | null;
  clients: number | null;
  autres_creances: number | null;
  stocks_mp: number | null;
  dispo: number | null;
  vmp: number | null;
  total_actif_circ: number | null;
  total_actif: number | null;
  total_cp: number | null;
  emprunts: number | null;
  fournisseurs: number | null;
  dettes_fisc_soc: number | null;
  autres_dettes: number | null;
  total_dettes: number | null;
  unite?: "euros" | "milliers_euros" | null;
};

export type VisionExtractionResult = {
  success: boolean;
  data: Partial<VisionFinancialData> | null;
  confidenceScore: number;
  error?: string;
  pagesAnalyzed: number;
};

const VISION_FIELDS = [
  "ca", "prod_vendue", "ventes_march", "autres_prod_expl", "total_prod_expl",
  "ace", "salaires", "charges_soc", "dap", "dprov", "impots_taxes",
  "autres_charges_expl", "total_charges_expl", "charges_fin", "prod_fin",
  "prod_excep", "charges_excep", "is_impot", "resultat_net",
  "total_actif_immo", "immob_incorp", "immob_corp", "immob_fin",
  "clients", "autres_creances", "stocks_mp", "dispo", "vmp",
  "total_actif_circ", "total_actif",
  "total_cp", "emprunts", "fournisseurs", "dettes_fisc_soc",
  "autres_dettes", "total_dettes"
] as const;

const TOTAL_FIELDS = VISION_FIELDS.length;

const SYSTEM_PROMPT_BASE = `Tu es un expert-comptable français spécialisé dans l'analyse de liasses fiscales.

DÉTECTION UNITÉ MONÉTAIRE (CRITIQUE) :
- Lis attentivement l'en-tête du document pour détecter l'unité
- Si tu vois "en milliers d'euros", "en k€", "K€", "montants exprimés en milliers"
  → multiplier TOUTES les valeurs numériques par 1000 avant de les retourner
- Si tu vois "en euros", "€" sans mention de milliers → valeurs directes
- Indique dans le champ "unite": "euros" ou "milliers_euros"

FORMATS RECONNUS :
- Formulaire 2050-SD (bilan actif) : cherche "TOTAL GÉNÉRAL" ligne 110
- Formulaire 2051-SD (bilan passif) : cherche "TOTAL GÉNÉRAL" ligne 180
- Formulaire 2052-SD (CDR) : cherche "BÉNÉFICE OU PERTE" ligne 310
- Formulaire 2033-SD (simplifié) : cherche totaux lignes 096, 110, 180, 232, 264, 310
- Format Sage/Cegid : cherche "TOTAL GÉNÉRAL" dans tableau à 4 colonnes (Brut/Amort/Net N/Net N-1)
- Format Regnology : cherche tableaux avec colonnes N et N-1 séparées

RÈGLE ABSOLUE SUR LES COLONNES :
- Les documents financiers français ont TOUJOURS au moins 2 colonnes : N (exercice courant) et N-1 (exercice précédent)
- La colonne N est TOUJOURS la première colonne de gauche avec des valeurs
- La colonne N-1 est TOUJOURS la deuxième colonne (à droite de N)
- Tu dois TOUJOURS prendre la colonne N, JAMAIS la colonne N-1
- Si tu vois deux nombres sur la même ligne : prends TOUJOURS le premier (gauche)
- Exception : si le document indique explicitement "Exercice N-1" sur la colonne gauche → prendre la droite
- En cas de doute → prendre la valeur la plus grande si elle est cohérente avec le contexte

RÈGLE ABSOLUE SUR LES TOTAUX :
- Pour chaque champ demandé, cherche TOUJOURS la ligne de TOTAL correspondante
- Ne jamais prendre une sous-ligne ou un composant quand un total existe
- Exemples :
  * dettes_fisc_soc → cherche "TOTAL Dettes fiscales et sociales" ou "Dettes fiscales et sociales" en ligne de total
  * total_dettes → cherche "TOTAL DES DETTES" ou "TOTAL (III)" dans le bilan passif
  * total_cp → cherche "TOTAL (I)" dans les capitaux propres, pas une ligne composante
  * fournisseurs → cherche "Dettes fournisseurs et comptes rattachés" en ligne principale
- Si tu vois une indentation ou un retrait → c'est probablement une sous-ligne, pas un total
- Les totaux sont généralement en gras ou avec un libellé commençant par "TOTAL"

RÈGLES GÉNÉRALES :
- Les valeurs entre parenthèses sont NÉGATIVES : (10 021) = -10021
- Espaces dans les nombres sont des séparateurs de milliers : "1 173 877" = 1173877
- Ne jamais inventer une valeur — null si absent ou illisible
- Retourne UNIQUEMENT un objet JSON valide, sans texte avant ou après`;

const TIMEOUT_MS = 60_000;
const MIN_CONFIDENCE = 0.5;
const VISION_MODEL = "claude-haiku-4-5-20251001";

function buildSystemPrompt(existingData?: Partial<VisionFinancialData>): string {
  if (!existingData) {
    return SYSTEM_PROMPT_BASE + `\n\nRetourne exactement ce JSON (remplace les valeurs) :\n${buildEmptyJsonTemplate()}`;
  }

  const verified: Record<string, number> = {};
  const missing: string[] = [];

  for (const field of VISION_FIELDS) {
    const val = existingData[field];
    if (val !== null && val !== undefined && typeof val === "number") {
      verified[field] = val;
    } else {
      missing.push(field);
    }
  }

  return SYSTEM_PROMPT_BASE + `

RÈGLE DE VALIDATION :
Tu reçois deux listes :
1. Valeurs déjà extraites par le parser automatique (à VÉRIFIER)
2. Champs manquants (à EXTRAIRE)

Pour les valeurs à VÉRIFIER :
- Lis la valeur dans le document PDF
- Si elle correspond à ce que le parser a trouvé (écart < 5%) → retourne null pour ce champ
- Si elle est différente (erreur du parser) → retourne la valeur correcte du PDF

Pour les champs à EXTRAIRE :
- Cherche la valeur dans le document PDF
- Si présente → retourne la valeur
- Si absente → retourne null

IMPORTANT : Ne retourne JAMAIS une valeur pour un champ vérifié si elle est correcte.
Seules les corrections et les nouvelles extractions doivent apparaître dans ta réponse.

=== VALEURS À VÉRIFIER (${Object.keys(verified).length} champs) ===
${JSON.stringify(verified, null, 2)}

=== CHAMPS À EXTRAIRE (${missing.length} champs) ===
${JSON.stringify(missing)}

Retourne un JSON avec TOUS les champs ci-dessous.
Pour les champs vérifiés et corrects → null.
Pour les champs corrigés ou nouvellement extraits → la valeur.
${buildEmptyJsonTemplate()}`;
}

function buildEmptyJsonTemplate(): string {
  const obj: Record<string, null> = { unite: null };
  for (const field of VISION_FIELDS) {
    obj[field] = null;
  }
  return JSON.stringify(obj, null, 2);
}

function buildPdfContent(pdfBuffer: Buffer): Anthropic.Messages.ContentBlockParam[] {
  return [
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdfBuffer.toString("base64")
      }
    },
    {
      type: "text",
      text: "Analyse ces pages de liasse fiscale et retourne le JSON demandé."
    }
  ];
}

function parseVisionResponse(text: string): Partial<VisionFinancialData> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed !== "object" || parsed === null) return null;
    const result: Record<string, number | string | null> = {};
    const uniteRaw = parsed.unite;
    if (uniteRaw === "euros" || uniteRaw === "milliers_euros") {
      result.unite = uniteRaw;
    } else {
      result.unite = null;
    }
    for (const field of VISION_FIELDS) {
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
    return result as Partial<VisionFinancialData>;
  } catch {
    return null;
  }
}

function computeConfidence(data: Partial<VisionFinancialData>): number {
  let nonNull = 0;
  for (const field of VISION_FIELDS) {
    if (data[field] !== null && data[field] !== undefined) nonNull++;
  }
  return Math.round((nonNull / TOTAL_FIELDS) * 100) / 100;
}

type ClaudeCallResult = {
  data: Partial<VisionFinancialData> | null;
  rawText: string;
  tokensInput: number;
  tokensOutput: number;
};

async function callClaude(
  pdfBuffer: Buffer,
  attempt: number,
  systemPrompt: string
): Promise<ClaudeCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey });
  const content = buildPdfContent(pdfBuffer);

  console.log(`[Vision LLM] Appel API Anthropic — modèle: ${VISION_MODEL} — attempt: ${attempt}`);

  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content }]
  });

  const rawText = response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const tokensInput = response.usage?.input_tokens ?? 0;
  const tokensOutput = response.usage?.output_tokens ?? 0;

  if (attempt <= 1) {
    console.log(`[Vision LLM] Réponse: ${rawText.length} chars, tokens: ${tokensInput} in / ${tokensOutput} out`);
  }

  const data = parseVisionResponse(rawText);
  return { data, rawText, tokensInput, tokensOutput };
}

export async function extractWithVision(
  pdfBuffer: Buffer,
  pdfName: string = "unknown.pdf",
  existingDocAIData?: Partial<VisionFinancialData>
): Promise<VisionExtractionResult> {
  const startMs = Date.now();
  const mode = existingDocAIData ? "validateur+extracteur" : "extracteur seul";
  console.log(`[Vision LLM] Démarrage ${mode} — PDF: ${pdfName} (${Math.round(pdfBuffer.length / 1024)}KB)`);

  const systemPrompt = buildSystemPrompt(existingDocAIData);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let result: ClaudeCallResult;
    try {
      result = await callClaude(pdfBuffer, 1, systemPrompt);

      if (!result.data) {
        console.warn("[Vision LLM] Réponse JSON invalide, retry...");
        result = await callClaude(pdfBuffer, 2, systemPrompt);
      }
    } finally {
      clearTimeout(timeout);
    }

    const durationMs = Date.now() - startMs;

    if (!result.data) {
      const errorMsg = "Failed to parse Claude response after 2 attempts";
      console.error(`[Vision LLM] ERREUR: ${errorMsg}`);
      logVisionCall({
        timestamp: new Date().toISOString(),
        analysisId: "",
        pdfName,
        triggered: true,
        confidenceScoreBefore: 0,
        model: VISION_MODEL,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        error: errorMsg,
        durationMs
      });
      return { success: false, data: null, confidenceScore: 0, error: errorMsg, pagesAnalyzed: 0 };
    }

    const confidenceScore = computeConfidence(result.data);
    const success = confidenceScore >= MIN_CONFIDENCE;
    const filledFields = VISION_FIELDS.filter((f) => result.data![f] !== null && result.data![f] !== undefined);

    const haiku025In = 0.25 / 1_000_000;
    const haiku125Out = 1.25 / 1_000_000;
    const estimatedCost = result.tokensInput * haiku025In + result.tokensOutput * haiku125Out;

    console.log(
      `[Vision LLM] ${success ? "Succès" : "Échec"} — champs: ${filledFields.length}/${TOTAL_FIELDS} — score: ${confidenceScore} — coût: $${estimatedCost.toFixed(4)} — ${(durationMs / 1000).toFixed(1)}s`
    );

    logVisionCall({
      timestamp: new Date().toISOString(),
      analysisId: "",
      pdfName,
      triggered: true,
      confidenceScoreBefore: 0,
      confidenceScoreAfter: confidenceScore,
      pagesAnalyzed: 1,
      model: VISION_MODEL,
      fieldsFilledByVision: filledFields,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
      estimatedCost,
      durationMs
    });

    return { success, data: result.data, confidenceScore, pagesAnalyzed: 1 };
  } catch (error) {
    const durationMs = Date.now() - startMs;
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(`[Vision LLM] ERREUR: ${message}`);
    logVisionCall({
      timestamp: new Date().toISOString(),
      analysisId: "",
      pdfName,
      triggered: true,
      confidenceScoreBefore: 0,
      model: VISION_MODEL,
      error: message,
      errorStack: stack,
      durationMs
    });
    return { success: false, data: null, confidenceScore: 0, error: message, pagesAnalyzed: 0 };
  }
}

const VISION_TO_PARSED_MAP: Record<string, { section: "incomeStatement" | "balanceSheet"; field: string }> = {
  ca: { section: "incomeStatement", field: "netTurnover" },
  prod_vendue: { section: "incomeStatement", field: "productionSold" },
  ventes_march: { section: "incomeStatement", field: "salesGoods" },
  autres_prod_expl: { section: "incomeStatement", field: "otherOperatingIncome" },
  total_prod_expl: { section: "incomeStatement", field: "totalOperatingProducts" },
  ace: { section: "incomeStatement", field: "externalCharges" },
  salaires: { section: "incomeStatement", field: "wages" },
  charges_soc: { section: "incomeStatement", field: "socialCharges" },
  dap: { section: "incomeStatement", field: "depreciationAllocations" },
  dprov: { section: "incomeStatement", field: "provisionsAllocations" },
  impots_taxes: { section: "incomeStatement", field: "taxesAndLevies" },
  autres_charges_expl: { section: "incomeStatement", field: "otherOperatingCharges" },
  total_charges_expl: { section: "incomeStatement", field: "totalOperatingCharges" },
  charges_fin: { section: "incomeStatement", field: "financialCharges" },
  prod_fin: { section: "incomeStatement", field: "financialProducts" },
  prod_excep: { section: "incomeStatement", field: "exceptionalProducts" },
  charges_excep: { section: "incomeStatement", field: "exceptionalCharges" },
  is_impot: { section: "incomeStatement", field: "incomeTax" },
  resultat_net: { section: "incomeStatement", field: "netResult" },
  total_actif_immo: { section: "balanceSheet", field: "totalFixedAssets" },
  immob_incorp: { section: "balanceSheet", field: "intangibleAssets" },
  immob_corp: { section: "balanceSheet", field: "tangibleAssets" },
  immob_fin: { section: "balanceSheet", field: "financialAssets" },
  clients: { section: "balanceSheet", field: "tradeReceivables" },
  autres_creances: { section: "balanceSheet", field: "otherReceivables" },
  stocks_mp: { section: "balanceSheet", field: "rawMaterialInventories" },
  dispo: { section: "balanceSheet", field: "cashAndCashEquivalents" },
  vmp: { section: "balanceSheet", field: "marketableSecurities" },
  total_actif_circ: { section: "balanceSheet", field: "totalCurrentAssets" },
  total_actif: { section: "balanceSheet", field: "totalAssets" },
  total_cp: { section: "balanceSheet", field: "equity" },
  emprunts: { section: "balanceSheet", field: "borrowings" },
  fournisseurs: { section: "balanceSheet", field: "tradePayables" },
  dettes_fisc_soc: { section: "balanceSheet", field: "taxSocialPayables" },
  autres_dettes: { section: "balanceSheet", field: "otherDebts" },
  total_dettes: { section: "balanceSheet", field: "debts" }
};

export function mergeVisionWithDocumentAI(
  parsed: ParsedFinancialData,
  visionData: Partial<VisionFinancialData>,
  _fieldScores: Record<string, number>
): void {
  if (visionData.unite === "milliers_euros") {
    console.log("[vision-merge] Détection k€ : multiplication de toutes les valeurs par 1000");
    for (const key of VISION_FIELDS) {
      const val = visionData[key];
      if (typeof val === "number") {
        (visionData as Record<string, number | null>)[key] = val * 1000;
      }
    }
  }

  let filled = 0;
  let corrected = 0;
  for (const [visionKey, mapping] of Object.entries(VISION_TO_PARSED_MAP)) {
    const visionValue = visionData[visionKey as keyof VisionFinancialData];
    if (visionValue === null || visionValue === undefined) continue;
    if (typeof visionValue !== "number") continue;

    const { section, field } = mapping;
    const sectionData = parsed[section] as Record<string, number | null>;
    const currentValue = sectionData[field];

    if (currentValue === null || currentValue === undefined) {
      sectionData[field] = visionValue;
      filled++;
      console.log(`[vision-merge] ${field}: null → ${visionValue} (fill)`);
    } else {
      const ecart = Math.abs(visionValue - currentValue) / Math.max(Math.abs(currentValue), 1);
      if (ecart > 0.05) {
        console.log(`[vision-merge] ${field}: ${currentValue} → ${visionValue} (correction, écart ${(ecart * 100).toFixed(1)}%)`);
        sectionData[field] = visionValue;
        corrected++;
      }
    }
  }
  console.log(`[vision-merge] ${filled} remplis, ${corrected} corrigés par Vision LLM`);
}

export function buildExistingDataForVision(parsed: ParsedFinancialData): Partial<VisionFinancialData> {
  const result: Partial<VisionFinancialData> = {};
  for (const [visionKey, mapping] of Object.entries(VISION_TO_PARSED_MAP)) {
    const sectionData = parsed[mapping.section] as Record<string, number | null>;
    const val = sectionData[mapping.field];
    (result as Record<string, number | null>)[visionKey] = val ?? null;
  }
  return result;
}
