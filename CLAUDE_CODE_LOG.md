# Claude Code Log — Quantis
Derniere mise a jour : 2026-04-17 11:00

## Diagnostic dashboard N/D (2026-04-17)

### Symptomes
1. `/synthese` affiche tous les KPI en "N/D"
2. `/analysis/jYKpTuBN0w9rrzL6Mvk6` affiche une page noire
3. Le diagnostic JSON confirme 36/38 KPI calcules pour AG FRANCE

### Cause racine : DEUX pipelines PDF independants, DEUX collections Firestore

| | Pipeline `/api/pdf-parser` (test) | Pipeline `/api/analyses` (upload) |
|---|---|---|
| **Utilise par** | `/pdf-parser-test` uniquement | `/upload`, dashboard, saisie manuelle |
| **Pipeline PDF** | **Document AI complet** : extractFinancialPages → processPdfWithDocumentAI → analyzeFinancialDocument → 11 fixes parser | **pdf-parse basique** : extraction texte brut + regex financialFactsExtractor |
| **Collection Firestore** | `users/{userId}/analyses` (sous-collection Admin SDK) | `analyses` (collection racine Client SDK) |
| **Structure document** | `{ source, quantisData, rawData }` — PAS de kpis, PAS de mappedData | `{ userId, kpis, mappedData, quantisScore, ... }` — structure complete |
| **Lu par le dashboard** | ❌ JAMAIS | ✅ OUI |

### Consequence
L'analyse `jYKpTuBN0w9rrzL6Mvk6` a ete creee via `/api/pdf-parser` (page test debug). Elle est stockee dans `users/{userId}/analyses/{id}` avec seulement `quantisData` et `rawData`.

Le dashboard (`/synthese`, `/analysis/[id]`) lit depuis la collection racine `analyses` via `analysisStore.ts`. Il ne voit **rien** car les donnees sont dans une sous-collection differente avec une structure incompatible.

### Probleme secondaire : pipeline PDF dans /api/analyses est basique
Quand un PDF est uploade via `/upload`, le flow est :
1. `/api/analyses` → `runAnalysisPipeline()` → `parseUploadedFile()` → `parsePdfBuffer()`
2. `parsePdfBuffer()` utilise `pdf-parse` (extraction texte brut) + `extractFinancialFactsFromText()` (regex simple)
3. Ce pipeline **n'utilise PAS** Document AI, ni `analyzeFinancialDocument`, ni les 11 fixes parser

Le pipeline Document AI complet (avec les 11 fixes) n'est accessible que via `/api/pdf-parser` qui n'est pas connecte au dashboard.

### Solution proposee
**Connecter le pipeline Document AI au flow upload** :
- Option A : dans `parsePdfBuffer()` (services/parsers/pdfParser.ts), remplacer le parsing pdf-parse basique par le pipeline Document AI complet
- Option B : dans `runAnalysisPipeline()`, detecter les PDFs et appeler le pipeline `/api/pdf-parser` en interne
- Option C : modifier le flow `/upload` pour utiliser directement `/api/pdf-parser` puis sauvegarder le resultat dans la collection `analyses` (racine)

**L'option A est la plus propre** : modifier `parsePdfBuffer()` pour appeler `extractFinancialPages` → `processPdfWithDocumentAI` → `analyzeFinancialDocument` → mapping vers `ParsedFileData`.

### Diagramme du probleme
```
/pdf-parser-test → /api/pdf-parser → Document AI pipeline (11 fixes) → users/{uid}/analyses ← DASHBOARD NE LIT PAS ICI
/upload          → /api/analyses   → pdf-parse basique (regex)       → analyses (racine)    ← DASHBOARD LIT ICI
```

### Ce qu'il faut pour la demo
```
/upload → /api/analyses → Document AI pipeline (11 fixes) → analyses (racine) ← DASHBOARD LIT ICI ✅
```

---

## Modifications page /upload (2026-04-17)

### Accepter les PDFs + UX amelioree

**Probleme** : la page /upload n'acceptait que les fichiers Excel (.xlsx, .xls, .csv). Le format PDF — qui est le format principal des liasses fiscales — n'etait pas accepte. L'UX etait basique (zone de drop petite, pas de feedback visuel sur l'etape active, bouton toujours cliquable meme sans fichier).

**Modifications appliquees** :

1. **Validation** (`lib/upload/uploadValidation.ts`)
   - `isExcelFileName()` renomme en `isAcceptedFileName()` — accepte `.pdf, .xlsx, .xls, .csv`
   - Validation taille max 20 Mo par fichier avec message clair
   - Messages d'erreur generiques (plus "Excel seulement")

2. **Tests** (`lib/upload/uploadValidation.test.ts`)
   - 8 tests (6 existants adaptes + 2 nouveaux : PDF accepte, taille max refusee)
   - `isAcceptedFileName("liasse.pdf")` → `true`
   - Fichier > 20 Mo → erreur "La taille maximale par fichier est de 20 Mo."

3. **Interface** (`components/upload/UploadPageView.tsx`)
   - Titre "Import Excel" → "Analyse financiere"
   - Input `accept=".pdf,.xlsx,.xls,.csv"`
   - Zone de drop : min-height 200px, layout vertical centre, icone Upload 56px
   - 2 icones cote a cote : PDF (FileText) + Excel (FileSpreadsheet) avec labels
   - Mention "Max 20 Mo" visible dans la zone de drop
   - "X fichiers Excel selectionnes" → "X fichiers selectionnes"
   - Bouton "Lancer l'analyse" desactive (grise) si 0 fichiers selectionnes
   - StepCards : numeros en cercles dores quand l'etape est active, bordure grise sinon

**Tests** :
```
351 passed / 0 failed / 3 skipped
```

**Fichiers modifies** :
| Fichier | Modification |
|---------|-------------|
| `lib/upload/uploadValidation.ts` | isExcelFileName → isAcceptedFileName, .pdf, 20 Mo max |
| `lib/upload/uploadValidation.test.ts` | 2 tests ajoutes (PDF, taille max) |
| `components/upload/UploadPageView.tsx` | Textes, accept, dropzone 200px, icones PDF+Excel, bouton disabled, StepCards actives |

---

## UI Polish (2026-04-16)

### Loader premium pendant l'upload ✅
**Probleme** : pendant le parsing (15-20s), l'utilisateur voyait uniquement "Analyse en cours..." sur le bouton grise. Aucun feedback visuel.

**Solution** : `UploadProcessingOverlay` — overlay premium integre dans UploadPageView avec :
- 5 etapes animees avec icones Lucide (lecture, extraction, calcul, score, finalisation)
- Barre de progression gradient dore (simulation 18s + ralentissement a 90%)
- Messages rotatifs toutes les 3s (5 messages : ratios, score, sante, benchmarks, ameliorations)
- Temps restant estime
- Transition succes : 100% → "Analyse terminee !" → 1.2s → redirect /synthese

**Fichiers** : `components/upload/UploadProcessingOverlay.tsx` (cree), `components/upload/UploadPageView.tsx` (integration)

### Export diagnostic JSON sur /pdf-parser-test ✅
Bouton "Exporter diagnostic complet" visible apres un resultat. Telecharge un JSON avec principalFinancials, mappedData (62 vars), kpis (38 KPI), confidenceScore, warnings, execution.

**Fichier** : `app/pdf-parser-test/page.tsx`

### Bouton "Telecharger le rapport" sur /analysis/[id] ✅
Bouton ajoute au-dessus du menu tabs, visible depuis tous les onglets. Utilise `downloadSyntheseReport` + `buildSyntheseViewModel` — meme logique que /synthese.

**Fichier** : `components/analysis/AnalysisDetailView.tsx`

### Verification /synthese et /analysis/[id] ✅
Aucune correction necessaire. Null → "N/D" partout, formatage EUR correct, graphiques gerent les null, pas de NaN.

---

## Etat final — session parser Lot 9 (2026-04-16)

### Tests unitaires
```
351 passed / 0 failed / 3 skipped
```

### Tableau 14 PDFs

| # | Fichier | CA | totalAssets | netResult | KPI /38 | Statut |
|---|---------|----|----|----|----|--------|
| 1 | AG FRANCE | ✅ | ✅ | ✅ | 36 | ✅ |
| 2 | BEL AIR | — | — | — | 6 | ⚪ |
| 3 | BI-PLANS | ✅ | ✅ | ✅ | 35 | ✅ |
| 4 | FUSALP | ✅ | ✅ | ✅ | 23 | ✅ |
| 5 | EURASIA | ❌ | ❌ | ❌ | 10 | ❌ |
| 6 | FIVAL | ✅ | ❌ | ❌ | 16 | ❌ |
| 7 | FUTURE PIPE | ✅ | ✅ | ✅ | 10 | ✅ |
| 8 | LCL | ✅ | ✅ | ✅ | 10 | ✅ |
| 9 | LXA | ✅ | ✅ | ✅ | 11 | ✅ |
| 10 | RIP CURL | ✅ | ✅ | ✅ | 16 | ✅ |
| 11 | SMI | ✅ | ✅ | ❌ | 11 | ❌ |
| 12 | SRJB | — | — | — | 16 | ⚪ |
| 13 | TROISV | ✅ | ✅ | ✅ | 34 | ✅ |
| 14 | VERACYTE | ✅ | ✅ | ❌ | 22 | ❌ |

**8/14 passes | 4 echecs | 2 sans reference** (debut session : 4 passes)

### Completude KPI

| PDF | Bilan /17 | CDR /16 | KPI /10 |
|-----|-----------|---------|---------|
| AG FRANCE | 15 | 14 | **10** |
| BI-PLANS | 14 | 15 | **10** |
| TROISV | 12 | 11 | **9** |
| FUSALP | 10 | 8 | **7** |
| RIP CURL | 11 | 10 | 4 |
| SMI | 9 | 5 | 4 |
| VERACYTE | 13 | 12 | 3 |
| FIVAL | 8 | 6 | 3 |
| SRJB | 11 | 6 | 3 |
| LCL | 9 | 4 | 2 |
| LXA | 8 | 5 | 2 |
| FUTURE PIPE | 7 | 7 | 2 |
| BEL AIR | 9 | 4 | 1 |
| EURASIA | 3 | 5 | 0 |

### Fixes parser (1-11)

| # | Description | Fichier |
|---|-------------|---------|
| 1 | TROISV ref corrigee | test-all-pdfs.mjs |
| 2 | Filtre labels > 80 chars | fieldResolver.ts |
| 3 | Split valeur+pourcentage | amountParsing.ts |
| 4 | Regex total general + contextualBoost | labelDictionary.ts, fieldResolver.ts |
| 5 | netTurnover kind detail | labelDictionary.ts |
| 6 | VERACYTE totalAssets via Fix 4 | (via Fix 4) |
| 7 | Markers bilingues EN | pdfPageExtractor.ts |
| 8 | Pattern Produits/Charges/Resultat | fieldResolver.ts |
| 9 | contextualBoost netResult bilan passif | fieldResolver.ts |
| 10 | totalAssets excludes + alias resultat comptable | labelDictionary.ts |
| 11 | externalCharges + totalOperatingProducts Fiducial | labelDictionaryFusalp.ts |

### Limitations identifiees (necessitent Vision LLM ou refactoring)

| Limitation | PDFs | Solution |
|------------|------|----------|
| Layout CDR Regnology (labels sans montants) | RIP CURL | Refactoring spatial extractor |
| Layout 2033-SD multi-colonnes (amounts=[]) | LCL, LXA, SMI, FUTURE PIPE, VERACYTE | Vision LLM |
| Format bilingue FR/EN | EURASIA | Pipeline bilingue |
| Scan degrade (valeurs aberrantes) | FIVAL | Vision LLM |
| netResult absent rawText CDR | SMI, VERACYTE | Vision LLM |

### Tous les fichiers modifies (sessions 16-17 avril)

**Parser (Lot 9)** :
- `services/pdf-analysis/amountParsing.ts`
- `services/pdf-analysis/fieldResolver.ts`
- `services/pdf-analysis/labelDictionary.ts`
- `services/pdf-analysis/labelDictionaryFusalp.ts`
- `services/pdf-analysis/pdfPageExtractor.ts`
- `scripts/test-all-pdfs.mjs`

**UI Polish** :
- `components/upload/UploadProcessingOverlay.tsx` (cree)
- `components/upload/UploadPageView.tsx`
- `components/analysis/AnalysisDetailView.tsx`
- `app/pdf-parser-test/page.tsx`

**Upload PDF + UX** :
- `lib/upload/uploadValidation.ts`
- `lib/upload/uploadValidation.test.ts`
- `components/upload/UploadPageView.tsx`

### Message de commit

```
feat: Lot 9 parser + UI polish + upload PDF

Parser (11 fixes) :
- amountParsing: split valeur+pourcentage concatenes
- fieldResolver: filtre labels >80 chars, contextualBoost totalAssets/
  totalLiabilities/netResult, pattern Produits/Charges/Resultat
- labelDictionary: regex total general, netTurnover kind detail,
  totalAssets excludes circulant/immobilise, alias resultat comptable
- labelDictionaryFusalp: externalCharges + totalOperatingProducts
- pdfPageExtractor: markers bilingues BALANCE SHEET / INCOME STATEMENT

UI :
- UploadProcessingOverlay: loader premium 5 etapes animees
- Bouton "Telecharger le rapport" sur /analysis/[id]
- Export diagnostic JSON sur /pdf-parser-test

Upload :
- Accepte .pdf en plus de .xlsx/.xls/.csv
- Dropzone 200px avec icones PDF+Excel, StepCards actives
- Validation taille max 20 Mo
- Bouton desactive si 0 fichiers

351 tests, 8/14 PDFs passes, FUSALP KPI 4→7/10
```

### Configuration
- Vision LLM : DESACTIVE (credits Anthropic limites)
- Tests unitaires : 351 passed / 0 failed / 3 skipped

---

## Fix critique — connexion pipelines PDF (2026-04-17)

### Diagnostic detaille

**4 elements analyses** :

1. **parsePdfBuffer()** (`services/parsers/pdfParser.ts`) :
   - Utilise `pdf-parse` (extraction texte brut) + `extractFinancialFactsFromText` (regex)
   - Retourne `ParsedFileData` avec `rawData: {byVariableCode, byLineCode, byLabel}` quasi vide
   - N'appelle PAS Document AI

2. **Pipeline Document AI** (`app/api/pdf-parser/route.ts` lignes 278-328) :
   - `extractFinancialPages` → `processPdfWithDocumentAI` → `analyzeFinancialDocument`
   - Produit `ParsedFinancialData` → `MappedFinancialData` (62 champs) → `CalculatedKpis` (38 KPI)
   - Les 11 fixes parser sont dans cette chaine

3. **runAnalysisPipeline()** (`services/analysisPipeline.ts`) :
   - Appelle `parsePdfBuffer()` pour les PDFs
   - Reconstruit `MappedFinancialData` depuis `rawData.byVariableCode` (map vide → tout null)
   - Calcule KPIs depuis mappedData → tout null → dashboard "N/D"

4. **Type ParsedFileData** :
   - Champ cle : `rawData: RawAnalysisData = {byVariableCode, byLineCode, byLabel}`
   - Le pipeline attend que `byVariableCode` contienne les codes comptables (FW, FY, GA, FL, etc.)

### Approches possibles

**A1 — Enrichir parsePdfBuffer()** : appeler Document AI, obtenir MappedFinancialData, remplir `rawData.byVariableCode` avec les champs mappes. Respecte l'architecture existante.

**A2 — Court-circuiter runAnalysisPipeline pour les PDFs** : detecter les PDFs et construire directement mappedData + kpis sans passer par RawAnalysisData. Plus simple mais duplique la logique.

### Decision : Approche A2 validee par Romain

**Implementation proposee** dans `services/analysisPipeline.ts` :
- Detecter `pdfFiles` vs `nonPdfFiles` dans `params.files`
- Si PDF present : `extractFinancialPages` → `processPdfWithDocumentAI` → `analyzeFinancialDocument` → `mapParsedFinancialDataToMappedFinancialData` → `documentAiMappedData`
- Construire un `ParsedFileData` minimal pour le PDF (fileName, extractedAt, fiscalYear)
- Fusionner avec les fichiers Excel eventuels
- Utiliser `documentAiMappedData` a la place de `mapRawDataToMappedFinancialData(rawData)` si dispo
- Le reste du pipeline (computeKpis, calculateQuantisScore, etc.) reste inchange
- Structure `AnalysisDraft` identique — pas de breaking change

### Implementation : ✅ APPLIQUEE

**Fichier modifie** : `services/analysisPipeline.ts`

**Logique ajoutee** :
1. Split `params.files` en `pdfFiles` / `nonPdfFiles`
2. Si PDF present → `extractFinancialPages` → `processPdfWithDocumentAI` → `analyzeFinancialDocument` → `mapParsedFinancialDataToMappedFinancialData` → `documentAiMappedData`
3. Try/catch avec fallback silencieux : si Document AI echoue → `console.warn` + retour au pipeline basique
4. Fichiers Excel passent par le flow existant inchange
5. `documentAiMappedData` remplace `mapRawDataToMappedFinancialData(rawData)` quand disponible
6. Structure `AnalysisDraft` identique — pas de breaking change

**Imports ajoutes** :
- `extractFinancialPages` depuis `pdfPageExtractor`
- `processPdfWithDocumentAI` depuis `documentAI`
- `analyzeFinancialDocument` depuis `pdfAnalysis`
- `mapParsedFinancialDataToMappedFinancialData` depuis `parsedFinancialDataBridge`

**Verification** :
- `npx vitest run` : **351 passed / 0 failed / 3 skipped** ✅
- `npx tsc --noEmit` : 0 erreur dans analysisPipeline.ts (9 erreurs pre-existantes dans fichiers de test)
- `npx next build` : **build reussi**, toutes les routes compilent ✅

**Test en conditions reelles** : en attente — Romain doit lancer l'app (`npx next dev`), uploader AG FRANCE via `/upload`, et verifier que `/synthese` affiche CA=16 064 535 et que `/analysis/[id]` n'est plus une page noire.

**Flow connecte** :
```
/upload → /api/analyses → runAnalysisPipeline()
  → PDF detecte → extractFinancialPages → processPdfWithDocumentAI → analyzeFinancialDocument (11 fixes)
  → mapParsedFinancialDataToMappedFinancialData → documentAiMappedData
  → computeKpis(documentAiMappedData) → calculateQuantisScore
  → AnalysisDraft complet {kpis, mappedData, quantisScore}
  → saveAnalysisDraft → collection "analyses" (racine)
  → /synthese lit "analyses" → KPI affiches ✅
```

---

## Bouton export donnees JSON (2026-04-17)

### Implementation ✅

Bouton "Exporter donnees" ajoute sur `/synthese` et `/analysis/[id]`, a cote du bouton "Telecharger le rapport".

**Fichiers crees** :
- `lib/export/exportAnalysisData.ts` — fonction `exportAnalysisDataAsJson()` qui genere un JSON avec :
  - `analysisId`, `generatedAt`, `entreprise`, `fiscalYear`
  - `principalFinancials` : ca, totalAssets, netResult, equity, debts
  - `mappedData` : 62 variables completes
  - `kpis` : 38 KPI avec valeurs
  - `quantisScore` : score, level (Excellent/Bon/Fragile/Critique), piliers
  - Fichier nomme `quantis-data-[entreprise]-[date].json`

**Fichiers modifies** :
- `components/synthese/SyntheseDashboard.tsx` — prop `onExportData` optionnelle, bouton dans le header
- `components/synthese/SyntheseView.tsx` — import + callback `onExportData`
- `components/analysis/AnalysisDetailView.tsx` — import + bouton a cote du rapport

**Design** : bordure grise, texte gris (`text-white/50`) — discret par rapport au bouton rapport dore. Visible uniquement si une analyse est chargee.

**Tests** : 351 passed / 0 failed ✅

---

## Audit page Documents (2026-04-17)

### 1. Structure Firestore

**Collection `folders`** :
- `id` (auto), `userId`, `name`, `nameLower` (normalise), `createdAt` (Timestamp)

**Collection `analyses`** :
- Lien vers dossier : champ `folderName` (string, pas d'ID Firestore — matching par nom)
- Champ `sourceFiles: FileDescriptor[]` = metadonnees uniquement :
  ```
  { name: string, mimeType: string, size: number, type: "excel" | "pdf" }
  ```
- **Le buffer PDF binaire n'est PAS stocke** — ni dans Firestore ni dans Cloud Storage

### 2. Composants

Pas de repertoire `components/documents/` dedie. La vue documents est entierement dans `AnalysisDetailView.tsx` (lignes 1001-1199), activee par `viewMode="documents"`.

3 sections rendues :
1. **Dossiers** (1003-1065) : liste des dossiers avec boutons Select/Rename/Delete + bouton creer
2. **Fichiers sources** (1067-1142) : liste avec checkbox, nom, date, dossier, badge vert, bouton delete
3. **Upload** (1144-1199) : zone drag-drop + bouton saisie manuelle

### 3. Fonctionnalites existantes

| Operation | Statut | Lignes |
|-----------|--------|--------|
| Creer dossier | ✅ Fonctionnel | 507-512, 567-571 |
| Renommer dossier | ✅ Fonctionnel | 514-518, 549-596 (met a jour toutes les analyses liees) |
| Supprimer dossier | ✅ Fonctionnel | 520-524, 598-629 (cascade : supprime les analyses du dossier) |
| Upload fichiers vers dossier | ✅ Fonctionnel | 457-505 (appel /api/analyses) |
| Supprimer fichiers | ✅ Fonctionnel | 664-751 (selection multiple + confirmation) |
| Select all / Deselect all | ✅ Fonctionnel | 1075-1085 |

### 4. Ce qui manque

| Fonctionnalite | Statut | Impact |
|----------------|--------|--------|
| **Telecharger le PDF original** | ❌ IMPOSSIBLE | Le buffer binaire n'est pas stocke. Seules les metadonnees sont en Firestore. L'utilisateur ne peut pas recuperer son fichier. |
| **Taille fichier affichee** | ❌ Non affiche | `size` est stocke dans `FileDescriptor` mais pas rendu dans l'UI |
| **Deplacer fichiers entre dossiers** | ❌ Non implemente | Pas d'UI ni de fonction. Necessiterait de modifier `folderName` sur l'analyse |
| **Preview du document** | ❌ Non implemente | Pas d'apercu du PDF ou des donnees brutes |
| **Lien vers l'analyse** | ❌ Partiel | Un clic sur un fichier ne navigue pas vers l'analyse detaillee correspondante |

### 5. Lien fichiers → analyses

Quand un PDF est uploade via `/upload` :
1. Le buffer binaire est envoye a `/api/analyses` en FormData
2. `runAnalysisPipeline()` traite le buffer en memoire (Document AI)
3. Seules les **metadonnees** sont sauvegardees dans `sourceFiles` (nom, taille, type)
4. Le buffer binaire est **libere** apres traitement — jamais persiste
5. Les donnees extraites (mappedData, kpis, rawData) sont sauvegardees dans l'analyse
6. L'analyse est liee au dossier par le champ `folderName`

**Consequence** : le PDF original est **perdu apres parsing**. Pour la demo, ce n'est pas bloquant (les donnees sont la), mais pour un produit final il faudrait stocker les PDFs dans Cloud Storage.

---

## Refonte page Documents (2026-04-17)

### Plan de fichiers propose

**A creer :**
| Fichier | Role |
|---------|------|
| `components/documents/DocumentsView.tsx` | Layout 2 colonnes : sidebar dossiers (25%) + contenu (75%) |
| `components/documents/FolderSidebar.tsx` | Liste dossiers, hover rename/delete, bouton creer, actif en dore |
| `components/documents/AnalysisCardGrid.tsx` | Grille de cards analyses du dossier selectionne |
| `components/documents/AnalysisCard.tsx` | Card : nom fichier, badge PDF/Excel, date, CA, score Quantis, boutons actions |
| `components/documents/FolderDialog.tsx` | Modal creer/renommer dossier |
| `components/documents/EmptyFolderState.tsx` | Empty state : icone + "Aucune analyse" + bouton upload |

**A modifier :**
| Fichier | Modification |
|---------|-------------|
| `app/documents/page.tsx` | Remplacer `AnalysisDetailView viewMode="documents"` par `DocumentsView` |
| `services/analysisStore.ts` | Ajouter `moveAnalysisToFolder(userId, analysisId, targetFolderName)` |

**Fonctions Firestore reutilisees** (pas de recreation) :
- folderStore: `listUserFolders`, `createUserFolder`, `renameUserFoldersByName`, `deleteUserFoldersByName`
- analysisStore: `listUserAnalyses`, `deleteUserAnalysisById`, `deleteUserFolderAnalyses`, `renameUserFolder`

### Implementation : ✅ APPLIQUEE

**Composants crees** (6 fichiers) :

| Fichier | Statut | Detail |
|---------|--------|--------|
| `components/documents/FolderDialog.tsx` | ✅ | Modal creer/renommer dossier, ESC/Enter, focus auto |
| `components/documents/EmptyFolderState.tsx` | ✅ | Icone + message + bouton CTA upload |
| `components/documents/AnalysisCard.tsx` | ✅ | Card : nom fichier, badge PDF/Excel, date FR, CA, score Quantis couleur, boutons voir/deplacer/supprimer |
| `components/documents/AnalysisCardGrid.tsx` | ✅ | Grille responsive sm:2 xl:3 colonnes |
| `components/documents/FolderSidebar.tsx` | ✅ | Sidebar avec dossiers, actif en dore, hover rename/delete, bouton creer |
| `components/documents/DocumentsView.tsx` | ✅ | Layout 2 colonnes (25%/75%), gestion etats loading/empty/liste, toutes les operations CRUD |

**Fichiers modifies** (2) :

| Fichier | Modification |
|---------|-------------|
| `services/analysisStore.ts` | Ajout `moveAnalysisToFolder()` (updateDoc folderName) + import `updateDoc` |
| `app/documents/page.tsx` | Remplace `AnalysisDetailView viewMode="documents"` par `DocumentsView` |

**Fonctionnalites implementees** :
- Creer dossier (modal + Firestore)
- Renommer dossier (modal + cascade sur analyses liees)
- Supprimer dossier (confirmation + cascade delete analyses)
- Supprimer analyse (confirmation + delete Firestore)
- Deplacer analyse entre dossiers (dropdown + updateDoc folderName)
- Tri par date decroissante
- Score Quantis couleur (Excellent vert, Bon dore, Fragile orange, Critique rouge)
- Empty state avec CTA upload
- Responsive : sidebar passe en colonne sur mobile

### Ameliorations design (2026-04-17)

**AnalysisCard.tsx** :
- Cards plus grandes : padding p-5, gap inter-elements augmente
- Nom fichier sur 2 lignes max (`line-clamp-2`) au lieu de tronque sur 1 ligne
- CA en `text-2xl font-bold` (etait text-sm)
- Score Quantis en badge colore avec fond (bg-green-500/10, bg-amber-500/10, etc.)
- Hover : ombre doree (`shadow-[0_4px_24px_rgba(245,158,11,0.08)]`) + elevation (`-translate-y-0.5`) + bordure amber (`border-amber-400/40`)
- Bouton Deplacer avec icone FolderInput (visible, pas cache)
- Bouton Supprimer en bas dans la barre d'actions (plus au-dessus du nom)
- Confirmation suppression via ConfirmDialog premium (plus de window.confirm)

**AnalysisCardGrid.tsx** :
- 3 colonnes xl, 2 colonnes md, 1 colonne mobile (`xl:grid-cols-3 md:grid-cols-2 sm:grid-cols-1`)
- Gap augmente a `gap-5`

**FolderSidebar.tsx** :
- Largeur fixe 280px (`w-[280px]`) au lieu de 25%
- Badge nombre d'analyses en pill avec fond
- Dossier actif : couleur amber coherente

**DocumentsView.tsx** :
- Sidebar dossiers en flex direct (plus de div wrapper 25%)
- Header dossier : icone Folder doree + nom en text-base + separateur `h-px bg-white/10`
- Gap augmente a `gap-5`

**EmptyFolderState.tsx** :
- Centre verticalement avec min-h-[400px]
- Icone plus grande (h-20 w-20 → h-9 w-9 interieur)
- 2 boutons : "Uploader une liasse" (dore) + "Nouvelle analyse" (gris)

**ConfirmDialog.tsx** (cree) :
- Modal design premium dark theme avec backdrop-blur
- Icone AlertTriangle (rouge si destructif, dore sinon)
- Animation fade-in + zoom-in
- Boutons Annuler (gris) / Confirmer (rouge ou dore)
- Fermeture ESC

### Refonte layout — tabs horizontaux (2026-04-17)

**Probleme** : la sidebar dossiers prenait trop de place et coupait le layout. Les elements n'etaient pas alignes avec les autres pages.

**Solution** : remplacement de la sidebar dossiers verticale par des **tabs horizontaux** pleine largeur, comme un design standard de navigation secondaire.

**Nouveau layout** :
1. Menu lateral global (Tableau de bord / Synthese / Documents) → inchange
2. Header pleine largeur (titre + bouton Nouvelle analyse)
3. **Tabs dossiers horizontaux** dans un bloc `precision-card` : icone + nom + badge count + bouton Nouveau dossier a droite. Tab actif = bordure doree en bas. Hover = icones rename/delete en fondu.
4. Stats dossier (X analyses · Derniere mise a jour)
5. Grille de cards pleine largeur

**Fichiers** :
- `components/documents/FolderTabs.tsx` (CREE) — tabs horizontaux avec indicateur actif
- `components/documents/DocumentsView.tsx` — layout refait, FolderSidebar remplace par FolderTabs
- `components/documents/FolderSidebar.tsx` — conserve mais plus utilise (peut etre supprime)

### Corrections layout (2026-04-17)

**Fix 1 — Header pleine largeur** : header sorti de la grille sidebar/contenu, place au-dessus avec `w-full`. Plus tronque a gauche.

**Fix 2 — Alignement vertical** : sidebar navigation et zone contenu commencent au meme niveau (header au-dessus des deux).

**Fix 3 — Grille cards** : `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` avec `w-full` sur le conteneur.

**Fix 4 — fiscalYear 2050** : filtre `year <= 2030` dans `analysisPipeline.ts` pour exclure les codes formulaire DGFiP (2050, 2051...) du champ annee fiscale.

**Fix 5 — Bouton Deplacer** : deja present (icone FolderInput + dropdown), verifie fonctionnel.

**Tests** : 351 passed / 0 failed ✅

---

## Fix selecteur annee synthese (2026-04-17)

### Probleme
Le selecteur d'annee dans la sidebar de `/synthese` initialisait a `SYNTHESIS_CURRENT_YEAR_KEY` ("Annee en cours" = 2026). Si aucune analyse n'existait pour 2026, le dashboard etait vide. Le fallback existant (lignes 178-192) basculait sur `yearOptions[1]` mais avec des conditions fragiles.

De plus, `resolveAnalysisYear()` retournait `new Date().getFullYear()` quand `fiscalYear` etait null — donc les analyses sans annee fiscale etaient attribuees a l'annee courante au lieu de l'annee de creation.

### Corrections

**`lib/synthese/synthesePeriod.ts`** — `resolveAnalysisYear()` :
- Quand `fiscalYear` est null, utilise `new Date(analysis.createdAt).getFullYear()` au lieu de `new Date().getFullYear()`
- Une analyse creee en 2024 sans fiscalYear sera attribuee a 2024, pas a 2026

### Correction finale — suppression "Annee en cours"

Le fallback precedent ne suffisait pas. L'option "Annee en cours (2026)" restait affichee par defaut meme quand aucune analyse n'existait pour 2026.

**Solution radicale** : suppression complete du concept "Annee en cours" dans le selecteur.

**`lib/synthese/synthesePeriod.ts`** :
- `buildSyntheseYearOptions()` ne genere plus l'option "Annee en cours (YYYY)" — retourne uniquement les annees reelles des analyses, triees desc
- Si aucune analyse → retourne tableau vide

**`components/synthese/SyntheseView.tsx`** :
- Init `selectedYearValue` a `""` au lieu de `SYNTHESIS_CURRENT_YEAR_KEY`
- useEffect simplifie : si l'option selectionnee n'existe pas dans les options → bascule sur `yearOptions[0]` (annee la plus recente)

**`components/analysis/AnalysisDetailView.tsx`** :
- Init `selectedDashboardYear` a `""` au lieu de `SYNTHESIS_CURRENT_YEAR_KEY`
- Le fallback existant (ligne 296) bascule deja sur `dashboardYearOptions[0]`

**`lib/synthese/synthesePeriod.test.ts`** :
- Tests mis a jour : le premier element n'est plus "Annee en cours" mais l'annee reelle la plus recente
- Ajout test "retourne un tableau vide si aucune analyse"

### Comportement apres fix
- Analyse avec fiscalYear=2024 → selecteur affiche directement "2024" ✅
- Analyses en 2023 et 2025 → selecteur sur "2025", dropdown propose "2023" ✅
- Aucune analyse → aucune option, message "Aucune analyse" ✅

**Tests** : 352 passed / 0 failed ✅

---

## Préparation Vision LLM (2026-04-17)

Quatre améliorations au pipeline Vision LLM, sans activer l'API Anthropic.

### Amélioration 1 — Détection k€ dans le prompt Vision LLM

**`services/pdf-analysis/visionExtractor.ts`** :
- Ajout champ `unite?: "euros" | "milliers_euros" | null` dans `VisionFinancialData`
- Section **DÉTECTION UNITÉ MONÉTAIRE (CRITIQUE)** dans le prompt système :
  - Lecture de l'en-tête pour détecter "en milliers d'euros", "k€", etc.
  - Multiplication ×1000 demandée au LLM si k€ détecté
  - Champ `unite` retourné dans le JSON de réponse
- `parseVisionResponse()` extrait et valide le champ `unite`

### Amélioration 2 — Garde-fou k€ dans le merge

**`services/pdf-analysis/visionExtractor.ts`** :
- `mergeVisionWithDocumentAI()` : si `visionData.unite === "milliers_euros"`, toutes les valeurs numériques sont multipliées par 1000 avant le merge
- Double sécurité : le LLM est censé multiplier dans sa réponse, mais le garde-fou côté code protège contre un oubli

### Amélioration 3 — Meilleure sélection de pages pour PDFs longs (30-50 pages)

**`services/pdf-analysis/pdfPageExtractor.ts`** :
- `buildScanFallbackIndices()` pour les PDFs 30-50 pages :
  - Avant : 30 pages à partir de 30% → risque de dépasser bilan+CDR
  - Après : 20 pages de 20% à 60% → couvre mieux bilan + CDR sans déborder sur les annexes
- Ajout log debug pour les PDFs texte natif : liste des pages sélectionnées quand `PDF_EXTRACTOR_VERBOSE=true`

### Amélioration 4 — Prompt Vision LLM plus précis sur les formats DGFiP

**`services/pdf-analysis/visionExtractor.ts`** :
- Section **FORMATS RECONNUS** ajoutée au prompt système :
  - 2050-SD (bilan actif) : TOTAL GÉNÉRAL ligne 110
  - 2051-SD (bilan passif) : TOTAL GÉNÉRAL ligne 180
  - 2052-SD (CDR) : BÉNÉFICE OU PERTE ligne 310
  - 2033-SD (simplifié) : totaux lignes 096, 110, 180, 232, 264, 310
  - Format Sage/Cegid : TOTAL GÉNÉRAL dans tableau 4 colonnes
  - Format Regnology : tableaux N / N-1 séparés

**Tests** : 352 passed / 0 failed ✅

---

## Rapport PDF enrichi (2026-04-17)

Refonte complète du rapport PDF Quantis : passage d'un rapport 1 page à un rapport professionnel de 6 pages A4 avec charte graphique dorée.

### Architecture

Le rapport est généré par 3 fichiers principaux :
- **`lib/synthese/pdfReportModel.ts`** — modèle de données, formatters, scoring automatique
- **`components/pdf/PDFLayout.tsx`** — rendu @react-pdf/renderer 6 pages
- **`lib/synthese/downloadSyntheseReport.ts`** — orchestration download + nommage fichier

### Structure 6 pages

**Page 1 — Page de garde**
- Logo Quantis (constante `LOGO_PATH = "/images/LogoV3.png"`)
- Titre "Rapport d'analyse financière" + nom entreprise
- Ligne dorée séparatrice
- Quantis Score en jauge circulaire avec badge niveau (Excellent/Bon/Fragile/Critique)
- 4 piliers en grille 2×2 : Rentabilité, Solvabilité, Liquidité, Efficacité avec barres de progression
- Footer : période fiscale + date génération + "Confidentiel"

**Page 2 — Synthèse financière**
- 3 Hero KPI : CA, EBE, Trésorerie disponible (blocs dorés avec bordure gauche)
- Tableau récapitulatif : CA, Total bilan, Résultat net, Capitaux propres, Dettes totales
- Alertes (bullets colorés par sévérité)
- Recommandations (bullets dorés)

**Page 3 — Création de valeur & Rentabilité opérationnelle**
- 6 KPI en grille 2 colonnes : VA, EBITDA, Marge EBITDA, TMSCV, Point mort, Résultat net
- Chaque KPI avec interprétation en gris 8px

**Page 4 — Investissement & BFR**
- 6 KPI : BFR, Ratio d'immobilisation, DSO, DPO, Rotation stocks, Rotation BFR

**Page 5 — Financement & Structure Financière**
- 8 KPI : CAF, Solvabilité, Gearing, Trésorerie nette, Liquidité générale/réduite/immédiate, Capacité de remboursement

**Page 6 — Rentabilité & Performance**
- 4 KPI : ROE, ROCE, Effet de levier, Spread (ROE-ROCE)
- "Points forts" : top 3 KPI automatiquement identifiés (scoring multi-critères)
- "Axes d'amélioration" : bottom 3 KPI
- Message de clôture confidentiel

### Charte graphique
- Fond blanc #FFFFFF, texte #111827, secondaire #6B7280
- Accent doré #F59E0B / #D97706, vert #10B981, rouge #EF4444, orange #F97316
- Cards KPI : fond #F9FAFB, bordure gauche 3px dorée, border-radius 4px
- Titres sections : Helvetica-Bold 16px couleur dorée + ligne dorée 2px
- Valeurs KPI : Helvetica-Bold 22px
- N/D : Helvetica-Oblique gris
- Header pages 2-6 : logo petit + nom entreprise + numéro de page
- Footer : "Rapport confidentiel — Quantis" centré

### Formatage des valeurs
- `fmtCurrency()` : "1 393 180 €" (Intl.NumberFormat fr-FR)
- `fmtPercent()` : "8,65 %" (détection auto ratio vs pourcentage)
- `fmtRatio()` : "3,17x"
- `fmtDays()` : "106 jours"
- `fmtYears()` : "0,04 an"
- Null → "N/D" en gris italique

### Scoring automatique (strengths/improvements)
- `rateKpis()` évalue 10 KPI sur une échelle 90/60/30
- Top 3 = Points forts, Bottom 3 = Axes d'amélioration
- Si données insuffisantes → message par défaut

### Modifications des fichiers

**`lib/synthese/pdfReportModel.ts`** — réécriture complète :
- Nouveau type `PdfReportData` avec sections cover, synthese, valueCreation, investment, financing, profitability
- Nouveau type `PdfKpiItem` (label, valueLabel, interpretation)
- `BuildPdfReportDataInput` accepte `kpis?: CalculatedKpis` et `mappedData?: MappedFinancialData`
- 5 formatters exportés : fmtCurrency, fmtPercent, fmtRatio, fmtDays, fmtYears
- Scoring automatique via `rateKpis()`, `buildStrengths()`, `buildImprovements()`

**`components/pdf/PDFLayout.tsx`** — réécriture complète :
- Document @react-pdf 6 pages avec composants internes : CoverPage, SynthesePage, KpiPage (×3), ProfitabilityPage
- Composants partagés : PageHeader, PageFooter, KpiCard
- Constante `LOGO_PATH` en haut du fichier
- Gestion N/D : Helvetica-Oblique gris pour les valeurs manquantes

**`lib/synthese/downloadSyntheseReport.ts`** :
- `DownloadSyntheseReportInput` étendu avec `kpis?` et `mappedData?` (optionnels, backward compatible)
- Signature de `downloadSyntheseReport()` inchangée

**`components/synthese/SyntheseView.tsx`** :
- Passage de `kpis` et `mappedData` dans l'appel à `downloadSyntheseReport()`

**`components/analysis/AnalysisDetailView.tsx`** :
- Passage de `kpis` et `mappedData` dans l'appel à `downloadSyntheseReport()`

**`lib/synthese/pdfReportModel.test.ts`** — réécriture :
- Tests avec `baseKpis` complet (38 champs)
- Test structure 6 sections
- Test N/D sans kpis
- Test PDF sans crash (6 pages)

### Ancien code non supprimé
- `components/pdf/Header.tsx`, `ScoreSection.tsx`, `KPISection.tsx`, `AlertsSection.tsx` — toujours présents mais plus importés par PDFLayout.tsx

### Fix séparateur de milliers (2026-04-17)
- **Problème** : `Intl.NumberFormat("fr-FR")` produit des espaces insécables (U+202F) que @react-pdf/renderer ne supporte pas → rendu "16/064/534 €" au lieu de "16 064 534 €"
- **Solution** : remplacement de `fmtCurrency()` par formatage manuel via regex `\B(?=(\d{3})+(?!\d))` avec espace ASCII standard (U+0020)
- `fmtPercent()`, `fmtRatio()`, `fmtDays()`, `fmtYears()` : ajout guard `undefined` pour robustesse
- Fichier modifié : `lib/synthese/pdfReportModel.ts` (section Formatters)

**Tests** : 353 passed / 0 failed ✅

---

## Fix total_prod_expl Regnology (2026-04-17)

**Problème** : RIP CURL (format Regnology) — `total_prod_expl` est null car le format ne fournit pas de ligne total explicite, alors que les composants sont présents (`ventes_march=49 919 067`, `prod_vendue=156 076`). Conséquence : VA, EBITDA et tous les KPI dépendants sont null.

**Solution** dans `services/kpiEngine.ts` :
- Variable locale `effectiveTotalProdExpl` qui reconstruit le total depuis ses composants quand `data.total_prod_expl` est null :
  ```
  effectiveTotalProdExpl = data.total_prod_expl ??
    sumPartial(ventes_march, prod_vendue, prod_stockee, prod_immo, subv_expl, autres_prod_expl)
  ```
- `data.total_prod_expl` jamais modifié directement (pas d'effet de bord)
- 5 usages remplacés : va, marge_ebitda, rot_bfr, dso, rot_stocks
- `computeCa()` conserve `data.total_prod_expl` en fallback (lecture brute correcte)

**Vérification RIP CURL** :
- effectiveTotalProdExpl = 49 919 067 + 156 076 = **50 075 143** ✅
- VA = 50 075 143 - 14 763 074 (ace) = **35 312 069** ✅
- EBITDA = 35 312 069 - 6 599 527 - 2 696 790 - 0 = **26 015 752** ✅

**Tests** : 353 passed / 0 failed ✅

---

## Fixes automatisés post-test (2026-04-17)

3 fixes dans `services/kpiEngine.ts` pour améliorer le taux de KPI sur les PDFs existants.

### Fix 1 — caf et roe utilisent resultat_net avec fallback

**Problème** : `caf = sum(data.res_net, data.dap)` et `roe = div(data.res_net, data.total_cp)` utilisaient `data.res_net` directement, ignorant le fallback `resultat_exercice` (calculé depuis totalProducts - totalCharges). Quand `netResult` est null mais `totalProducts` et `totalCharges` existent, caf et roe restaient null à tort.

**Solution** :
- `resultat_net = data.res_net ?? data.resultat_exercice` déplacé AVANT caf et roe
- `caf = sum(resultat_net, data.dap)` au lieu de `sum(data.res_net, data.dap)`
- `roe = div(resultat_net, data.total_cp)` au lieu de `div(data.res_net, data.total_cp)`

**Impact** : VERACYTE caf résolu (+1 KPI)

### Fix 2 — effectiveEbit pour ROCE

**Problème** : `roce = div(mul(data.ebit, 0.75), sum(data.total_actif_immo, bfr))` utilise `data.ebit` qui vient de `operatingResult`. Quand le parser ne trouve pas la ligne "RÉSULTAT D'EXPLOITATION" mais a `total_prod_expl` et `total_charges_expl`, ROCE reste null.

**Solution** :
- `effectiveEbit = data.ebit ?? sub(effectiveTotalProdExpl, data.total_charges_expl)`
- `roce = div(mul(effectiveEbit, 0.75), ...)` utilise le fallback

**Impact** : CREATIONS FUSALP (+1 KPI), RIP CURL (+1 KPI)

### Analyse des 4 PDFs demandés

**EURASIA TOURS** (CA faux : 437K vs 3.4M) :
- Le parser capture "437010 AG2R REUNICA PREVOYANCE CA" — un numéro de compte analytique, pas le chiffre d'affaires
- Format balance/trial balance bilingue → nécessite Vision LLM
- **Infixable sans Vision LLM**

**FIVAL** (netResult) :
- `netResult = 870 432` correspond à la valeur de référence ✅
- Le problème est ailleurs : quasi aucun champ bilan/CDR extrait (scan dégradé, 4/17 bilan, 2/16 CDR)
- **Infixable sans Vision LLM**

**SMI MARILLIER** (netResult null) :
- CDR tronqué : "RÉSULTAT D'EXPLOITATION" et "RÉSULTAT COURANT AVANT IMPÔTS" existent, mais pas de ligne "BÉNÉFICE OU PERTE" ni "TOTAL DES PRODUITS/CHARGES"
- Pas de fallback possible
- **Infixable sans Vision LLM**

**VERACYTE** (netResult null dans raw, OK via fallback) :
- `incomeStatement.netResult` = null (pas de ligne explicite)
- Mais `totalProducts = 36 813 982` et `totalCharges = 3 195 046` → `resultat_exercice` calculé par le bridge
- Le KPI `resultat_net` est résolu via fallback ✅
- `va/ebitda` restent null car `ace` et `salaires` absents du raw text → **nécessite Vision LLM**

### Tableau récapitulatif final

| PDF | CA | totalAssets | netResult | KPI /10 | Statut |
|-----|-----|-----|-----|-----|-----|
| AG FRANCE | 16 064 535 ✅ | 8 117 151 ✅ | 1 173 877 ✅ | **10/10** | ✅ |
| BEL AIR | N/D | N/D | N/D | **1/10** | ⚪ pas de ref |
| BI-PLANS | 752 298 ✅ | 454 030 ✅ | 24 219 ✅ | **10/10** | ✅ |
| CREATIONS FUSALP | 52 945 837 ✅ | 68 396 331 ✅ | 177 197 ✅ | **8/10** | ✅ |
| EURASIA TOURS | 437 010 ❌ | null | null | **0/10** | ❌ Vision LLM |
| FIVAL | 187 442 ❌ | null | 870 432 ✅ | **0/10** | ❌ Vision LLM |
| FUTURE PIPE | 738 197 ✅ | 344 316 ✅ | 25 924 ✅ | **2/10** | ✅ |
| LCL | 8 145 093 ✅ | 7 773 023 ✅ | 659 391 ✅ | **2/10** | ✅ |
| LXA | 18 078 362 ✅ | 10 498 434 ✅ | 657 398 ✅ | **4/10** | ✅ |
| RIP CURL | 50 075 143 ✅ | 66 101 267 ✅ | 1 201 318 ✅ | **8/10** | ✅ |
| SMI MARILLIER | 948 636 ✅ | 26 356 691 ✅ | null ❌ | **5/10** | ❌ Vision LLM |
| SRJB | N/D | N/D | N/D | **~3/10** | ⚪ pas de ref |
| TROISV | 263 118 ✅ | 174 535 ✅ | -8 700 ✅ | **9/10** | ✅ |
| VERACYTE | 27 209 281 ✅ | 27 311 749 ✅ | null ❌ | **4/10** | ❌ Vision LLM |

**Bilan** : 8 ✅ / 4 ❌ / 2 sans référence
**Progression KPI** : FUSALP 7→8, RIP CURL 7→8, VERACYTE 3→4 (via fixes kpiEngine)
**Bloqueurs Vision LLM** : EURASIA (balance bilingue), FIVAL (scan dégradé), SMI (CDR tronqué), VERACYTE (ace/salaires absents)

**Tests** : 353 passed / 0 failed ✅

---

## Fix CA LXA (2026-04-17)

### Problème 1 — ventes_march = 70 710 000 (faux)

**Cause** : le parser capture "VENTES DE MARCHANDISES - FRANCE" (row 1401, annexe détaillée) au lieu du CDR principal. Le vrai CA (netTurnover) = 18 078 362 de "CHIFFRES D'AFFAIRES NETS" (row 266).

**Fix** dans `services/mapping/parsedFinancialDataBridge.ts` :
- Nouvelle fonction `sanitizeSalesGoods(salesGoods, netTurnover)` : si `|salesGoods| > |netTurnover| × 2` → null
- Appliquée avant le coalesce, donc le fallback `deriveSalesGoodsFromNetTurnover()` prend le relais
- LXA : 70 710 000 > 18 078 362 × 2 = 36 156 724 → rejeté ✅

### Problème 2 — ca_n_minus_1 = 1 483 460 (faux)

**Cause** : `netTurnoverPreviousYear` capture "TOTAL CHIFFRES D'AFFAIRES NETS" (row 1415, annexe) colonne 3. Valeur = 8% du CA courant → aberrant pour un N-1.

**Fix** dans `services/mapping/parsedFinancialDataBridge.ts` :
- Nouvelle fonction `sanitizePreviousYearTurnover(previous, current)` : si ratio `|previous/current|` hors intervalle [0.1, 10] → null
- LXA : 1 483 460 / 18 078 362 = 0.082 < 0.1 → rejeté ✅

### Vérification
- LXA : ca = **18 078 362** ✅, KPI 16/38
- AG FRANCE : ca = **16 064 535** ✅, KPI 36/38 (non-régression)
- BI-PLANS : non-régression confirmée

**Tests** : 353 passed / 0 failed ✅

---

## Fix LXA passif (2026-04-17)

Trois bugs de parsing sur LXA LAGARDERE (format balance/balance générale avec numéros de compte).

### Bug 2 — total_cp capture la variation au lieu du solde (CORRIGÉ)

**Problème** : equity = -292 602 (variation col3) au lieu de 932 336 (solde N col1).
La règle spéciale equity dans `fieldResolver.ts` (nCurrent strategy) prenait systématiquement le dernier candidat (rightmost) pour les lignes "capitaux propres" avec 2+ colonnes.

**Fix** dans `services/pdf-analysis/fieldResolver.ts` :
- Pour equity avec 3+ candidats : détection de triplet [N, N-1, Variation]. Si col3 ≈ col1 - col2 → pick col1 (solde N)
- Pour equity avec 2 candidats : conserve le comportement original (rightmost, correct pour DGFiP 2033-SD)

**Résultat** : equity = **932 336** ✅

### Bug 3 — capital capture un compte courant d'associés (CORRIGÉ)

**Problème** : shareCapital = 122 500 de "ASSOCIES - C/C CAPITAL" (compte courant) au lieu du capital social (50 000).

**Fix** dans `services/pdf-analysis/labelDictionary.ts` :
- Ajout excludes pour shareCapital : `"associes", "associe", "courant", "c/c"`

**Résultat** : shareCapital = 50 de "CAPITAL SOCIAL" ✅ (valeur faible car col1 = numéro de compte, valeur réelle dans une autre colonne non capturée — impact nul car total_cp vient de equity total)

### Bug 1 — reserve_legale et ran capturent des numéros de compte (PARTIEL)

**Problème** : legalReserves = 10610100 (numéro de compte PCG 106.101.00) au lieu de 5 000.

**Fix partiel** dans `services/pdf-analysis/fieldResolver.ts` :
- `chooseLikelyCurrentCandidate()` : filtre les candidats entiers ≥ 10M (8+ digits) quand d'autres candidats plus petits existent sur la même ligne
- **Non résolu pour LXA** : la ligne "RESERVE LEGALE" n'a qu'un seul candidat numérique (le numéro de compte), la valeur réelle (5 000) n'est pas extraite comme candidat séparé par Document AI
- **Impact nul** : total_cp vient de la ligne equity total (932 336), pas de la somme des composants

### Vérification
- LXA : ca = **18 078 362** ✅, total_cp = **932 336** ✅, KPI 16/38
- AG FRANCE : ca = **16 064 535** ✅, KPI 36/38 (non-régression)
- BI-PLANS : ca = **752 298** ✅, KPI 35/38 (non-régression)

**Tests** : 353 passed / 0 failed ✅

---

## Vision LLM réactivé + système logs (2026-04-17)

### Action 1 — Réactivation Vision LLM

**`app/api/pdf-parser/route.ts`** :
- Import décommenté : `extractWithVision`, `mergeVisionWithDocumentAI` (lignes 17-20)
- Import ajouté : `logVisionCall` (ligne 21)
- Bloc Vision LLM décommenté et enrichi (lignes 335-353) :
  - Condition : `ANTHROPIC_API_KEY` présente ET `confidenceScore < 0.80`
  - Appel `extractWithVision(pdfBuffer, file.name)` avec nom du PDF
  - Merge + recalcul mappedData/kpis/quantisData si succès
  - Warning ajouté : "Vision LLM appliqué (score avant: X, après: Y)"
  - Branche else : log du non-déclenchement

### Action 2 — Système de logs Vision LLM

**`services/pdf-analysis/visionLogger.ts`** (nouveau) :
- Type `VisionLogEntry` : 14 champs (timestamp, pdfName, triggered, scores, model, tokens, coût, erreur, durée)
- Stockage mémoire (max 500 entrées, FIFO)
- Exports : `logVisionCall`, `getVisionLogs`, `clearVisionLogs`, `formatLogsAsText`

### Action 3 — Logs intégrés dans visionExtractor.ts

**`services/pdf-analysis/visionExtractor.ts`** :
- Constante `VISION_MODEL = "claude-haiku-4-5-20251001"`
- `callClaude()` retourne `tokensInput`/`tokensOutput` depuis `response.usage`
- `extractWithVision(pdfBuffer, pdfName)` : logs console + `logVisionCall()` dans les 3 branches
- Estimation coût : Haiku $0.25/1M input + $1.25/1M output

### Action 4 — Endpoint API logs

**`app/api/vision-logs/route.ts`** (nouveau) :
- `GET /api/vision-logs` → JSON, `GET ?format=text` → texte lisible, `DELETE` → vide

### Action 5 — Boutons sur /pdf-parser-test

**`app/pdf-parser-test/page.tsx`** :
- "📋 Logs Vision LLM" + "🗑️ Vider les logs" — visibles uniquement en `development`

### 10 lignes clés

1. `route.ts:18` — `extractWithVision` importé ✅
2. `route.ts:21` — `logVisionCall` importé ✅
3. `route.ts:336` — `process.env.ANTHROPIC_API_KEY && confidenceScore < 0.80` ✅
4. `route.ts:341` — `extractWithVision(pdfBuffer, file.name)` ✅
5. `route.ts:343` — `mergeVisionWithDocumentAI(financialData, visionResult.data, ...)` ✅
6. `visionExtractor.ts:3` — `import { logVisionCall }` ✅
7. `visionExtractor.ts:196` — `VISION_MODEL = "claude-haiku-4-5-20251001"` ✅
8. `visionExtractor.ts:210` — `process.env.ANTHROPIC_API_KEY` lu ✅
9. `visionLogger.ts:24` — `export function logVisionCall` ✅
10. `app/api/vision-logs/route.ts:6` — GET endpoint actif ✅

### Action 6 — Vision LLM dans analysisPipeline.ts (fix upload)

**Problème** : le Vision LLM n'existait que dans `app/api/pdf-parser/route.ts` (page /pdf-parser-test). Le flux upload via `/upload` → `runAnalysisPipeline()` ne l'appelait jamais.

**`services/analysisPipeline.ts`** :
- Imports ajoutés : `extractWithVision`, `mergeVisionWithDocumentAI`, `logVisionCall`
- Bloc Vision LLM inséré entre `analyzeFinancialDocument()` et `mapParsedFinancialDataToMappedFinancialData()` :
  - Condition : `ANTHROPIC_API_KEY` ET `analysis.diagnostics.confidenceScore < 0.80`
  - Appel `extractWithVision(pageExtraction.buffer, pdfFile.name)`
  - Merge sur `analysis.parsedFinancialData` (mutations AVANT le mapping)
  - `logVisionCall()` avec fieldsFilledByVision, durationMs, confidenceBefore/After
  - Try/catch : erreur Vision LLM non-bloquante (log + continue)
  - Branche else : log du non-déclenchement
- `console.log("[VisionLogger] Entry logged:", ...)` ajouté après chaque `logVisionCall()` (3 branches : succès, erreur, skip)

### Action 7 — Fix doublement CA Vision LLM

**Problème** : Vision LLM remplit `ventes_march = 738 197` alors que `prod_vendue = 738 197` est déjà présent → `computeCa()` additionne les deux → CA = 1 476 394 au lieu de 738 197.

**Fix** dans `services/kpiEngine.ts` — `computeCa()` :
- Si `ventes_march` et `prod_vendue` sont tous deux > 0 ET écart < 1% → doublon Vision LLM → prendre `Math.max()` au lieu d'additionner
- Cas normal (écart > 1%) : addition standard conservée

```typescript
if (Math.abs(salesGoods - soldProduction) < soldProduction * 0.01) {
  return Math.max(salesGoods, soldProduction);
}
```

### Diagnostic double appel Vision LLM (2026-04-17)

**Résultat : pas de double appel.** Les deux chemins sont séparés :
- `/upload` → `POST /api/analyses` → `runAnalysisPipeline()` (analysisPipeline.ts) → Vision LLM
- `/pdf-parser-test` → `POST /api/pdf-parser` → route.ts → Vision LLM

Ils ne se croisent jamais. 2 entrées de log = 2 uploads distincts.

**Architecture confirmée :**
```
/upload → UploadPageView → fetch /api/analyses → runAnalysisPipeline() → Vision LLM
/pdf-parser-test → XMLHttpRequest /api/pdf-parser → route.ts → Vision LLM
```

**Tests** : 353 passed / 0 failed ✅

---

## Vision LLM v2 — validateur + extracteur (2026-04-17)

### Fix 1 — Doublement CA VERACYTE

**Problème** : `ventes_march + prod_vendue > total_prod_expl × 1.1` → doublon Vision LLM.

**Fix** dans `services/kpiEngine.ts` — `computeCa()` :
- Si la somme dépasse `total_prod_expl × 1.1` → prendre `Math.max(ventes, prodVendue)` au lieu d'additionner
- Complète le garde-fou existant (écart < 1%)

### Fix 2 — Refonte Vision LLM : mode validateur + extracteur

**Avant** : Vision LLM en mode "fill-only" — ne remplissait que les champs null sans vérifier les valeurs Document AI existantes.

**Après** : deux passes dans un seul appel :
1. **Vérification** : les valeurs Document AI non-null sont envoyées au LLM qui les compare visuellement au PDF. Si écart > 5% → correction retournée. Si correct → null (on garde Document AI).
2. **Extraction** : les champs null sont extraits depuis le PDF.

#### Fichiers modifiés

**`services/pdf-analysis/visionExtractor.ts`** — réécriture :
- `buildSystemPrompt(existingData?)` : prompt dynamique avec section "À VÉRIFIER" (valeurs Document AI) et "À EXTRAIRE" (champs null)
- `callClaude(pdfBuffer, attempt, systemPrompt)` : accepte le prompt dynamique
- `extractWithVision(pdfBuffer, pdfName, existingDocAIData?)` : nouveau 3e paramètre optionnel
- `mergeVisionWithDocumentAI()` : nouvelle logique de merge :
  - Champ null → Vision LLM remplit (fill)
  - Champ existant + écart > 5% → Vision LLM corrige (correction loggée)
  - Champ existant + écart ≤ 5% → garde Document AI
- `buildExistingDataForVision(parsed)` : nouvelle fonction exportée, extrait les valeurs Document AI depuis ParsedFinancialData vers VisionFinancialData

**`services/analysisPipeline.ts`** :
- Import `buildExistingDataForVision`
- `const existingData = buildExistingDataForVision(analysis.parsedFinancialData)` avant l'appel
- `extractWithVision(pageExtraction.buffer, pdfFile.name, existingData)`

**`app/api/pdf-parser/route.ts`** :
- Import `buildExistingDataForVision`
- `const existingData = buildExistingDataForVision(financialData)` avant l'appel
- `extractWithVision(pdfBuffer, file.name, existingData)`

#### Prompt dynamique

Le prompt envoyé au LLM contient maintenant :
```
=== VALEURS À VÉRIFIER (N champs) ===
{ "ca": 16064535, "total_actif": 8117151, ... }

=== CHAMPS À EXTRAIRE (M champs) ===
["ace", "salaires", "charges_soc", ...]
```

Le LLM retourne null pour les champs vérifiés et corrects, et une valeur uniquement pour les corrections et nouvelles extractions.

### Corrections prompt N-1 et sous-lignes (2026-04-17)

Erreurs identifiées sur SMI MARILLIER : Vision LLM prenait N-1 au lieu de N, et des sous-lignes au lieu des totaux.

**`services/pdf-analysis/visionExtractor.ts`** — `SYSTEM_PROMPT_BASE` enrichi :

**Section "RÈGLE ABSOLUE SUR LES COLONNES"** :
- Colonne N = toujours la première colonne de gauche
- Deux nombres sur la même ligne → toujours prendre le premier (gauche)
- Exception explicite si "Exercice N-1" est indiqué sur la colonne gauche
- En cas de doute → valeur la plus grande si cohérente

**Section "RÈGLE ABSOLUE SUR LES TOTAUX"** :
- Toujours chercher la ligne TOTAL, jamais une sous-ligne
- Exemples concrets : dettes_fisc_soc, total_dettes, total_cp, fournisseurs
- Indentation/retrait = sous-ligne
- Libellés en gras ou commençant par "TOTAL" = ligne de total

**Tests** : 353 passed / 0 failed ✅

---

## Fix fiscalYear null + ROCE négatif BFR (2026-04-18)

### Fix 1 — fiscalYear = null

**Problème** : `inferFiscalYearFromText()` utilisait `rawText.match(/(20\d{2})/)` qui captait "2050" (code DGFiP) avant "2024" (année réelle). Le filtre `year <= 2030` éliminait 2050 mais l'année réelle n'était jamais capturée.

**Fix** dans `services/analysisPipeline.ts` :
- `inferFiscalYearFromText()` capture désormais TOUTES les occurrences `20\d{2}` via `match(/20\d{2}/g)`
- Filtre : `year >= 2015 && year <= currentYear + 1` (exclut codes DGFiP 2050-2055)
- Retourne `Math.max(...)` des candidats valides

### Fix 2 — ROCE négatif BFR

**Problème** : AG FRANCE — `bfr = -3 981 571`, `total_actif_immo = 2 002 966` → capital employé = -1 978 605 → ROCE inversé (-62%).

**Fix** dans `services/kpiEngine.ts` :
- Variable `capitalEmploye = sum(total_actif_immo, bfr)`
- Si `capitalEmploye <= 0` → `roce = null` (capital employé négatif = cas non standard, ROCE non interprétable)

**Tests** : 353 passed / 0 failed ✅
