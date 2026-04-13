# PARSER_DECISIONS.md
> Log des décisions techniques et produit sur le parser Quantis

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

## DEC-009 — Colonne N = colonne la plus à droite dans le fallback 2 colonnes sans en-tête
**Date** : 2026-04-13 (Lot 2)
**Décision** : quand `chooseLikelyIncomeStatementCurrentCandidate` ne peut pas identifier la colonne N via les en-têtes ni via la logique de delta à 3 colonnes, elle retourne la valeur la plus à droite (`return second`).
**Raison** : comportement validé sur les liasses réelles traitées (certains logiciels comptables — e.g. Cegid — placent N-1 à gauche et N à droite dans un format 2 colonnes sans en-tête). Changer ce comportement a provoqué des régressions sur les tests pdfAnalysis.test.ts qui modélisent ce format.
**Impact** : les tests Lot 2 utilisant le format 2 colonnes N à gauche / N-1 à droite (format standard 2033-SD) doivent soit (a) placer la valeur N en colonne droite, soit (b) utiliser des en-têtes explicites, soit (c) utiliser une ligne à colonne unique pour le champ N.
**Voir** : `PARSER_DEBUG_NOTES.md` pour l'analyse détaillée.
