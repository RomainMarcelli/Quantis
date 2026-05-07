# DOCUMENTATION COMPLETE PROJET - VYZOR V3

Version: 2026-04-09
Statut: reference technique active
Portee: frontend, backend, donnees, securite, tests, operations

## 1. Resume executif
Vyzor V3 est une application SaaS de pilotage financier pour PME.
Elle transforme des fichiers comptables (Excel, PDF liasse) en donnees structurees, KPI et vues decisionnelles.

Flux coeur:
`Upload -> Parsing -> Mapping -> KPI -> Persistance -> Dashboard/Synthese`

Stack coeur:
- Next.js 16 (App Router)
- React 19 + Tailwind CSS 3
- TypeScript 5
- Firebase (Auth + Firestore)
- Google Document AI (parser PDF)
- Recharts

## 2. Objectifs
### 2.1 Objectif metier
- donner une lecture financiere actionnable
- accelerer les decisions sur creation de valeur, investissement/BFR, financement, rentabilite

### 2.2 Objectif technique
- logique metier testable et centralisee
- UI decouplee via view-models
- securite by default
- observabilite exploitable en production

## 3. Architecture globale
Vyzor suit une architecture modulaire en 5 couches.

1) Presentation
- routes Next.js (`app/*`)
- composants metier (`components/*`)
- hooks UI (`hooks/*`)

2) API orchestration
- routes serveur (`app/api/*`)
- validation input, auth, rate-limit, orchestration services

3) Services metier
- parsing, mapping, KPI, persistance
- modules dans `services/*`

4) Domaine / types
- contrats TypeScript (`types/*`)
- view-models dans `lib/dashboard/*` et `lib/synthese/*`

5) Infra / securite
- Firebase Admin
- headers HTTP, rate limiting, audit logs, cron cleanup

## 4. Structure repository
- `app/`: pages + API routes
- `components/`: UI par domaine
- `services/`: logique metier
- `lib/`: utilitaires transverses (auth, securite, view-model)
- `types/`: contrats de donnees
- `tests/`: e2e et divers
- `docs/`: runbooks

Runbook parser PDF:
- `docs/PDF_PARSER_RUNBOOK.md`

## 5. Parcours fonctionnels
### 5.1 Auth et compte
Routes UI:
- `/login`, `/register`, `/forgot-password`, `/reset-password`, `/account`

Routes API:
- `POST /api/auth/send-verification-email`
- `POST /api/auth/send-password-reset-email`
- `POST /api/account/delete`

Fonctions:
- verification email
- reset password
- suppression complete compte (Auth + Firestore)

### 5.2 Pipeline standard analyses (Excel/PDF)
Route:
- `POST /api/analyses`

Pipeline (`services/analysisPipeline.ts`):
1. parsing fichiers (`services/parsers/*`)
2. merge raw data
3. mapping 2033 (`services/mapping/financialDataMapper.ts`)
4. calcul KPI (`services/kpiEngine.ts`)
5. calcul Vyzor score
6. retour `analysisDraft`

Persistance:
- SDK Firestore cote client via `services/analysisStore.ts`
- collection top-level `analyses`

### 5.3 Pipeline parser PDF Document AI
Route:
- `POST /api/pdf-parser`

Flux:
1. auth Firebase token cote API
2. reception PDF multipart
3. extraction Document AI (`services/documentAI.ts`)
4. analyse structuree (`services/pdfAnalysis.ts`)
5. mapping Vyzor (`services/financialMapping.ts`)
6. diagnostics (`confidenceScore`, `warnings`)
7. persistance (`services/pdfAnalysisStore.ts`)
8. reponse frontend leger

Test UI:
- `/pdf-parser-test`

Routes associees:
- `GET /api/pdf-parser` (historique)
- `GET /api/pdf-parser?requestId=...` (progression temps reel)

## 6. Architecture API
### 6.1 Routes metier principales
- `POST /api/analyses`
- `POST /api/pdf-parser`
- `GET /api/pdf-parser`
- `POST /api/account/delete`

### 6.2 Routes securite / exploitation
- `POST /api/security/audit`
- `GET /api/cron/security-audit-cleanup`

### 6.3 Endpoints volontairement desactives en lecture
- `GET /api/analyses`
- `GET /api/analyses/[analysisId]`

La lecture des analyses standard se fait via Firestore client authentifie.

## 7. Modele de donnees
### 7.1 Contrats TypeScript
Fichier principal:
- `types/analysis.ts`

Objets clefs:
- `RawAnalysisData`
- `MappedFinancialData`
- `CalculatedKpis`
- `AnalysisRecord`

### 7.2 Firestore collections
1. `users/{uid}`
- profil utilisateur

2. `analyses/{analysisId}` (pipeline standard)
- `userId`, `folderName`, `fiscalYear`, `sourceFiles`
- `parsedData`, `rawData`, `mappedData`, `financialFacts`, `kpis`, `quantisScore`, `uploadContext`

3. `folders/{folderId}`
- dossiers de regroupement d'analyses

4. `users/{uid}/analyses/{analysisId}` (parser PDF)
- `createdAt`, `source: "pdf"`, `quantisData`, `rawData`

5. `security_audit_logs/{logId}`
- evenements securite

## 8. Securite
### 8.1 Auth et authorization
- Firebase Auth sur routes sensibles
- verification Bearer token cote API
- controle de coherence `userId`

### 8.2 Regles Firestore
Fichier:
- `firestore.rules`

Principes:
- isolation par `request.auth.uid`
- create/delete limites au proprietaire
- update interdit sur collection `analyses`

### 8.3 Hardening HTTP
Fichier:
- `proxy.ts`

Headers actifs:
- CSP
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- HSTS en production

### 8.4 Rate limiting
Fichier:
- `lib/server/rateLimit.ts`

Exemples:
- `/api/analyses`: 12 req / 60s
- `/api/auth/send-password-reset-email`: 5 req / 15 min
- `/api/auth/send-verification-email`: 8 req / 15 min

### 8.5 Audit securite
Fichier:
- `lib/server/securityAudit.ts`

- logs d'evenements securite
- trace des erreurs 401/403/429
- purge mensuelle via cron Vercel (`vercel.json`)

## 9. Parser PDF: architecture detaillee
### 9.1 Extraction Document AI
Service:
- `services/documentAI.ts`

Sortie:
- `rawText`, `pages`, `entities`, `tables`

Debug:
- `DOCUMENT_AI_DEBUG_STRUCTURE=true`

### 9.2 Analyse structuree
Service:
- `services/pdfAnalysis.ts`

Responsabilites:
- detection sections bilan / compte de resultat
- extraction des champs financiers clefs
- normalisation nombres FR
- diagnostics (`confidenceScore`, `warnings`)

### 9.3 Mapping Vyzor
Service:
- `services/financialMapping.ts`

Sortie:
- `ca`, `totalCharges`, `netResult`, `totalAssets`, `equity`, `debts`

Regles:
- `ca = revenue + production` (fallback si un seul present)
- warning si `ca < 0`

### 9.4 Progression par phases
Service:
- `services/pdfParserProgressStore.ts`

Caracteristiques:
- store in-memory, TTL 15 min
- statuts: `running | completed | failed`

Phases:
- upload: `0 -> 20`
- Document AI: `20 -> 70`
- analyse/mapping: `70 -> 90`
- finalisation/sauvegarde: `90 -> 100`

### 9.5 UX loader parser
Page:
- `app/pdf-parser-test/page.tsx`

Comportement:
- upload XHR (progress upload reelle)
- polling progression backend via `requestId`
- `ProcessingLoader` + timer ecoule + estimation dynamique
- affichage limite aux donnees utiles

## 10. Contrat API parser PDF
### 10.1 POST /api/pdf-parser
Body multipart:
- `file` (PDF, requis)
- `userId` (optionnel, verifie)
- `requestId` (optionnel)

Reponse standard:
- `success`
- `quantisData`
- `confidenceScore`
- `warnings`
- `persistence`

Mode debug:
- ajoute `debugData` si `PDF_PARSER_DEBUG=true`

### 10.2 GET /api/pdf-parser
- sans query: historique analyses PDF
- avec `requestId`: progression en temps reel

## 11. Dashboard et synthese
Pages:
- `/analysis`
- `/analysis/[id]`
- `/synthese`

Principes:
- UI pilotee par `kpis` + view-models
- pas de recalcul metier lourd dans les composants
- support historique via moteurs dedies

Modules clefs:
- `lib/dashboard/*`
- `lib/synthese/*`
- `services/kpiHistoryEngine.ts`
- `services/analysisHistory.ts`

## 12. Observabilite et debug
Prefixes log:
- `[api/pdf-parser]`
- `[document-ai]`
- `[pdf-analysis]`
- `[financial-mapping]`
- `[security-audit]`

Variables debug:
- `PDF_PARSER_DEBUG=true`
- `DOCUMENT_AI_DEBUG_STRUCTURE=true`

## 13. Qualite et tests
Strategie:
- tests unitaires Vitest sur services, auth, securite, parser, view-models
- tests e2e Playwright sur parcours critiques

Etat actuel:
- ~52 fichiers `*.test.ts` / `*.test.tsx`

Commandes:
- `npm run test:unit`
- `npm run test:e2e`
- `npm run lint`
- `npx tsc --noEmit`

## 14. Configuration environnement
Source:
- `.env.example`

Variables majeures:
- `NEXT_PUBLIC_FIREBASE_*`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `DOCUMENT_AI_PROJECT_ID`, `DOCUMENT_AI_LOCATION`, `DOCUMENT_AI_PROCESSOR_ID`
- `DOCUMENT_AI_CLIENT_EMAIL`, `DOCUMENT_AI_PRIVATE_KEY` (optionnel)
- `DOCUMENT_AI_DEBUG_STRUCTURE`, `PDF_PARSER_DEBUG` (optionnel)
- `APP_BASE_URL`
- `CRON_SECRET`

## 15. Operations et deploiement
- runtime Node.js sur routes sensibles
- Vercel deploy app
- cron mensuel purge audit: `0 3 1 * *`
- backend data: Firebase + Document AI

## 16. Limites connues
1. progression parser in-memory (pas distribuee multi-instance)
2. qualite extraction dependante du format liasse
3. coexistence de 2 zones de persistance (`analyses` et `users/{uid}/analyses`)

## 17. Roadmap technique recommandee
Court terme:
1. renforcer precision parser PDF sur formats heterogenes
2. externaliser store progression (Redis/KV)
3. enrichir validations de coherence

Moyen terme:
1. converger vers un schema de persistance unifie
2. exposer consultation parser pour dashboard produit
3. ajouter metriques de production (latence, taux extraction complete)

Long terme:
1. recommandations IA sur donnees structurees
2. benchmark sectoriel
3. observabilite complete (logs/traces/dashboards)

## 18. Source de verite documentaire
- `README.md`
- `projet.md`
- `DOCUMENTATION_COMPLETE_PROJET.md` (ce document)
- `docs/PDF_PARSER_RUNBOOK.md` (runbook parser)

Regle:
Toute evolution architecture/API/securite doit mettre a jour ces fichiers.

## 19. Changelog documentation
2026-04-09:
- reecriture complete alignee avec la version actuelle Vyzor V3
- architecture parser PDF Document AI detaillee
- suppression du contenu historique non pertinent pour l'etat reel
