# PARSER_DEBUG_NOTES.md — Fragilités et comportements à risque

> Dernière mise à jour : 2026-04-13 (Lot 2)
> Ce fichier documente les points de fragilité du parser qui ne sont pas des bugs mais des comportements liés à des contraintes structurelles des PDF 2033-SD. Ne pas "corriger" à la légère — chaque changement doit être validé sur les PDF réels du dossier `docs/docs-compta/`.

---

## DBG-001 — Détection de la colonne N vs N-1 dans un format 2 colonnes sans en-tête

### Problème

Le formulaire 2033-SD présente typiquement 2 colonnes de montants sur le compte de résultat : exercice N (gauche) et exercice N-1 (droite). Certains logiciels comptables (Cegid, etc.) inversent l'ordre et placent N-1 à gauche et N à droite.

Quand Google Document AI extrait le texte en `rawText` (pas de tableau structuré), les deux valeurs apparaissent sur la même ligne sans en-tête associé :

```
CHIFFRES D'AFFAIRES NETS 209 10 307 405 3 370 595
```

Le parser doit deviner laquelle est N et laquelle est N-1.

### Comportement actuel

La fonction `chooseLikelyIncomeStatementCurrentCandidate` dans [services/pdf-analysis/fieldResolver.ts](services/pdf-analysis/fieldResolver.ts) applique les règles dans cet ordre :

1. **Logique de delta (3 colonnes)** : si une ligne a 3 montants `[A, B, C]`, et que `C ≈ A - B` ou `C ≈ B - A`, la colonne qui "arrive à la différence correcte" est identifiée comme la variation → les deux premières sont N et N-1.

2. **Détection par en-tête** : si une colonne a un `headerHint` contenant "N", "Exercice N", "2024", etc. → `isCurrentYearHeader` l'identifie comme N.

3. **Fallback 2 colonnes sans en-tête** : quand aucune des deux règles ci-dessus ne s'applique, le parser retourne la valeur la plus à droite (`return second`). Ce comportement a été validé sur des liasses réelles où N est en deuxième colonne.

### Risque

Ce fallback peut être incorrect si le PDF utilise le format standard (N gauche, N-1 droite). Dans ce cas :
- La valeur N sera mal sélectionnée (N-1 retourné à la place)
- Tous les KPIs qui dépendent du CA courant seront décalés d'un an
- Le `tcam` sera faux (calcul basé sur deux valeurs N-1)

### Mitigation en place

- La stratégie `nMinus1` (pour `netTurnoverPreviousYear`, `ca_n_minus_1`) utilise `amountCandidates[amountCandidates.length - 1]` — toujours le dernier (droite). Cohérent avec le fallback `return second`.
- Les tests d'intégration (`pdfAnalysis.test.ts`) valident le comportement `return second` sur format réel.
- Les tests Lot 2 (`pdfParserLot2Consolidation.test.ts`) évitent l'ambiguïté en utilisant une colonne unique pour les champs N et une ligne 2-colonnes uniquement pour les champs nMinus1.

### Solution long terme (non implémentée)

Voir `PARSER_ROADMAP.md` — Lot 3. Amélioration de la détection de colonne :
- Analyser la structure des tables Document AI pour récupérer des `headerHint` fiables
- Utiliser les années extraites du PDF (ex: "Exercice clos le 31/12/2024") pour identifier la colonne N

### Décision de référence

Voir `PARSER_DECISIONS.md` — DEC-009.

---

## DBG-002 — AMOUNT_PATTERN et nombres avec tous les groupes de 3 chiffres

### Problème

Le pattern d'extraction des montants (`AMOUNT_PATTERN` dans [services/pdf-analysis/amountParsing.ts](services/pdf-analysis/amountParsing.ts)) est :

```
/-?\(?\d{1,3}(?:[\s\u00A0\u202F]\d{3})+(?:[.,]\d+)?\)?|-?\(?\d+(?:[.,]\d+)?\)?/g
```

Ce pattern est **greedy** et étend la correspondance tant que chaque groupe de 3 chiffres est séparé par une espace. En rawText, les colonnes sont séparées par des espaces simples. Si tous les fragments d'une ligne ont exactement 3 chiffres, le pattern peut agréger plusieurs valeurs en un seul nombre :

```
7 106 855 122 848 016  →  7 106 855 122 848 016 (ONE number, not 3)
```

### Quand cela arrive

Seulement quand tous les groupes ont exactement 3 chiffres **et** sont séparés par des espaces simples. Les cas courants ne sont pas affectés :
- `21 207 52 348 31 141` → OK car "52" (2 digits) casse la continuité
- `944 845 1 126 450` → OK car "1" (1 digit) casse la continuité
- `7 106 855 122 848 016` → KO car "106", "855", "122", "848", "016" sont tous 3 digits

### Mitigation

Pour les tests, utiliser des **espaces doubles** entre les colonnes pour briser le pattern :
```
7 106  855 122  848 016   →   3 matches distincts
```

En production, si Document AI retourne des tableaux structurés (format JSON avec cellules séparées), le problème ne se pose pas — les cellules sont traitées individuellement.

### Solution long terme

Améliorer `AMOUNT_PATTERN` pour détecter une limite naturelle entre colonnes (e.g., 2+ espaces, tabulations), ou utiliser la position X des caractères depuis Document AI.

---

## DBG-003 — Confidence score sensible au nombre de champs définis

### Problème

`computeConfidenceScore` dans [services/pdf-analysis/diagnostics.ts](services/pdf-analysis/diagnostics.ts) calcule un score basé sur :
- `coverageScore = fieldsFound / totalFieldsInParsedData`
- `avgFieldScore = sum(fieldScores) / numberOfFieldDefinitions`

Ajouter de nouveaux champs dans `FIELD_DEFINITIONS` et `ParsedFinancialData` **dilue mécaniquement** le score pour les documents dont ces champs sont absents.

### Impact observé

Après ajout des 13 champs Lot 2, le confidence score du test minimal ("CHIFFRES D'AFFAIRES NETS 1 200 000...") est passé de ~0.21 à ~0.18. Le seuil du test a été ajusté de 0.2 à 0.15.

### Recommandation

- Ne pas utiliser le confidence score comme seuil absolu dans les tests. Préférer des assertions sur les champs spécifiques.
- Surveiller que le confidence score reste > 0.1 sur les vrais PDFs après chaque lot d'ajout de champs.
- Envisager une normalisation par "catégorie de champs attendus selon le type de document" (e.g., ignorer les champs capitaux propres si le document n'a pas de bilan passif détaillé).

---

## DBG-004 — CDR 4 colonnes : France | Export | Total N | Total N-1

### Problème

Certains logiciels comptables (ex : BEL AIR / Fashion B.Air) génèrent un compte de résultat à **4 colonnes** : France | Export | Total N | Total N-1. La logique de delta à 3 colonnes (col3 ≈ col1 - col2) ne s'applique pas, et le fallback `return second` retournait `col2` (Export) au lieu de `col3` (Total N). Pour les lignes à 2 candidats (lignes totaux sans ventilation France/Export), `return second` retournait N-1 au lieu de N.

### Champs affectés (BEL AIR)

`ace`, `prod_fin`, `charges_soc`, `prod_excep`, `charges_excep`, `charges_fin`, `total_prod_expl`

### Fix appliqué (Lot 3)

Dans `chooseLikelyIncomeStatementCurrentCandidate` ([services/pdf-analysis/fieldResolver.ts](services/pdf-analysis/fieldResolver.ts)), bloc inséré **avant** le check `ordered.length === 1` :

```typescript
if (ordered.length >= 4) {
  // Vérifier si col3 = col1 + col2 (Total N = France + Export)
  const expectedSum = col1.value + col2.value;
  const tol = Math.max(2_000, Math.abs(expectedSum) * 0.02);
  if (Math.abs(col3.value - expectedSum) <= tol) return col3;
  // Fallback : avant-dernière colonne = Total N
  return ordered[ordered.length - 2] ?? ordered[0] ?? null;
}
```

### Risque résiduel

Si un PDF a 4 colonnes où col3 ≠ col1+col2 **et** où N n'est pas l'avant-dernière colonne, le fallback sera incorrect. Mitigé par la rareté de ce format.

---

## DBG-005 — Sélection colonne Net sur bilan actif : artefacts codes-lignes

### Problème

`extractAmountCandidatesFromCells` (extraction depuis tableaux structurés Document AI) n'a pas le filtre `digitsOnly.length <= 3` présent dans `extractAmountCandidatesFromText`. Résultat : la cellule contenant le code de ligne (ex : "060" → valeur=60) est incluse comme 4ème candidat spurieux. La stratégie `netPriority` utilisait alors `pool[length - 2]` (Amort) au lieu de `pool[length - 1]` (Net).

### Champs affectés (BEL AIR)

`stocks_march` → valeur Amort 2,454,213 au lieu de Net 1,925,516. Cascade : `avances_vers_actif`, `clients`, `dispo` tous décalés.

### Fix appliqué (Lot 3)

Dans `selectAmountCandidate`, bloc `netPriority` ([services/pdf-analysis/fieldResolver.ts](services/pdf-analysis/fieldResolver.ts)) :

```typescript
const meaningful = amountCandidates.filter(c => c.raw.replace(/\D/g, "").length > 3);
const pool = meaningful.length >= 2 ? meaningful : amountCandidates;
```

---

## DBG-006 — Champs sans montant propre : en-tête de section sans ligne agrégée

### Problème

Deux champs du bilan présentent ce comportement dans BEL AIR :
- **`autres_creances` (actif, code 072)** : le label est présent en PDF mais la ligne n'a pas de montant agrégé. Les montants réels sont sur les sous-lignes suivantes (Capital souscrit, Associés CC…). Total attendu : 759,190.
- **`dettes_fisc_soc` (passif, code 172)** : le label n'apparaît pas du tout dans le rawText. Les sous-lignes (Personnel, Organismes sociaux, État taxes, Autres) sont présentes. Total attendu : 1,031,944.

### Fix appliqué (Lot 3)

Nouveau champ `sublineStrategy: "sum"` et `sublinePatterns?: RegExp[]` dans `FieldDefinition` ([services/pdf-analysis/types.ts](services/pdf-analysis/types.ts)).

- **Ancre trouvée, pas de montant** (`autres_creances`) → `collectSublineSum` : scan avant depuis la ligne ancre, sommation jusqu'au prochain `total` ou changement de section.
- **Ancre absente** (`dettes_fisc_soc`) → `collectSublineSumByContext` : scan global sur `sublinePatterns`, ≥2 lignes requises pour confiance.

---

## DBG-007 — prod_vendue négatif refusé à tort

### Problème

`sanitizeProductionSold` dans [services/mapping/parsedFinancialDataBridge.ts](services/mapping/parsedFinancialDataBridge.ts) contenait `if (productionSold < 0) return null`. Or `prod_vendue` peut légitimement être négatif (retours sur production, ajustements de stock négatifs). BEL AIR : valeur attendue −7,031 refusée → `prod_vendue = null` → `ca` sous-estimé.

### Fix appliqué (Lot 3)

Suppression de la garde. Le check de cohérence 115% est conservé mais appliqué sur les valeurs absolues :

```typescript
if (Math.abs(productionSold) > Math.abs(netTurnover) * 1.15) return null;
```
