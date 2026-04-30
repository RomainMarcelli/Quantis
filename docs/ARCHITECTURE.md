# Architecture Vyzor (repo Quantis)

> Document de référence pour comprendre l'état actuel du backend / data et la
> trajectoire long terme. Lecture cible : Romain (front), nouveaux contributeurs.
>
> Si tu cherches la couche IA (tooltips, chat, system prompts) : voir
> [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md).
> Si tu cherches le détail des intégrations (Pennylane, MyUnisoft, Odoo, FEC) :
> voir [INTEGRATIONS.md](./INTEGRATIONS.md).

## 1. Vue d'ensemble

```
┌─────────────── Sources ───────────────┐
│                                       │
│  Pennylane    MyUnisoft    Odoo       │  ← API connecteurs (CT)
│  (token)      (JWT)        (JSON-RPC) │
│                                       │
│  FEC (.txt/.csv)                      │  ← Upload comptable normalisé (CT)
│  PDF/Excel    (DocumentAI + parser)   │  ← Upload statique (CT)
│                                       │
│  Bridge       (PSD2)                  │  ← Banque temps réel (MT — non implémenté)
│                                       │
└────┬──────────────────────────────────┘
     │
     ▼
┌─────────── Adaptateurs ───────────────┐
│ services/integrations/adapters/*       │
│ • client.ts    (HTTP / RPC)            │
│ • auth.ts      (token / JWT / OAuth)   │
│ • mappers.ts   (provider → unifié)     │
│ • fetchers.ts  (paginated sync)        │
└────┬──────────────────────────────────┘
     │
     ▼
┌─────────── Pipeline unifié ───────────┐
│ services/integrations/sync/             │
│   syncOrchestrator     → fetch + persist│
│   buildAnalysisFromSync→ aggregate      │
│                                         │
│ services/integrations/aggregations/     │
│   pcgAggregator       → entries → PFD   │
│   trialBalanceAggregator → balance → PFD│
│   dailyAccountingBuilder → time series  │
│   balanceSheetSnapshotBuilder           │
│                                         │
│ services/mapping/                       │
│   parsedFinancialDataBridge → mappedData│
│                                         │
│ services/                               │
│   kpiSanitizer    → null si > 10¹² €    │
│   kpiEngine       → CalculatedKpis      │
└────┬────────────────────────────────────┘
     │
     ▼
┌─────────────── Firestore ─────────────┐
│ analyses/                               │
│ connections/                            │
│ journals/  ledger_accounts/  contacts/  │
│ accounting_entries/  invoices/          │
│ bank_accounts/  bank_transactions/      │  ← bancaire MT
└────┬────────────────────────────────────┘
     │
     ▼
┌────────────────── Front ───────────────┐
│ app/{synthese,analysis,documents}      │
│ components/{synthese,dashboard,...}    │
│ lib/temporality (filtre période)       │
│ lib/source       (analyse active)      │
│ lib/kpi/kpiRegistry  ← source de vérité│
└────────────────────────────────────────┘
```

**Principe directeur** : toutes les sources convergent vers le même schéma
pivot (`MappedFinancialData`) avant `computeKpis`. Le front ne sait pas et n'a
pas à savoir d'où viennent les données — il consomme `analysis.kpis`,
`analysis.dailyAccounting` et `analysis.balanceSheetSnapshot`.

## 2. Le contrat de données central

Trois objets composent ce contrat. Tout le reste est dérivé.

### `MappedFinancialData` — schéma pivot statique (69 champs)

Type défini dans [`types/analysis.ts`](../types/analysis.ts). Codes alignés sur
le formulaire fiscal **2033-SD** (déclaration d'IS PME). Ce sont les variables
dont chaque source doit produire la valeur, peu importe la voie d'entrée :

- **Bilan** (36 champs) : `total_actif_immo`, `total_stocks`, `clients`,
  `dispo`, `total_actif`, `capital`, `total_cp`, `emprunts`, `fournisseurs`,
  `dettes_fisc_soc`, `total_passif`, etc.
- **P&L** (28 champs) : `ventes_march`, `prod_vendue`, `total_prod_expl`,
  `achats_march`, `ace`, `salaires`, `charges_soc`, `dap`, `total_charges_expl`,
  `ebit`, `prod_fin`, `charges_fin`, `is_impot`, `resultat_exercice`, etc.
- **Helpers** : `n` (numéro d'exercice), `ca_n_minus_1`, `delta_bfr`.

`computeKpis(MappedFinancialData) → CalculatedKpis` est l'entrée unique du
calcul KPI — référence dans [`services/kpiEngine.ts`](../services/kpiEngine.ts).

### `dailyAccounting[]` — granularité journalière (sources dynamiques)

Type [`DailyAccountingEntry`](../types/connectors.ts) :
```ts
{ date: "YYYY-MM-DD"; values: Record<PnlVariableCode, number>; entryCount: number }
```

Construit par [`buildDailyAccounting`](../services/integrations/aggregations/dailyAccountingBuilder.ts)
à partir des écritures comptables (`AccountingEntry[]`). Une ligne par jour
non vide ; les 28 variables P&L 2033-SD sont sommées sur les écritures du jour.

**Usage** : permet à [`recomputeKpisForPeriod`](../lib/temporality/recomputeKpisForPeriod.ts)
de re-filtrer les KPIs flow (CA, VA, EBITDA, charges) sur la période choisie
par la `TemporalityBar`. Les KPIs bilan (BFR, dispo, total_cp…) restent ceux
du `balanceSheetSnapshot` car ils sont à un instant T.

**Annualisation** : depuis le commit `39e3fbc`, les ratios temporels (DSO, DPO,
rot_bfr, rot_stocks) utilisent `periodDays` (= span calendaire de la fenêtre
sélectionnée) à la place du `365` codé en dur. Évite les "DSO de 1 906 jours"
quand on filtre sur un mois.

### `balanceSheetSnapshot` — bilan à un instant T

Type [`BalanceSheetSnapshot`](../types/connectors.ts) :
```ts
{ asOfDate: "YYYY-MM-DD"; periodStart: "YYYY-MM-DD"; values: Record<BalanceSheetVariableCode, number> }
```

Construit par [`buildBalanceSheetSnapshot`](../services/integrations/aggregations/balanceSheetSnapshotBuilder.ts)
à partir d'une `NormalizedTrialBalanceEntry[]`. Couvre les 36 variables bilan.
Pas un historique — uniquement l'état le plus récent connu.

### `bankAccounts[]` + `bankTransactions[]` — couche bancaire (MT)

**Pas encore implémenté.** Réservé pour Bridge (PSD2). Voir section §6.

## 3. Sources et adaptateurs

Tableau récap (état actuel + roadmap) :

| Source | Auth | Provider sub | État | Test live |
|---|---|---|---|---|
| Pennylane | Company token | `pennylane_company` | ✅ Production | Sandbox token validée |
| MyUnisoft | Partner JWT | `myunisoft_company` | ✅ Production | Token cabinet à fournir |
| Odoo | API key + login | `odoo_company` | ✅ Production | Compte trial à fournir |
| FEC | Upload `.txt`/`.csv` | n/a (statique) | ✅ Production | Tests unitaires + sandbox |
| PDF (liasse) | Upload | n/a (statique) | ⚠ Parser v1 (qualité variable) | À renforcer (parser v2 PDF) |
| Excel | Upload | n/a (statique) | ✅ Mapping basique | OK pour balance simple |
| Bridge | OAuth2 PSD2 | `bridge_bank` | 🔮 MT — non commencé | — |

Chaque adapter live respecte le contrat [`IntegrationAdapter`](../types/connectors.ts)
avec les méthodes `authenticate`, `fetchJournals`, `fetchLedgerAccounts`,
`fetchContacts`, `fetchAccountingEntries`, `fetchInvoices`, `fetchTrialBalance`.

Le sync est orchestré par [`runSync`](../services/integrations/sync/syncOrchestrator.ts)
qui :
1. Charge la `Connection` (token déchiffré).
2. Boucle sur chaque entité avec sa propre pagination.
3. Persiste via [`entityStore`](../services/integrations/storage/entityStore.ts)
   en upsert idempotent (doc id = `sanitize(connectionId_externalId)`).
4. Met à jour `lastSyncAt` + `lastSyncStatus` sur la connection.

Période fenêtrée par `DEFAULT_INITIAL_PERIOD_MONTHS = 36` (cf.
[syncOrchestrator.ts](../services/integrations/sync/syncOrchestrator.ts) — la
constante est exportée pour que les routes API utilisent la même fenêtre).

## 4. Registre KPI

Source de vérité unique : [`lib/kpi/kpiRegistry.ts`](../lib/kpi/kpiRegistry.ts).

Contient pour chaque KPI :
- formule humaine + pseudo-code,
- unité (currency, percent, days, ratio, score),
- tooltip (explication, signaux, benchmark sectoriel quand fiable),
- questions IA suggérées (`whenGood` / `whenBad`),
- seuils danger / warning / good,
- leviers de simulation,
- dépendances (codes 2033-SD ou KPIs amont),
- couche source (`accounting` / `banking` / `both`),
- phase roadmap (`CT` / `MT` / `LT`).

35 KPIs aujourd'hui, tous en phase **CT** (calculés par `computeKpis`). Les
catégories (`creation_valeur`, `investissement`, `financement`, `rentabilite`,
`tresorerie`, `score`) servent à l'organisation des onglets dashboard.

**Règle d'or** : aucun composant ne hardcode de tooltip, seuil ou question. Si
une nouvelle pièce d'UI a besoin d'une de ces infos, elle lit le registre via
`getKpiDefinition(id)`.

## 5. Simulation (What-If)

Module [`lib/simulation/simulationEngine.ts`](../lib/simulation/simulationEngine.ts).

Principe : aucune nouvelle formule. La simulation = `computeKpis` ré-exécutée
sur un `MappedFinancialData` modifié. Garantit cohérence avec les chiffres du
dashboard.

Helpers :
- `applyLeverDeltas(base, deltas)` : pure function, ne mute pas l'input.
- `runSimulation(scenario, base, leverDeltas)` : applique les deltas, recalcule
  les KPIs, retourne avant/après + diffs sur les KPIs déclarés affectés.

Catalogue de 5 scénarios par défaut : embauche, hausse de prix, réduction de
charges, nouvel emprunt, perte d'un client majeur. Chacun expose 1 à 3 leviers
visibles + d'éventuels leviers `hidden` pour propager aux agrégats
(`total_prod_expl`, `creances`).

**Limite documentée** : `kpiEngine.computeKpis` lit `resultat_net` directement
depuis `mappedData.res_net` (donnée stockée). La simulation n'inclut donc pas
`resultat_net` dans `affectedKpis` tant qu'on n'aura pas ajouté un cascade
explicite — décision MT.

## 6. Couche bancaire Bridge (MT)

**État actuel : non implémenté.** Section archi pour cadrer la suite.

Bridge (filiale Crédit Mutuel Arkéa) expose une API PSD2 qui produit :
- comptes bancaires de l'utilisateur (multi-banques),
- transactions temps réel (D-1 typique),
- catégorisation automatique (loyer, salaire, fournisseur…).

**Stockage Firestore prévu** :
- `bank_accounts/` : un doc par compte bancaire connecté
  (id, iban, banque, soldeCourant, dernierRefresh, connectionId).
- `bank_transactions/` : un doc par transaction
  (id, accountId, date, montant, libellé, contrepartie, categoryHint).

Ces collections sont **séparées** des données comptables. Le rapprochement
(matching transactions ↔ écritures) est une feature MT/LT à part entière.

**KPIs bancaires Bridge** (à ajouter au registre en phase MT) :
- `realtime_balance` (somme des comptes connectés, mis à jour D-1)
- `realtime_burn_rate` (sortie nette mensuelle réelle, par catégorie)
- `realtime_runway` (mois de cash dispo, basé sur burn réel et non comptable)

Ces KPIs ont `sourceLayer: "banking"`. Les KPIs comptables ont `sourceLayer:
"accounting"`. Quelques KPIs (ex. `tn`, `disponibilites`) auront `sourceLayer:
"both"` quand on aura la double source — la valeur bancaire prend alors
priorité (plus à jour que la balance comptable).

**Rapprochement** (LT) : matching transactions Bridge ↔ écritures comptables.
Algo non spécifié — base : score (date ± 3 jours, montant exact, contrepartie
fuzzy match).

## 7. Front : structure des composants

Hiérarchie cible (post-refacto KpiCard générique) :

```
SyntheseView (route /synthese)
  ├── ActiveSourceBadge      (header)        ← lib/source/activeSource
  ├── TemporalityBar         (filtre global) ← lib/temporality
  └── SyntheseDashboard
       ├── HealthScore       (cadran)        ← KpiCard("healthScore")
       ├── KpiCard("ca")     (tile)
       ├── KpiCard("ebitda") (tile)
       └── ...

AnalysisDetailView (route /analysis/[id])
  ├── ActiveSourceBadge
  ├── TemporalityBar
  └── DashboardLayout
       ├── ValueCreationTest    ← onglet "Création de valeur"
       ├── InvestmentTest       ← onglet "Investissement"
       ├── FinancingTest        ← onglet "Financement"
       └── RentabilityTest      ← onglet "Rentabilité"
       (chacun = grille de KpiCard)

DocumentsView (route /documents)
  ├── ConnectionsPanel
  ├── AccountingConnectionWizard
  └── AnalysisCardGrid
       └── AnalysisCard (avec bouton "Utiliser comme source active")
```

**Composant générique cible** : `KpiCard` (à construire). Reçoit un `kpiId`,
va chercher dans `KPI_REGISTRY` la définition complète, rend :
- valeur (formatée selon `unit`),
- icône IA + tooltip (`tooltip.explanation` au survol),
- bouton "Question suggérée" → ouvre `AiChatPanel` avec `whenGood`/`whenBad` selon le seuil,
- couleur d'état basée sur `thresholds`.

**Composant `SimulationWidget`** : reçoit un `scenarioId`, lit
`SIMULATION_SCENARIOS`, affiche les sliders (leviers visibles uniquement),
recalcule via `runSimulation` à chaque changement.

**Composant `AiChatPanel`** : panneau latéral. Voir
[AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md) pour le détail.

## 8. Roadmap synthétique

| Phase | Périmètre |
|---|---|
| **CT (déjà livré)** | Pipelines Pennylane + MyUnisoft + Odoo + FEC + PDF v1. Tous les 35 KPIs `CalculatedKpis`. Garde-fous (sanitizer, healthScore null sur ca=0, anomaly warnings DSO/DPO). TemporalityBar adaptive. Source active multi-providers. Registre KPI + moteur de simulation (fondation). |
| **MT (next)** | Bridge bancaire (sync + KPIs realtime). Rapprochement basique (matching score). KpiCard générique consommant le registre. AiChatPanel niveaux 1+2. Cascade `resultat_net` dans la simulation. Parser PDF v2 (Document AI tuning). |
| **LT** | Multi-exercices (comparaison N/N-1/N-2 native). Benchmarking sectoriel automatique. AiChatPanel niveau 3 (chat libre multi-tour). Module forecast prédictif. |

## 9. Points de vigilance

1. **Source statique vs dynamique** : `analysis.dailyAccounting` peut être vide
   (PDF/Excel). Le front doit alors masquer la TemporalityBar et tomber sur
   `analysis.kpis` (annuel). Cf.
   [`shouldShowTemporalityBar`](../lib/temporality/availableRange.ts).

2. **Période sélectionnée hors plage** : si l'utilisateur navigue hors des
   bornes du `dailyAccounting`, `recomputeKpisForPeriod` retombe sur l'annuel
   et la TemporalityBar affiche "Aucune donnée sur cette période".

3. **Garde-fous sanitizer** : depuis le commit `ff0e1fe`, toute valeur
   `mappedData` > 10¹² € (ou < -10¹² €) est nullée + warning. Protège contre
   les bugs de parsing PDF (cas SORETOLE : stocks à 6,57×10²⁶ €).

4. **healthScore = null** : le score retourne `null` si `ca === 0` et qu'au
   moins un autre signal existe — distingue "input vide" de "parsing partiel".

5. **Annulation des doublons de connexion** : `createConnection` lève
   `ConnectionAlreadyExistsError` (409) si une connexion `active` existe déjà
   pour le couple `(userId, provider)`. Force un disconnect explicite avant
   reconnect, évite les analyses fantômes.

## 10. Outils ops

Scripts utilitaires sous `scripts/` (tous en `.mts`, lancés via
`npx tsx --env-file=.env scripts/<file>`) :

- `purge-user-firestore.mts <userId> [--apply]` — purge complète d'un user
  (analyses + connexions + entités). Dry-run par défaut.
- `reset-pennylane-sandbox.mts <userId>` — reset complet : connect + sync 36
  mois + build analyse + rapport KPIs + couverture écrans.
- `audit-pennylane-sandbox.mts` — audit live API (sans toucher Firestore) :
  écritures, trial balance, variables 2033-SD, KPIs.
- `inspect-pennylane-analysis.mts` — dump une analyse Firestore + dailyAccounting bucketé.
- `rebuild-analysis-from-entities.mts <userId> <connectionId> [months]` —
  ré-aggrège les entités en mémoire (skip runSync).
- `delete-analysis.mts <id> <expectedUserId>` — suppression ciblée gated.
- `find-soretole-history.mts`, `cleanup-test-uids.mts`, etc. — historiques.

Tous filtrent strictement par `userId`. Aucun n'écrit côté Pennylane/MyUnisoft/Odoo.
