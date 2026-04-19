import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import type { MappedFinancialData } from "@/types/analysis";
import { logVisionCall } from "@/services/pdf-analysis/visionLogger";

export interface ClaudeVisionResult {
  success: boolean;
  data: Partial<MappedFinancialData> | null;
  confidenceScore: number;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCost: number;
  durationMs: number;
  pagesAnalyzed: number;
  fiscalYear: number | null;
  error?: string;
}

const VISION_MODEL = "claude-haiku-4-5-20251001";
const VISION_MODEL_FALLBACK = "claude-sonnet-4-5";
const CONFIDENCE_THRESHOLD = 0.75;
const MAX_PAGES = 15;

const SYSTEM_PROMPT = `Tu es un expert-comptable français spécialisé dans l'analyse de liasses fiscales.
Tu reçois un document comptable français (bilan, compte de résultat, annexes).
Tu dois extraire exactement les champs financiers listés et retourner UNIQUEMENT un JSON valide.

━━━ RÈGLE 1 — FORMAT DE SORTIE ━━━
- Retourner UNIQUEMENT du JSON valide, aucun texte avant ou après, aucun bloc \`\`\`json
- null si un champ est absent ou illisible — jamais inventer une valeur
- Jamais confondre un numéro de compte PCG (ex: 10610100) avec une valeur financière

━━━ RÈGLE 2 — LECTURE DES NOMBRES ━━━
- Les espaces sont des séparateurs de milliers : "16 047 882" = 16047882 — UN seul nombre
- Les points français sont aussi des séparateurs : "16.047.882" = 16047882
- Les virgules sont décimales : "1 173,88" = 1173.88 (arrondir à l'entier)
- Ne jamais couper un nombre à un espace — "16 047 882" n'est pas "16 047" + "882"
- Les valeurs entre parenthèses sont NÉGATIVES : (10 021) = -10021

━━━ RÈGLE 3 — MILLIERS D'EUROS ━━━
- Si le document mentionne "en milliers d'euros", "en K€", "en milliers €", "(en milliers)", "milliers" → retourner "unite": "milliers_euros"
- Si "unite" = "milliers_euros" → retourner les valeurs TELLES QUELLES depuis le document, sans multiplication
- Le système multipliera automatiquement par 1000
- Exemple : document dit "en milliers" et montre "125 645" → retourner 125645 (pas 125645000)
- Vérification : si total_actif > 500 000 000 pour une PME → probablement une erreur, revérifier si le doc est en milliers

━━━ RÈGLE 4 — COLONNES ET EXERCICES ━━━
- Prendre TOUJOURS la colonne N (exercice courant), jamais N-1 (exercice précédent)
- La colonne N est généralement à gauche, N-1 à droite
- Certains CDR ont 3 colonnes : France | Exportation | Total → prendre TOUJOURS la colonne "Total"
- Si tu vois France=1 604 788 et Total=16 047 882 → prendre 16 047 882
- Chercher TOUJOURS la ligne de TOTAL, jamais une sous-ligne ou un composant

━━━ RÈGLE 5 — CHIFFRE D'AFFAIRES ━━━
- Le CA net = ligne "Chiffre d'affaires nets" ou "CHIFFRE D'AFFAIRES NET" uniquement
- Ne jamais prendre une ligne de ventilation géographique (France, Export) sauf si c'est le seul CA disponible
- Ne jamais prendre les flux internes d'une holding comme CA
- Vérification : CA doit être entre 0.05x et 20x le total bilan pour être cohérent

━━━ RÈGLE 6 — ANNÉE FISCALE ━━━
- Extraire l'année fiscale depuis "exercice clos le JJ/MM/AAAA" → retourner AAAA
- Si exercice décalé (ex: "01/04/2023 au 31/03/2024") → retourner 2024 (année de clôture)
- Chercher aussi : "au 31/12/2024", "période du... au...", "exercice 2024"
- Ne jamais retourner null si une date de clôture est visible dans le document

━━━ RÈGLE 7 — CHAMPS SPÉCIFIQUES ━━━
- dispo = ligne "Disponibilités" uniquement — jamais total_actif_circ
- cca = ligne "Charges constatées d'avance" uniquement — jamais total_actif_circ
- dap = ligne "Dotations aux amortissements" uniquement — jamais dprov
- dprov = ligne "Dotations aux provisions" uniquement — jamais dap
- subv_expl = ligne "Subventions d'exploitation" — ne pas confondre avec prod_immo
- total_cp = ligne "TOTAL CAPITAUX PROPRES" ou "TOTAL ( I )" au passif

━━━ RÈGLE 8 — CHAMPS BILAN ACTIF CIRCULANT ━━━
Ordre exact des lignes dans le bilan actif circulant :
- stocks_march = ligne "Marchandises" ou "Stocks de marchandises"
- clients = ligne "Clients et comptes rattachés"
- autres_creances = ligne "Autres créances"
- vmp = ligne "Valeurs mobilières de placement" ou "VMP" — ne jamais null si présent
- dispo = ligne "Disponibilités" — ne jamais confondre avec VMP
- cca = ligne "Charges constatées d'avance" — toujours la dernière ligne avant total
- total_actif_circ = ligne "TOTAL ACTIF CIRCULANT" ou "TOTAL ( II )"
Ces champs sont TOUJOURS distincts — ne jamais mettre la même valeur dans deux champs

━━━ RÈGLE 9 — CA N-1 ━━━
- ca_n_minus_1 = CA de l'exercice précédent, colonne N-1 sur la ligne "Chiffre d'affaires nets"
- Toujours présent si le document a une colonne N-1
- Ne jamais retourner null si une colonne N-1 est visible

━━━ FORMATS RECONNUS ━━━
- Formulaire 2050-SD (bilan actif) : TOTAL GÉNÉRAL ligne 110
- Formulaire 2051-SD (bilan passif) : TOTAL GÉNÉRAL ligne 180
- Formulaire 2052-SD (CDR) : BÉNÉFICE OU PERTE ligne 310
- Formulaire 2033-SD (simplifié) : totaux lignes 096, 110, 180, 232, 264, 310
- Format Sage/Cegid : tableau 4 colonnes Brut/Amort/Net N/Net N-1
- Format Regnology : tableaux N et N-1 séparés
- Format balance générale : numéros de compte + libellé + montant
- Format scanné : lire visuellement les tableaux même sans texte structuré
- Format en milliers : "(en milliers d'euros)" en en-tête du tableau

━━━ CHAMPS À EXTRAIRE ━━━
{
  "fiscal_year": null,
  "unite": "euros",
  "immob_incorp": null, "immob_corp": null, "immob_fin": null,
  "total_actif_immo": null,
  "stocks_mp": null, "stocks_march": null, "total_stocks": null,
  "clients": null, "autres_creances": null, "vmp": null, "dispo": null, "cca": null,
  "total_actif_circ": null, "total_actif": null,
  "capital": null, "reserve_legale": null, "autres_reserves": null, "ran": null,
  "res_net": null, "total_cp": null, "total_prov": null,
  "emprunts": null, "fournisseurs": null, "dettes_fisc_soc": null,
  "autres_dettes": null, "total_dettes": null, "total_passif": null,
  "ventes_march": null, "prod_vendue": null, "prod_stockee": null, "prod_immo": null,
  "subv_expl": null, "autres_prod_expl": null, "total_prod_expl": null,
  "prod_fin": null, "prod_excep": null,
  "achats_march": null, "var_stock_march": null, "achats_mp": null, "var_stock_mp": null,
  "ace": null, "impots_taxes": null, "salaires": null, "charges_soc": null,
  "dap": null, "dprov": null, "autres_charges_expl": null, "total_charges_expl": null,
  "charges_fin": null, "charges_excep": null, "is_impot": null,
  "ebit": null, "resultat_exercice": null, "ca_n_minus_1": null
}`;

const MAPPED_FIELDS = [
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

export function computeConfidenceScore(data: Record<string, unknown>): number {
  const critical = ["total_actif", "total_passif", "total_cp", "resultat_exercice", "total_prod_expl", "total_charges_expl"];
  const important = ["ventes_march", "prod_vendue", "ace", "salaires", "charges_soc", "dap", "fournisseurs", "emprunts"];

  const criticalScore = critical.filter((f) => data[f] !== null && data[f] !== undefined).length / critical.length;
  const importantScore = important.filter((f) => data[f] !== null && data[f] !== undefined).length / important.length;

  return criticalScore * 0.7 + importantScore * 0.3;
}

async function reducePdf(pdfBuffer: Buffer): Promise<{ buffer: Buffer; totalPages: number; keptPages: number }> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = srcDoc.getPageCount();

  if (totalPages <= MAX_PAGES) {
    console.log(`[Vision] Pages: toutes (${totalPages}p <= ${MAX_PAGES} max)`);
    return { buffer: pdfBuffer, totalPages, keptPages: totalPages };
  }

  const start = Math.max(0, Math.floor(totalPages * 0.08));
  const end = Math.min(totalPages, start + MAX_PAGES);
  console.log(`[Vision] Pages sélectionnées: start=${start + 1} end=${end} total=${totalPages}`);
  const indices = Array.from({ length: end - start }, (_, i) => start + i);

  const newDoc = await PDFDocument.create();
  const copied = await newDoc.copyPages(srcDoc, indices);
  for (const page of copied) newDoc.addPage(page);

  return {
    buffer: Buffer.from(await newDoc.save()),
    totalPages,
    keptPages: indices.length
  };
}

export function parseResponse(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed !== "object" || parsed === null) return null;

    const result: Record<string, unknown> = {};
    const unite = parsed.unite;
    result.unite = (unite === "euros" || unite === "milliers_euros") ? unite : null;
    const fy = parsed.fiscal_year;
    if (typeof fy === "number" && Number.isFinite(fy)) {
      result.fiscal_year = fy;
    } else if (typeof fy === "string") {
      const parsedFy = parseInt(fy, 10);
      result.fiscal_year = Number.isFinite(parsedFy) && parsedFy > 1900 && parsedFy < 2100 ? parsedFy : null;
    } else {
      result.fiscal_year = null;
    }

    for (const field of MAPPED_FIELDS) {
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
    return result;
  } catch {
    return null;
  }
}

export function applyUniteMultiplier(data: Record<string, unknown>): Record<string, unknown> {
  if (data.unite !== "milliers_euros") return data;

  const totalActif = typeof data.total_actif === "number" ? data.total_actif : 0;
  if (totalActif > 1_000_000_000) {
    console.warn("[Vision] Double multiplication détectée — skip ×1000");
    return data;
  }

  console.log("[Vision] Détection k€ : ×1000");
  const result = { ...data };
  for (const field of MAPPED_FIELDS) {
    if (typeof result[field] === "number") {
      result[field] = (result[field] as number) * 1000;
    }
  }
  return result;
}

function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  if (model === VISION_MODEL) {
    return tokensIn * (0.25 / 1_000_000) + tokensOut * (1.25 / 1_000_000);
  }
  return tokensIn * (3 / 1_000_000) + tokensOut * (15 / 1_000_000);
}

async function callVision(
  pdfBuffer: Buffer,
  model: string
): Promise<{ data: Record<string, unknown> | null; tokensInput: number; tokensOutput: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [
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
          text: "Extrais tous les champs financiers de ce document et retourne le JSON."
        }
      ]
    }]
  });

  const rawText = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  console.log("[Vision RAW] Réponse brute Claude (500 premiers chars):", rawText.substring(0, 500));

  return {
    data: parseResponse(rawText),
    tokensInput: response.usage?.input_tokens ?? 0,
    tokensOutput: response.usage?.output_tokens ?? 0
  };
}

export async function extractFinancialsFromPdf(
  pdfBuffer: Buffer,
  pdfName: string
): Promise<ClaudeVisionResult> {
  const startMs = Date.now();

  try {
    const { buffer, totalPages, keptPages } = await reducePdf(pdfBuffer);
    console.log(`[Vision] ${pdfName} — ${totalPages}p → ${keptPages}p — ${Math.round(buffer.length / 1024)}KB`);

    let totalIn = 0;
    let totalOut = 0;
    let usedModel = VISION_MODEL;

    const haikuResult = await callVision(buffer, VISION_MODEL);
    totalIn += haikuResult.tokensInput;
    totalOut += haikuResult.tokensOutput;

    let data = haikuResult.data;
    let confidenceScore = data ? computeConfidenceScore(data) : 0;

    if (confidenceScore < CONFIDENCE_THRESHOLD && data) {
      console.log(`[Vision] Haiku score ${confidenceScore.toFixed(2)} < ${CONFIDENCE_THRESHOLD} → Sonnet`);
      usedModel = VISION_MODEL_FALLBACK;
      const sonnetResult = await callVision(buffer, VISION_MODEL_FALLBACK);
      totalIn += sonnetResult.tokensInput;
      totalOut += sonnetResult.tokensOutput;

      if (sonnetResult.data) {
        const sonnetScore = computeConfidenceScore(sonnetResult.data);
        if (sonnetScore > confidenceScore) {
          data = sonnetResult.data;
          confidenceScore = sonnetScore;
          console.log(`[Vision] Sonnet score ${sonnetScore.toFixed(2)} → adopté`);
        }
      }
    }

    const durationMs = Date.now() - startMs;
    const cost = estimateCost(VISION_MODEL, haikuResult.tokensInput, haikuResult.tokensOutput) +
      (usedModel === VISION_MODEL_FALLBACK
        ? estimateCost(VISION_MODEL_FALLBACK, totalIn - haikuResult.tokensInput, totalOut - haikuResult.tokensOutput)
        : 0);

    if (!data) {
      console.error("[Vision] Échec — aucune donnée parsée");
      return {
        success: false, data: null, confidenceScore: 0,
        model: usedModel, tokensInput: totalIn, tokensOutput: totalOut,
        estimatedCost: cost, durationMs, pagesAnalyzed: keptPages,
        fiscalYear: null, error: "Failed to parse response"
      };
    }

    const extractedFiscalYear = typeof data.fiscal_year === "number" ? data.fiscal_year : null;
    const mapped = applyUniteMultiplier(data) as Partial<MappedFinancialData>;
    const success = confidenceScore >= 0.4;
    const filledCount = MAPPED_FIELDS.filter((f) => mapped[f as keyof MappedFinancialData] !== null && mapped[f as keyof MappedFinancialData] !== undefined).length;

    console.log(`[Vision] ${success ? "OK" : "Score insuffisant"} — ${filledCount}/${MAPPED_FIELDS.length} — score: ${confidenceScore.toFixed(2)} — ${usedModel.includes("haiku") ? "haiku" : "sonnet"} — $${cost.toFixed(4)} — ${(durationMs / 1000).toFixed(1)}s — fiscal_year: ${extractedFiscalYear}`);

    logVisionCall({
      timestamp: new Date().toISOString(),
      analysisId: "pipeline-vision",
      pdfName,
      triggered: true,
      confidenceScoreBefore: 0,
      confidenceScoreAfter: confidenceScore,
      pagesAnalyzed: keptPages,
      model: usedModel,
      tokensInput: totalIn,
      tokensOutput: totalOut,
      estimatedCost: cost,
      durationMs
    });

    return {
      success, data: mapped, confidenceScore,
      model: usedModel, tokensInput: totalIn, tokensOutput: totalOut,
      estimatedCost: cost, durationMs, pagesAnalyzed: keptPages,
      fiscalYear: extractedFiscalYear
    };
  } catch (error) {
    const durationMs = Date.now() - startMs;
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Vision] ERREUR: ${message}`);
    return {
      success: false, data: null, confidenceScore: 0,
      model: VISION_MODEL, tokensInput: 0, tokensOutput: 0,
      estimatedCost: 0, durationMs, pagesAnalyzed: 0,
      fiscalYear: null, error: message
    };
  }
}
