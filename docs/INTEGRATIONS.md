# Intégrations comptables — architecture et guide

Ce document décrit l'architecture des intégrations dynamiques (Pennylane, MyUnisoft, Odoo) et l'import statique FEC, ainsi que la procédure pour ajouter un nouveau provider et lancer les tests.

## Vue d'ensemble

Les sources de données comptables alimentent toutes le **même format unifié** côté front (`AnalysisRecord` avec `dailyAccounting` + `balanceSheetSnapshot` + `mappedData` + `kpis`). Quatre sources sont supportées aujourd'hui :

| Source | Type | Auth | Pipeline |
|---|---|---|---|
| Pennylane | dynamique | OAuth2 / Company Token / Firm Token | adapter → orchestrator → builders |
| MyUnisoft | dynamique | Partner JWT (X-Third-Party-Secret + Bearer) | adapter → orchestrator → builders |
| Odoo | dynamique | Session (instanceUrl + login + apiKey) | adapter → orchestrator → builders |
| FEC | statique | Upload utilisateur (.txt / .csv) | parser → builders (in-memory, pas de Firestore) |

Le front ne distingue jamais la source : il lit `dailyAccounting[]` (variables 2033-SD du P&L par jour) et `balanceSheetSnapshot.values` (variables bilan au dernier point) et applique ses propres formules KPI.

## Flow dynamique : Pennylane / MyUnisoft / Odoo

```
[front]
  ↓ POST /api/integrations/{provider}/connect  (token utilisateur)
[connect/route.ts]
  → buildXxxAuth(token)  → ConnectorAuth
  → createConnection()   → Firestore "connections"
                           - chiffrement AES-256-GCM via CONNECTOR_ENCRYPTION_KEY
                           - check unicité : 1 connexion active par (userId, provider)
                             sinon ConnectionAlreadyExistsError → HTTP 409

[front]
  ↓ POST /api/integrations/{provider}/sync  ({ connectionId })
[sync/route.ts]
  → enforceRouteRateLimit (6 req/60s par IP+route+user)
  → resolvePeriod = 12 derniers mois glissants par défaut
  → runSync(connection, options)
       ↓
  [syncOrchestrator]
    → getAdapter(provider) ← registry.ts
    → fetchJournals → upsertJournals → cursor
    → fetchLedgerAccounts → upsertLedgerAccounts → cursor
    → fetchContacts → upsertContacts → cursor
    → fetchEntries → upsertAccountingEntries → cursor
    → fetchInvoices → upsertInvoices → cursor
    → fetchBankAccounts (optionnel) → upsertBankAccounts → cursor
    → fetchBankTransactions (optionnel) → upsertBankTransactions → cursor
    → updateSyncStatus("success" | "partial" | "failed")
       ↓
  [buildAndPersistAnalysisFromSync]
    → list entries / invoices / contacts depuis Firestore
    → adapter.fetchTrialBalance() (si dispo) → trial balance brute
    → aggregateTrialBalanceToParsedFinancialData (priorité)
       OU aggregateEntriesToParsedFinancialData (fallback)
    → mapParsedFinancialDataToMappedFinancialData → mappedData
    → computeKpis(mappedData) → KPI legacy
    → calculateQuantisScore(kpis) → score
    → buildGranularInsights(invoices, contacts) → top clients/fournisseurs/secteurs
    → buildKpisTimeSeries(entries) → KPI 12 mois
    → buildVatInsights(entries) → TVA collectée/déductible/due
    → buildDailyAccounting(entries) → variables 2033-SD jour par jour
    → buildBalanceSheetSnapshot(trialBalance) → bilan unifié
    → write Firestore "analyses"
```

## Flow statique : import FEC

```
[front]
  ↓ POST /api/analyses (multipart, fichier .txt/.csv FEC)
[analyses/route.ts]
  → detectSupportedUploadType(name, mime, buffer)
       sniff de 4 KB d'en-tête → "fec" si JournalCode|EcritureDate|... présents
  → runAnalysisPipeline({ files: [{type:"fec", buffer}] })
       ↓
  [runFecPipeline]
    → parseFec(buffer.toString("utf8"))
        - parse 18 colonnes officielles (art. A47 LPF), délimiteur | / TAB / ,
        - regroupe lignes par (JournalCode, EcritureNum) → AccountingEntry[]
        - calcule trial balance par cumul débit/crédit par compte
    → aggregateEntriesToParsedFinancialData (même que Pennylane fallback)
    → mapParsedFinancialDataToMappedFinancialData → mappedData
    → computeKpis → KPI legacy
    → buildDailyAccounting → variables 2033-SD jour par jour
    → buildBalanceSheetSnapshot → bilan unifié
    → AnalysisDraft avec sourceMetadata.provider="fec", type="dynamic"
    (pas d'écriture Firestore intermédiaire — tout en mémoire)
```

## Adapter contract

Chaque adapter implémente l'interface `IntegrationAdapter` (cf. [types/connectors.ts](../types/connectors.ts)). Le minimum requis :

```ts
{
  provider: ConnectorProvider;
  fetchJournals(ctx, cursor): Promise<AdapterSyncPage<Journal>>;
  fetchLedgerAccounts(ctx, cursor): Promise<AdapterSyncPage<LedgerAccount>>;
  fetchContacts(ctx, cursor): Promise<AdapterSyncPage<Contact>>;
  fetchEntries(ctx, cursor): Promise<AdapterSyncPage<AccountingEntry>>;
  fetchInvoices(ctx, cursor): Promise<AdapterSyncPage<Invoice>>;
  fetchTrialBalance?(connection, periodStart, periodEnd): Promise<NormalizedTrialBalanceEntry[]>;
  fetchBankAccounts?(ctx, cursor): Promise<AdapterSyncPage<BankAccount>>;
  fetchBankTransactions?(ctx, cursor): Promise<AdapterSyncPage<BankTransaction>>;
  refreshAuth?(connection): Promise<ConnectorAuth>;
}
```

**Convention de fichiers** (regardez Pennylane/MyUnisoft/Odoo pour la référence) :

```
services/integrations/adapters/<provider>/
  ├ auth.ts       Build des modes d'auth (company_token, partner_jwt, odoo_session, …)
  ├ client.ts     HTTP client (Bearer headers, retry, base URL via env)
  ├ mappers.ts    raw API payload → entité unifiée (Journal, Contact, Invoice, …)
  ├ fetchers.ts   1 fonction par entité, gère cursor + filter de période
  └ index.ts      export const xxxAdapter: IntegrationAdapter = {...}
```

## Ajouter un nouveau provider

Procédure (test : ajout de Sage Generation Experts).

1. **Étendre les types** dans [types/connectors.ts](../types/connectors.ts) :
   - `ConnectorProvider` += `"sage"`
   - `ConnectorProviderSub` += `"sage_generation_experts"` etc. si besoin
   - Mode d'auth : ajouter à `ConnectorAuth` si différent (ex. `SageOAuthAuth`)
   - `EntityBase.source` étendre si nouveau provider

2. **Créer le dossier** `services/integrations/adapters/sage/` avec `auth.ts`, `client.ts`, `mappers.ts`, `fetchers.ts`, `index.ts`. Copier la structure d'un adapter existant (Pennylane est le plus proche pour l'OAuth, Odoo pour les API maison).

3. **Mappers** : convertir le format API → `Journal`, `LedgerAccount`, `Contact`, `AccountingEntry`, `Invoice`. Tous les champs doivent matcher exactement le contract des entités unifiées (cf. [`types/connectors.ts`](../types/connectors.ts) lignes 154-260).

4. **Brancher le registry** dans [`services/integrations/adapters/registry.ts`](../services/integrations/adapters/registry.ts) :
   ```ts
   export const ADAPTER_REGISTRY: Record<ConnectorProvider, IntegrationAdapter | undefined> = {
     pennylane: pennylaneAdapter,
     myunisoft: myUnisoftAdapter,
     odoo: odooAdapter,
     sage: sageAdapter, // ← ajout
     ...
   };
   ```

5. **Connection store** : si nouveau mode d'auth, étendre `createConnection`/`decryptAuth` dans [`connectionStore.ts`](../services/integrations/storage/connectionStore.ts).

6. **API routes** : créer `app/api/integrations/sage/{connect,sync,disconnect}/route.ts` en copiant les patterns de MyUnisoft (le plus simple, pas d'OAuth).
   - `connect` doit catcher `ConnectionAlreadyExistsError` → HTTP 409
   - `sync` doit appeler `enforceRouteRateLimit` (6 req/60 s)
   - `sync` doit calculer `periodStart = now - 12 mois`, `periodEnd = now`

7. **Front** : étendre [`AccountingConnectionWizard.tsx`](../components/integrations/AccountingConnectionWizard.tsx) avec une nouvelle carte + un step `SageStep` qui POST sur `/api/integrations/sage/connect` puis `/sync`.

8. **Tests** : copier `services/integrations/adapters/odoo/__tests__/mappers.test.ts` et adapter — au minimum tester chaque mapper sur un payload réaliste extrait de la sandbox du provider.

## Variables d'environnement

Voir [`.env.example`](../.env.example) section "Intégrations comptables". Les obligatoires en prod :

- `CONNECTOR_ENCRYPTION_KEY` — clé AES-256 pour chiffrer les tokens (32 octets)
- `MYUNISOFT_PARTNER_SECRET` — clé partenaire X-Third-Party-Secret
- `PENNYLANE_OAUTH_CLIENT_ID` / `PENNYLANE_OAUTH_CLIENT_SECRET` — pour le mode OAuth2
- `PENNYLANE_OAUTH_REDIRECT_URI` — doit matcher l'app enregistrée chez Pennylane

Optionnels (defaults pointent sur la prod) : `PENNYLANE_API_BASE_URL`, `MYUNISOFT_API_BASE_URL`, `PENNYLANE_OAUTH_AUTHORIZE_URL`, `PENNYLANE_OAUTH_TOKEN_URL`.

Pour les scripts de test sandbox : `PENNYLANE_TEST_TOKEN`.

## Sécurité

- Les tokens sont chiffrés AES-256-GCM avant stockage Firestore (cf. [`lib/server/tokenCrypto.ts`](../lib/server/tokenCrypto.ts)). Les rotations de clé ne sont pas encore outillées — éviter de changer `CONNECTOR_ENCRYPTION_KEY` après mise en prod.
- Aucun token n'est loggé en clair (audit fait, voir [section ci-dessous](#audit-de-sécurité)).
- Une seule connexion active par (userId, provider) — un POST sur `/connect` alors qu'il existe déjà une connexion active renvoie HTTP 409 avec `existingConnectionId` pour permettre au front de proposer Resync ou Disconnect.
- Rate limit `enforceRouteRateLimit` sur les 3 routes sync : 6 requêtes / 60 s par utilisateur.

### Audit de sécurité

Aucun `console.log` / `console.warn` / `console.error` du code d'intégration ne logue de valeur sensible (token, JWT, apiKey, mot de passe, partner secret). Les seuls usages de tokens sont :
- la construction du header `Authorization: Bearer ${token}` côté adapter clients
- le passage à la fonction d'encryption avant Firestore

Les logs côté serveur ne contiennent que des noms de variables d'env (ex. "PENNYLANE_TEST_TOKEN absent") ou des stats de pagination (nb de pages, durée, nb d'items).

## Période fiscale

**Période de sync** : 12 mois glissants par défaut, calculés dynamiquement (`now - 12 mois → now`). Vérifié dans :
- [`syncOrchestrator.ts:256-260`](../services/integrations/sync/syncOrchestrator.ts) (`resolvePeriod`)
- Routes `sync` Pennylane / MyUnisoft / Odoo (calcul identique en début de handler)

Les options `{ periodStart, periodEnd }` sur l'orchestrateur permettent de surcharger pour des cas custom (ex. resync d'un exercice complet).

**`fiscalYear` exporté** : `periodEnd.getFullYear()` ([buildAnalysisFromSync.ts:148](../services/integrations/sync/buildAnalysisFromSync.ts)) — c'est l'année de fin de période, ce qui colle pour un exercice civil ou un exercice décalé qui termine durant l'année courante. **Limitation connue** : le champ `fiscalYear` seul ne décrit pas un exercice décalé (ex. avril → mars). Pour interpréter correctement, le front doit lire `sourceMetadata.periodStart` + `sourceMetadata.periodEnd` qui contiennent les bornes ISO complètes.

Pas de hardcoding janvier-décembre dans la chaîne — le code est neutre vis-à-vis de la date de clôture.

## Lancer les tests

### Unit tests

```sh
# Tests unitaires des mappers (Pennylane/MyUnisoft/Odoo) + agrégateurs + parser FEC
npx vitest run services/integrations
npx vitest run services/parsers/__tests__/fecParser.test.ts
npx vitest run services/__tests__/analysisPipelineFec.test.ts
```

Le fichier de test représentatif des mappers : [`services/integrations/adapters/odoo/__tests__/mappers.test.ts`](../services/integrations/adapters/odoo/__tests__/mappers.test.ts) (36 cas couvrant les `unpackMany2one`, le pattern 2-call entries, les `read_group` trial balance, etc.).

### Volume / performance

```sh
# Stress test : 10k entries, mesure mémoire + durée par étage
npx vitest run services/integrations/aggregations/__tests__/volume.test.ts
```

### Smoke E2E (Pennylane sandbox)

Nécessite :
- Le dev server lancé sur `http://localhost:3000`
- `PENNYLANE_TEST_TOKEN` dans `.env`
- Les credentials Firebase Admin

```sh
# 1. Peupler la sandbox Pennylane (12 mois 2025 + 6 mois PME Nov 2025 → Avr 2026)
npx tsx --env-file=.env scripts/seed-sandbox.mts

# 2. Smoke E2E : connect + sync + lecture Firestore
npx tsx --env-file=.env scripts/smoke-e2e.mts
```

Le smoke E2E imprime les KPI principaux (CA, EBITDA, BFR, DSO, DPO, Quantis Score), les insights granulaires (top clients, secteurs, timeline 12 mois), et un dump complet de `dailyAccounting` + `balanceSheetSnapshot`.

### Idempotence

```sh
# 2 syncs successifs → vérifier qu'on n'a pas de doublons en base
npx tsx --env-file=.env scripts/idempotence-test.mts
```

## Diagnostic

- Connexion en `error` ou sync en `partial` : voir `lastSyncError` dans la collection Firestore `connections/{id}` ou via `GET /api/integrations/connections`.
- Données vides après sync mais entries en base : c'est probablement le trial balance qui a échoué côté API. Le pipeline retombe automatiquement sur l'agrégation des entries — le `mappedData` reste calculé, mais sans `balanceSheetSnapshot` car celui-ci dépend de la trial balance.
- Mauvais classement d'un compte vers la mauvaise variable 2033-SD : vérifier [`pcgAggregator.ts`](../services/integrations/aggregations/pcgAggregator.ts) — la cartographie est centralisée là (préfixes 3 et 4 chars + cas spéciaux 4456 TVA).
