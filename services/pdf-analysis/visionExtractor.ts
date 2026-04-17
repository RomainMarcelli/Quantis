import Anthropic from "@anthropic-ai/sdk";
import type { ParsedFinancialData } from "@/services/pdf-analysis/types";

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

const SYSTEM_PROMPT = `Tu es un expert-comptable français spécialisé dans l'analyse de liasses fiscales.
Analyse ces pages de document financier et extrais UNIQUEMENT les valeurs numériques demandées.

DÉTECTION UNITÉ MONÉTAIRE (CRITIQUE) :
- Lis attentivement l'en-tête du document pour détecter l'unité
- Si tu vois "en milliers d'euros", "en k€", "K€", "montants exprimés en milliers"
  → multiplier TOUTES les valeurs numériques par 1000 avant de les retourner
- Si tu vois "en euros", "€" sans mention de milliers → valeurs directes
- Si non précisé → cherche un indice (ex: CA = 8 145 avec totalAssets = 7 773
  alors que l'entreprise est grande → probablement en k€)
- Indique dans le champ "unite": "euros" ou "milliers_euros"

FORMATS RECONNUS :
- Formulaire 2050-SD (bilan actif) : cherche "TOTAL GÉNÉRAL" ligne 110
- Formulaire 2051-SD (bilan passif) : cherche "TOTAL GÉNÉRAL" ligne 180
- Formulaire 2052-SD (CDR) : cherche "BÉNÉFICE OU PERTE" ligne 310
- Formulaire 2033-SD (simplifié) : cherche totaux lignes 096, 110, 180, 232, 264, 310
- Format Sage/Cegid : cherche "TOTAL GÉNÉRAL" dans tableau à 4 colonnes (Brut/Amort/Net N/Net N-1)
- Format Regnology : cherche tableaux avec colonnes N et N-1 séparées

RÈGLES ABSOLUES :
- Prendre TOUJOURS la colonne N (exercice courant), jamais N-1
- Les valeurs entre parenthèses sont NÉGATIVES : (10 021) = -10021
- Espaces dans les nombres sont des séparateurs de milliers : "1 173 877" = 1173877
- Ne jamais inventer une valeur — null si absent ou illisible
- Retourne UNIQUEMENT un objet JSON valide, sans texte avant ou après

Retourne exactement ce JSON (remplace les valeurs) :
{
  "unite": null,
  "ca": null,
  "prod_vendue": null,
  "ventes_march": null,
  "autres_prod_expl": null,
  "total_prod_expl": null,
  "ace": null,
  "salaires": null,
  "charges_soc": null,
  "dap": null,
  "dprov": null,
  "impots_taxes": null,
  "autres_charges_expl": null,
  "total_charges_expl": null,
  "charges_fin": null,
  "prod_fin": null,
  "prod_excep": null,
  "charges_excep": null,
  "is_impot": null,
  "resultat_net": null,
  "total_actif_immo": null,
  "immob_incorp": null,
  "immob_corp": null,
  "immob_fin": null,
  "clients": null,
  "autres_creances": null,
  "stocks_mp": null,
  "dispo": null,
  "vmp": null,
  "total_actif_circ": null,
  "total_actif": null,
  "total_cp": null,
  "emprunts": null,
  "fournisseurs": null,
  "dettes_fisc_soc": null,
  "autres_dettes": null,
  "total_dettes": null
}`;

const TIMEOUT_MS = 60_000;
const MIN_CONFIDENCE = 0.5;

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

async function callClaude(
  pdfBuffer: Buffer,
  attempt: number
): Promise<{ data: Partial<VisionFinancialData> | null; rawText: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey });
  const content = buildPdfContent(pdfBuffer);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }]
  });

  const rawText = response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (attempt <= 1) {
    console.log(`[vision-llm] Claude response length: ${rawText.length} chars`);
  }

  const data = parseVisionResponse(rawText);
  return { data, rawText };
}

export async function extractWithVision(
  pdfBuffer: Buffer
): Promise<VisionExtractionResult> {
  try {
    console.log(`[vision-llm] Sending PDF to Claude (${Math.round(pdfBuffer.length / 1024)}KB)...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let result: { data: Partial<VisionFinancialData> | null; rawText: string };
    try {
      result = await callClaude(pdfBuffer, 1);

      if (!result.data) {
        console.warn("[vision-llm] Invalid JSON response, retrying...");
        result = await callClaude(pdfBuffer, 2);
      }
    } finally {
      clearTimeout(timeout);
    }

    if (!result.data) {
      return {
        success: false,
        data: null,
        confidenceScore: 0,
        error: "Failed to parse Claude response after 2 attempts",
        pagesAnalyzed: 0
      };
    }

    const confidenceScore = computeConfidence(result.data);
    const success = confidenceScore >= MIN_CONFIDENCE;

    console.log(
      `[vision-llm] Extraction ${success ? "OK" : "FAILED"}: ${Math.round(confidenceScore * TOTAL_FIELDS)}/${TOTAL_FIELDS} fields, score ${confidenceScore}`
    );

    return {
      success,
      data: result.data,
      confidenceScore,
      pagesAnalyzed: 1
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[vision-llm] Extraction failed:", message);
    return {
      success: false,
      data: null,
      confidenceScore: 0,
      error: message,
      pagesAnalyzed: 0
    };
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
  for (const [visionKey, mapping] of Object.entries(VISION_TO_PARSED_MAP)) {
    const visionValue = visionData[visionKey as keyof VisionFinancialData];
    if (visionValue === null || visionValue === undefined) continue;

    const { section, field } = mapping;
    const sectionData = parsed[section] as Record<string, number | null>;
    const currentValue = sectionData[field];

    if (currentValue === null || currentValue === undefined) {
      sectionData[field] = visionValue;
      filled++;
      console.log(`[vision-merge] ${field}: null → ${visionValue} (vision fill)`);
    }
  }
  console.log(`[vision-merge] ${filled} champs remplis par Vision LLM`);
}
