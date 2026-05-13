# PARSER_STATUS.md — Vyzor PDF Parser

> Dernière mise à jour : 2026-04-13 (Lot 2)
> Branche active : `feature/parser`

---

## Vue d'ensemble

Le parser PDF Vyzor est un pipeline complet de bout en bout :

```
PDF Upload
 → Google Document AI (OCR + structure)
 → rowReconstruction   (lignes reconstruites)
 → fieldResolver        (matching + scoring candidats)
 → valueMapping         (ParsedFinancialData)
 → parsedFinancialDataBridge (MappedFinancialData)
 → kpiEngine            (CalculatedKpis)
 → financialMapping     (VyzorFinancialData — 6 champs critiques)
 → pdfAnalysisStore     (Firestore)
```

---

## Architecture des modules parser

| Module | Rôle |
|---|---|
| `services/documentAI.ts` | Appel Google Document AI, extraction rawText + pages + tables |
| `services/pdf-analysis/analysisEngine.ts` | Orchestrateur principal de l'analyse |
| `services/pdf-analysis/rowReconstruction.ts` | Reconstruction des lignes depuis rawText et tables Document AI |
| `services/pdf-analysis/labelDictionary.ts` | Dictionnaire des ~50 champs financiers (aliases, regex, lineCodes, stratégies) |
| `services/pdf-analysis/fieldResolver.ts` | Scoring et sélection des candidats pour chaque champ |
| `services/pdf-analysis/valueMapping.ts` | Hydratation `ParsedFinancialData` depuis les valeurs résolues |
| `services/pdf-analysis/amountParsing.ts` | Parsing des montants financiers (espaces, tirets, parenthèses…) |
| `services/pdf-analysis/diagnostics.ts` | Calcul confidence score, warnings, consistency checks |
| `services/mapping/parsedFinancialDataBridge.ts` | Bridge `ParsedFinancialData` → `MappedFinancialData` |
| `services/kpiEngine.ts` | Calcul des ~35 KPIs depuis `MappedFinancialData` |
| `services/financialMapping.ts` | Mapping `ParsedFinancialData` → `VyzorFinancialData` (6 champs) |
| `services/pdfAnalysisStore.ts` | Persistance Firestore |
| `app/api/pdf-parser/route.ts` | Route API Next.js (POST upload, GET historique/progress) |

---

## Champs critiques (validés sur PDF réel)

Ces 6 champs sont les plus importants pour Vyzor :

| Champ interne | Clé `ParsedFinancialData` | Statut |
|---|---|---|
| `ca` | `netTurnover` | ✅ Validé |
| `totalCharges` | `totalOperatingCharges` | ✅ Validé |
| `netResult` | `netResult` | ✅ Validé |
| `totalAssets` | `totalAssets` | ✅ Validé |
| `equity` | `equity` | ✅ Validé |
| `debts` | `debts` | ✅ Validé |

---

## État des champs par section

### Compte de résultat

| Clé `FinancialFieldKey` | Champ métier | Statut | Notes |
|---|---|---|---|
| `salesGoods` | Ventes de marchandises | ✅ Couvert | |
| `productionSoldGoods` | Production vendue biens | ✅ Couvert | |
| `productionSoldServices` | Production vendue services | ✅ Couvert | |
| `productionSold` | Production vendue (total) | ✅ Couvert | |
| `purchasesGoods` | Achats de marchandises | ✅ Couvert | |
| `stockVariationGoods` | Variation stocks march. | ✅ Couvert | Stratégie signedRightmost |
| `rawMaterialPurchases` | Achats matières premières | ✅ Couvert | |
| `stockVariationRawMaterials` | Variation stocks MP | ✅ Couvert | |
| `externalCharges` | Autres charges externes (ACE) | ✅ Couvert | |
| `taxesAndLevies` | Impôts et taxes | ✅ Couvert | |
| `wages` | Salaires | ✅ Couvert | |
| `socialCharges` | Charges sociales | ✅ Couvert | |
| `depreciationAllocations` | DAP (amortissements) | ✅ Couvert | |
| `provisionsAllocations` | Dotations provisions | ✅ Couvert | |
| `netTurnover` | CA net | ✅ Couvert — critique | |
| `otherOperatingIncome` | Autres produits d'exploitation | ✅ Couvert | |
| `otherOperatingCharges` | Autres charges d'exploitation | ✅ Couvert | |
| `financialProducts` | Produits financiers | ✅ Couvert | |
| `financialCharges` | Charges financières | ✅ Couvert | |
| `exceptionalProducts` | Produits exceptionnels | ✅ Couvert | |
| `exceptionalCharges` | Charges exceptionnelles | ✅ Couvert | |
| `incomeTax` | IS / Impôt bénéfices | ✅ Couvert | |
| `totalOperatingProducts` | Total produits exploitation | ✅ Couvert | |
| `totalOperatingCharges` | Total charges exploitation | ✅ Couvert — critique | |
| `operatingResult` | Résultat d'exploitation | ✅ Couvert | |
| `financialResult` | Résultat financier | ✅ Couvert | |
| `ordinaryResultBeforeTax` | Résultat courant avant IS | ✅ Couvert | |
| `exceptionalResult` | Résultat exceptionnel | ✅ Couvert | |
| `totalProducts` | Total produits | ✅ Couvert | |
| `totalCharges` | Total charges | ✅ Couvert | |
| `netResult` | Résultat net | ✅ Couvert — critique | |
| `netTurnoverPreviousYear` | CA N-1 | ✅ Couvert (Lot 2) | Stratégie nMinus1 — débloque tcam |
| `productionStored` | Production stockée | ✅ Couvert (Lot 2) | Stratégie signedRightmost |
| `productionCapitalized` | Production immobilisée | ✅ Couvert (Lot 2) | |
| `operatingSubsidies` | Subventions d'exploitation | ✅ Couvert (Lot 2) | |

### Bilan Actif

| Clé `FinancialFieldKey` | Champ métier | Statut | Notes |
|---|---|---|---|
| `intangibleAssets` | Immo. incorporelles | ✅ Couvert | |
| `tangibleAssets` | Immo. corporelles | ✅ Couvert | |
| `financialAssets` | Immo. financières | ✅ Couvert | |
| `totalFixedAssetsGross` | Total actif immobilisé brut | ✅ Couvert | |
| `totalFixedAssets` | Total actif immobilisé net | ✅ Couvert | |
| `totalCurrentAssets` | Total actif circulant | ✅ Couvert | |
| `rawMaterialInventories` | Stocks matières premières | ✅ Couvert | |
| `inventoriesGoods` | Stocks marchandises | ✅ Couvert | |
| `advancesAndPrepaymentsAssets` | Avances versées actif | ✅ Couvert | |
| `tradeReceivables` | Créances clients | ✅ Couvert | |
| `otherReceivables` | Autres créances | ✅ Couvert | Récemment validé Lot 1 |
| `marketableSecurities` | VMP | ✅ Couvert | |
| `cashAndCashEquivalents` | Disponibilités | ✅ Couvert | |
| `prepaidExpenses` | Charges constatées d'avance | ✅ Couvert | |
| `totalAssets` | Total actif | ✅ Couvert — critique | |

### Bilan Passif

| Clé `FinancialFieldKey` | Champ métier | Statut | Notes |
|---|---|---|---|
| `equity` | Capitaux propres | ✅ Couvert — critique | |
| `shareCapital` | Capital social | ✅ Couvert (Lot 2) | Code ligne 120 |
| `revaluationDifferences` | Écarts de réévaluation | ✅ Couvert (Lot 2) | Code ligne 124 |
| `legalReserves` | Réserve légale | ✅ Couvert (Lot 2) | Code ligne 126 |
| `regulatoryReserves` | Réserves réglementées | ✅ Couvert (Lot 2) | Code ligne 130 |
| `otherReserves` | Autres réserves | ✅ Couvert (Lot 2) | Code ligne 132 |
| `retainedEarnings` | Report à nouveau | ✅ Couvert (Lot 2) | Code ligne 134 — peut être négatif |
| `investmentSubsidies` | Subventions d'investissement | ✅ Couvert (Lot 2) | Code ligne 137 |
| `regulatoryProvisions` | Provisions réglementées | ✅ Couvert (Lot 2) | Code ligne 140 |
| `provisions` | Provisions risques/charges | ✅ Couvert | |
| `borrowings` | Emprunts | ✅ Couvert | |
| `debts` | Total dettes | ✅ Couvert — critique | |
| `advancesAndPrepaymentsLiabilities` | Avances reçues passif | ✅ Couvert | |
| `tradePayables` | Dettes fournisseurs | ✅ Couvert | |
| `taxSocialPayables` | Dettes fiscales et sociales | ✅ Couvert | Validé Lot 1 |
| `associatesCurrentAccounts` | Comptes courants d'associés | ✅ Couvert (Lot 2) | Code ligne 173 |
| `otherDebts` | Autres dettes | ✅ Couvert | |
| `deferredIncome` | Produits constatés d'avance | ✅ Couvert | |
| `totalLiabilities` | Total passif | ✅ Couvert | |
| `totalAssetDepreciationProvisions` | Total amortissements/provisions | ✅ Couvert | |
| `shortTermBankDebt` | Concours bancaires court terme | ✅ Couvert | |
| `longTermBankDebt` | Dettes bancaires long terme | ✅ Couvert | |

---

## Champs `MappedFinancialData` non alimentés par le parser

Ces champs existent dans `MappedFinancialData` mais ne sont pas mappés depuis `ParsedFinancialData` :

| Champ | Raison |
|---|---|
| `delta_bfr` | Variation BFR — nécessite 2 exercices (calculé par kpiHistoryEngine) |

> **Lot 2 terminé** : tous les sous-détails des capitaux propres (`capital`, `ecarts_reeval`, `reserve_legale`, `reserves_reglem`, `autres_reserves`, `ran`, `subv_invest`, `prov_reglem`), les lignes compte de résultat manquantes (`prod_stockee`, `prod_immo`, `subv_expl`), le CA N-1 (`ca_n_minus_1`) et les comptes courants d'associés (`cca_passif`) sont maintenant extraits.

---

## KPIs bloqués et leurs dépendances

Voir `PARSER_KPI_COVERAGE.md` pour le détail.

---

## Points de fragilité connus

1. **Stratégie `nCurrent` sur compte de résultat** : La détection N vs N-1 repose sur les en-têtes de colonnes. Si Document AI ne détecte pas les en-têtes de tableau correctement, `chooseLikelyIncomeStatementCurrentCandidate` peut sélectionner la mauvaise colonne.

2. **`productionSold` vs `salesGoods`** : La fonction `sanitizeProductionSold` dans le bridge peut annuler une valeur correcte si elle dépasse 115% du CA. À surveiller sur les sociétés de production.

3. **Détection de section** : `inferSectionFromLine` repose sur des mots-clés. Un PDF avec une structure non standard peut mal classifier les lignes.

4. **Progress store en mémoire** : `pdfParserProgressStore.ts` est en-mémoire process-local. En cas de redémarrage Vercel ou multi-instance, le polling peut perdre le contexte.

5. **Limit PDF 15 pages** : Document AI limite le nombre de pages. Les liasses fiscales complètes peuvent dépasser cette limite.

---

## Tests existants

| Fichier | Niveau | Couverture |
|---|---|---|
| `services/pdfParserLot1Consolidation.test.ts` | Unitaire (integration) | Lot 1 : ACE, dettes_fisc_soc, autres_creances, BFR, DPO |
| `services/live-parser-debug.test.ts` | Live (nécessite PDF réel) | Debug sur PDF réel |
| `services/live-priority-fields-debug.test.ts` | Live (nécessite PDF réel) | Champs prioritaires |
| `app/pdf-parser-test/parserDiagnosticExport.test.ts` | Unitaire | Export diagnostic |
| `services/pdfAnalysis.test.ts` | Unitaire | analysisEngine |
| `services/financialMapping.test.ts` | Unitaire | financialMapping |
| `services/kpiEngine.test.ts` | Unitaire | kpiEngine |
| `services/mapping/parsedFinancialDataBridge.test.ts` | Unitaire | bridge |
| `services/pdfParserLot2Consolidation.test.ts` | Unitaire (Lot 2) | CA N-1 + tcam, capitaux propres sub-fields, compte de résultat manquants |
