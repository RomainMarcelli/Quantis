# PARSER_DECISIONS.md
> Log des décisions techniques et produit sur le parser Vyzor

---

## DEC-001 — null justifié > faux chiffre
**Date** : antérieur au 2026-04-13
**Décision** : le parser retourne `null` (avec justification) quand un champ ne peut être extrait avec confiance, plutôt qu'une valeur approximative ou forcée.
**Raison** : un faux chiffre dans un KPI financier est pire qu'un champ vide. L'utilisateur doit pouvoir faire confiance aux données affichées.
**Impact** : les KPI dépendants sont marqués "bloqués" avec leur raison → transparence totale.

---

## DEC-002 — Google Document AI avant Mistral OCR
**Date** : antérieur au 2026-04-13
**Décision** : utiliser Google Document AI comme OCR principal. Ne pas basculer sur Mistral maintenant.
**Raison** : Google DocAI est déjà en place et fonctionne. Changer d'OCR avant d'avoir stabilisé la couche métier serait une source de régression sans bénéfice prouvé.
**Réévaluation** : prévu en Lot 6, après stabilisation des lots 1-4.

---

## DEC-003 — Traitement synchrone pour PDF ≤ 30 pages
**Date** : antérieur au 2026-04-13
**Décision** : conserver le mode synchrone pour les PDF courts. Retourner une erreur lisible pour les PDF > ~30 pages.
**Raison** : mode async non encore implémenté. L'erreur propre est préférable à un timeout opaque.
**Réévaluation** : prévu en Lot 5.

---

## DEC-004 — Source de vérité métier = Quantis_Mapping_2033SD.xlsx
**Date** : 2026-04-13
**Décision** : toute décision sur ce qu'il faut extraire, comment calculer un KPI, et comment nommer une variable doit s'aligner sur ce fichier.
**Raison** : cohérence entre le parser, le dashboard, et les futures évolutions produit.
**Impact** : les noms de variables dans le code doivent correspondre aux `Variable Code` du fichier Excel.

---

## DEC-005 — prod_vendue = prod_biens + prod_serv (calculé)
**Date** : 2026-04-13 (identifié lors de l'analyse)
**Décision** : `prod_vendue` est un champ calculé (ligne 215 + ligne 217), pas une ligne directe.
**Raison** : le formulaire 2033-SD distingue les ventes de biens (215) et de services (217). `prod_vendue` est la somme.
**Impact** : pour débloquer `prod_vendue`, il faut extraire `prod_biens` ET `prod_serv` séparément.

---

## DEC-006 — ca = ventes_march + prod_vendue
**Date** : 2026-04-13 (confirmé depuis le mapping Excel)
**Décision** : `ca` est la somme de `ventes_march` et `prod_vendue`.
**Raison** : conforme au mapping officiel. Si `prod_vendue` est partiel, `ca` est potentiellement sous-estimé pour les entreprises de production/service.
**Impact** : surveiller ce point pour les PDF d'entreprises de services (prod_vendue dominant).

---

## DEC-007 — fcf hors périmètre 2033-SD
**Date** : 2026-04-13 (identifié lors de l'analyse)
**Décision** : le KPI `fcf` (Free Cash Flow) ne peut pas être calculé depuis les données 2033-SD car `investissements_nets` n'est pas présent dans ce formulaire.
**Raison** : les investissements nets nécessitent des données de flux (liasse complète ou annexes).
**Impact** : `fcf` à marquer comme "non disponible sur 2033-SD" dans le diagnostic, sans le présenter comme "bloqué".

---

## DEC-008 — tcam et fte nécessitent N-1
**Date** : 2026-04-13 (identifié lors de l'analyse)
**Décision** : `tcam` et `fte` (flux trésorerie exploitation) requièrent des données de l'exercice précédent. Non calculables sur un seul PDF.
**Raison** : `tcam` utilise `ca_n_minus_1`, `fte` utilise `delta_bfr` = BFR(N) - BFR(N-1).
**Impact** : `tcam` débloqué en Lot 2 (extraction `ca_n_minus_1` depuis colonne N-1). `fte` nécessite toujours kpiHistoryEngine.

---

## DEC-009 — Détection automatique du layout CDR depuis l'en-tête
**Date** : 2026-04-14 (Lot 4 — révision de la décision initiale du Lot 2)
**Décision** : le layout du CDR est détecté automatiquement depuis la présence et l'ordre des ancres textuelles « Exercice clos » et « Exercice précédent » dans la section incomeStatement.

- **Layout standard (2033-SD, ex : BEL AIR)** : « Exercice clos » apparaît avant « Exercice précédent » dans l'ordre de lecture Document AI → `col1 = N`, `col2 = N-1`, `col3 = Variation absolue` (quand présente). Pour 2 candidats comme pour 3 candidats, on retourne `col1`.
- **Layout inversé (ex : Cegid)** : « Exercice précédent » apparaît avant « Exercice clos » → `col1 = N-1`, `col2 = N`. Fallback rightmost.
- **Layout inconnu** : aucune ou une seule des deux ancres détectée → fallback rightmost (comportement pré-Lot 4, préserve les fixtures historiques).

**Raison** : le comportement unique « rightmost » du Lot 2 était correct pour Cegid mais incorrect pour BEL AIR et le format standard 2033-SD où N est à gauche. Les 9 champs CDR (externalCharges, wages, socialCharges, depreciationAllocations, taxesAndLevies, exceptionalProducts, exceptionalCharges, totalOperatingProducts, totalOperatingCharges) retournaient systématiquement N-1 ou la variation absolue au lieu de N sur BEL AIR.

**Implémentation** : `detectCdrLayout(rows)` dans [services/pdf-analysis/rowReconstruction.ts](services/pdf-analysis/rowReconstruction.ts) est appelé par `analyzeFinancialDocument`, puis propagé à `resolveFieldValues` → `selectAmountCandidate` via le paramètre `cdrLayout`. La branche `nCurrent` consulte le layout pour décider entre `ordered[0]` (standard) et `chooseLikelyIncomeStatementCurrentCandidate` (inverted/unknown → rightmost).

**Limite connue** : lorsqu'une ligne « total » a 3 candidats en layout standard `[N, N-1, |Variation|]`, on retourne `col1 = N`. Si un PDF inconnu a une quatrième colonne insérée en tête (e.g. un index ou un code), `col1` serait incorrect. À surveiller en Lot 5 si un cas réel se présente.

**Impact sur les fixtures** :
- Fixture historique `"extrait les champs critiques sur une liasse multi-colonnes"` : pas d'ancre → layout unknown → rightmost → comportement inchangé.
- Nouvelle fixture `"applique le layout CDR standard (BEL AIR)"` : structure multi-ligne Document AI avec ancres « Exercice clos » / « Exercice precedent » → layout standard → col1.
- Nouvelle fixture `"layout CDR unknown ... fallback DEC-009 rightmost"` : documente explicitement le fallback.

**Voir** : `PARSER_DEBUG_NOTES.md` DBG-001 pour l'historique du problème, et les traces de diagnostic BEL AIR dans `services/pdf-analysis/belair-cdr-diagnostic.test.ts` (skipped par défaut, activable via `RUN_BELAIR_DIAGNOSTIC=true`).
