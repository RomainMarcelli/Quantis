// Dry-run du Parser V2 — aucun appel API, zéro crédit consommé.
// Usage : npx tsx scripts/test-v2-dry-run.mjs

import { buildLlmPrompt, computeConfidenceScore } from "../services/pdf-analysis/llmExtractor.ts";
import { mapLlmDataToMappedFinancialData } from "../services/pdf-analysis/llmDataMapper.ts";

const MOCK_RAW_TEXT = `Production vendue de services | 738 197 | 592 313
Chiffre d'affaires Net | 738 197 | 592 313
Autres achats et charges externes | 282 516 | 286 529
Salaires et traitements | 295 984 | 193 169
Charges sociales | 129 197 | 85 921
Dotations aux amortissements | 300 | 847
Total des charges d'exploitation | 717 168 | 574 555
RÉSULTAT NET | 25 924 | 18 649
TOTAL GÉNÉRAL ACTIF | 344 316 | 316 938
TOTAL CAPITAUX PROPRES | 253 847 | 231 094
TOTAL GÉNÉRAL PASSIF | 344 316 | 316 938`;

console.log("=== PARSER V2 DRY-RUN ===\n");

// 1. Générer le prompt
const { system, user } = buildLlmPrompt(MOCK_RAW_TEXT);

console.log("--- PROMPT SYSTÈME (premiers 500 chars) ---");
console.log(system.slice(0, 500) + "\n...\n");

console.log("--- PROMPT UTILISATEUR (complet) ---");
console.log(user);
console.log();

// 2. Estimation tokens
const totalPromptLength = system.length + user.length;
const estimatedTokens = Math.ceil(totalPromptLength / 4);
const estimatedOutputTokens = 800;

console.log("--- ESTIMATION TOKENS ---");
console.log(`Prompt total: ${totalPromptLength} chars → ~${estimatedTokens} tokens input`);
console.log(`Output estimé: ~${estimatedOutputTokens} tokens`);
console.log();

// 3. Estimation coûts
const haikuCostIn = 0.25 / 1_000_000;
const haikuCostOut = 1.25 / 1_000_000;
const sonnetCostIn = 3 / 1_000_000;
const sonnetCostOut = 15 / 1_000_000;

const haikuCost = estimatedTokens * haikuCostIn + estimatedOutputTokens * haikuCostOut;
const sonnetCost = estimatedTokens * sonnetCostIn + estimatedOutputTokens * sonnetCostOut;

console.log("--- ESTIMATION COÛTS ---");
console.log(`Haiku:  $${haikuCost.toFixed(4)} par analyse`);
console.log(`Sonnet: $${sonnetCost.toFixed(4)} par analyse`);
console.log(`100 PDFs Haiku:  $${(haikuCost * 100).toFixed(2)}`);
console.log(`100 PDFs Sonnet: $${(sonnetCost * 100).toFixed(2)}`);
console.log();

// 4. Simuler un résultat LLM
const mockLlmResult = {
  total_actif: 344316,
  total_passif: 344316,
  total_cp: 253847,
  resultat_exercice: 25924,
  prod_vendue: 738197,
  ace: 282516,
  salaires: 295984,
  charges_soc: 129197,
  dap: 300,
  total_charges_expl: 717168,
  total_prod_expl: 738197,
  unite: "euros"
};

const mapped = mapLlmDataToMappedFinancialData(mockLlmResult);
const score = computeConfidenceScore(mockLlmResult);

console.log("--- SIMULATION RÉSULTAT ---");
console.log(`Score confiance: ${score.toFixed(2)}`);
console.log(`CA (prod_vendue): ${mapped.prod_vendue}`);
console.log(`Résultat net: ${mapped.res_net}`);
console.log(`Total actif: ${mapped.total_actif}`);
console.log(`Total passif: ${mapped.total_passif}`);
console.log(`Bilan équilibré: ${mapped.total_actif === mapped.total_passif ? "✅" : "❌"}`);
console.log();

console.log("=== DRY-RUN TERMINÉ — aucun appel API effectué ===");
