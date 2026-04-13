# PARSER_ROADMAP.md — Feuille de route parser Quantis

> Dernière mise à jour : 2026-04-13

---

## Principe

Ce fichier suit les lots de travail planifiés, en cours et terminés.  
Chaque lot a un objectif clair, une liste de champs / KPIs ciblés, et un statut.

---

## Lot 1 — Champs prioritaires de base ✅ TERMINÉ

**Objectif** : valider les 6 champs critiques et débloquer BFR + DPO

**Réalisations** :
- ✅ `ca` (netTurnover)
- ✅ `totalCharges` (totalOperatingCharges)
- ✅ `netResult`
- ✅ `totalAssets`
- ✅ `equity`
- ✅ `debts`
- ✅ `autres_creances` (otherReceivables)
- ✅ `dettes_fisc_soc` (taxSocialPayables)
- ✅ BFR débloqué
- ✅ DPO débloqué
- ✅ Test de consolidation `pdfParserLot1Consolidation.test.ts`

---

## Lot 2 — Enrichissement champs manquants (EN COURS)

**Objectif** : couvrir les champs `MappedFinancialData` non encore alimentés par le parser

### Priorité haute

| Champ | Clé parser à créer | Section | Notes |
|---|---|---|---|
| `ca_n_minus_1` | `netTurnoverPreviousYear` | incomeStatement | Débloque `tcam` |
| `prod_stockee` | `productionStored` | incomeStatement | Production stockée |
| `prod_immo` | `productionCapitalized` | incomeStatement | Production immobilisée |
| `subv_expl` | `operatingSubsidies` | incomeStatement | Subventions exploitation |

### Priorité moyenne

| Champ | Clé parser à créer | Section | Notes |
|---|---|---|---|
| `ran` | `retainedEarnings` | balanceSheet | Report à nouveau |
| `capital` | `shareCapital` | balanceSheet | Capital social |
| `reserve_legale` | `legalReserves` | balanceSheet | Réserve légale |
| `autres_reserves` | `otherReserves` | balanceSheet | Autres réserves |
| `subv_invest` | `investmentSubsidies` | balanceSheet | Subv. investissement |

### Priorité basse

| Champ | Clé parser à créer | Section | Notes |
|---|---|---|---|
| `prov_reglem` | `regulatoryProvisions` | balanceSheet | Provisions réglementées |
| `ecarts_reeval` | `revaluationDifferences` | balanceSheet | Écarts de réévaluation |
| `reserves_reglem` | `regulatoryReserves` | balanceSheet | Réserves réglementées |
| `cca_passif` | déjà via `prepaidExpenses` passif ? | balanceSheet | À clarifier |

---

## Lot 3 — Extraction N-1 et comparaison exercices

**Objectif** : extraire les valeurs N-1 pour permettre TCAM et comparaisons

**Actions** :
- Ajouter `netTurnoverPreviousYear` avec `columnStrategy: "nMinus1"` dans `labelDictionary.ts`
- Mapper vers `ca_n_minus_1` dans `parsedFinancialDataBridge.ts`
- Ajouter les autres champs N-1 si nécessaire (résultat net, charges…)
- Débloquer le KPI `tcam`

---

## Lot 4 — Robustesse et qualité parsing

**Objectif** : améliorer la robustesse sur les PDFs structurés différemment

**Actions** :
- Améliorer la détection des en-têtes de colonnes dans `rowReconstruction.ts`
- Gérer les PDF sans en-têtes de tableau explicites (inférence de colonnes N/N-1 par position)
- Améliorer la résistance aux lignes de sous-total vs total
- Traiter les PDF > 15 pages (batch / async à moyen terme)

---

## Lot 5 — Alignement complet sur Quantis_Mapping_2033SD.xlsx

**Objectif** : aligner 100% du parser sur la source de vérité métier

**Actions** :
- Lire et analyser toutes les variables sources du fichier Excel
- Identifier les variables non encore couvertes
- Ajouter les champs manquants dans `labelDictionary.ts`
- Valider sur le PDF réel de test

---

## Décisions architecturales importantes

### Pourquoi deux representations des données ?

Il existe 3 types de structures de données dans le pipeline :
1. `ParsedFinancialData` — structure "parser", organisée par section (incomeStatement / balanceSheet), champs typés avec noms anglais explicites
2. `MappedFinancialData` — structure "Quantis métier", champs courts (ex: `ventes_march`, `ace`), alignée sur le fichier Excel
3. `QuantisFinancialData` — structure "résumé" avec les 6 champs critiques pour l'UI de base

**Décision** : conserver les 3 niveaux. `ParsedFinancialData` est le contrat du parser, `MappedFinancialData` est le contrat métier Quantis, `QuantisFinancialData` est le contrat UI.

### Pas de mode "force filling"

Les valeurs null restent null si le parser ne trouve pas le champ. Pas de valeurs par défaut arbitraires. Les KPIs bloqués sont retournés avec `null` et signalés dans les diagnostics.

### Source de vérité métier

Le fichier `Quantis_Mapping_2033SD.xlsx` est la référence pour les formules KPI et les correspondances de champs. Toute extension du parser doit être validée contre ce fichier.
