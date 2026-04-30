# Changelog — branche `feat/session-complete`

> Document généré à la fin de la session. Couvre les **30 commits** poussés
> sur `feat/session-complete` depuis la divergence avec `main` (HEAD `269c573`).
> HEAD courant : `24b2d07`.
>
> Trois sections :
>
> 1. **Changelog technique** (pour Romain) — commits par ordre chronologique,
>    fichiers modifiés, tests, décisions techniques.
> 2. **Changelog produit** (pour le PO) — regroupé par feature.
> 3. **Décisions d'architecture** — choix structurants pris pendant la session.

---

## Section 1 — Changelog technique

### `c0c2291` — feat: MyUnisoft adapter — client, auth, mappers, fetchers, routes (30 tests)

Premier gros commit qui pose en réalité **toute la fondation des intégrations**
dynamiques (Pennylane + MyUnisoft) ainsi que la TemporalityBar.

- **API** (`app/api/integrations/`) : routes `connections`, `pennylane/{connect,disconnect,sync,callback}`, `myunisoft/{connect,disconnect,sync}`.
- **Adapters** (`services/integrations/adapters/{pennylane,myunisoft}/`) : 5 fichiers chacun (`auth`, `client`, `fetchers`, `mappers`, `index`) + registry.
- **Pipeline unifié** (`services/integrations/aggregations/`) :
  - `pcgAggregator` (entries → ParsedFinancialData)
  - `trialBalanceAggregator` (balance → ParsedFinancialData)
  - `dailyAccountingBuilder` (entries → time series 2033-SD)
  - `balanceSheetSnapshotBuilder` (trial balance → snapshot bilan)
  - `granularInsightsBuilder`, `kpisTimeSeriesBuilder`, `vatInsightsBuilder`
- **Storage** (`services/integrations/storage/`) : `connectionStore` (tokens chiffrés, dup-prevention), `entityStore` (upsert idempotent par `connectionId+externalId`).
- **Sync** (`services/integrations/sync/`) : `syncOrchestrator` + `buildAnalysisFromSync`.
- **Front** : `TemporalityBar`, `temporalityContext`, `recomputeKpisForPeriod`, `ConnectionsPanel`, `MyUnisoftConnectCard`, `PennylaneConnectCard`, debug view.
- **Sécurité serveur** : `lib/server/requireAuth`, `lib/server/tokenCrypto` (AES-GCM avec dérivation de clé via PBKDF2).
- **Types** : `types/connectors.ts` (Connection, AccountingEntry, NormalizedTrialBalanceEntry, PnlVariableCode 28 codes, BalanceSheetVariableCode 36 codes, IntegrationAdapter contract).
- **Tests** : 30 sur les mappers MyUnisoft + 7 fichiers de tests sur les agrégateurs + tokenCrypto test.
- **Décision** : tous les providers convergent vers le **même schéma pivot** (`MappedFinancialData`, codes 2033-SD). Le front ne sait pas d'où viennent les données.

### `43ca46f` — feat: Odoo adapter — JSON-RPC client, auth, mappers, fetchers, routes (36 tests)

- **API** : `odoo/{connect,disconnect,sync}` routes.
- **Adapter** : 5 fichiers (auth via `OdooSessionAuth` = instance + login + API key, client JSON-RPC, mappers, fetchers).
- **Front** : `OdooConnectCard`.
- **Tests** : 36 sur les mappers.
- **Décision** : Odoo utilise du JSON-RPC sur `/jsonrpc` plutôt que du REST. Le client est isolé pour ne pas polluer l'adapter pattern uniforme.

### `1440e59` — feat: FEC parser — unified schema, auto-detect pipe/tab/csv, wired into analysisPipeline (13 tests)

- **Parser** : `services/parsers/fecParser.ts` — détecte les 3 délimiteurs courants (`|`, `\t`, `,`), parse les 18 colonnes obligatoires du FEC (art. A47 A-1 LPF), produit `AccountingEntry[]` + `NormalizedTrialBalanceEntry[]`.
- **fileParser** : sniff FEC via `looksLikeFec(text)` sur les `.txt`/`.csv` (vérification stricte des en-têtes obligatoires).
- **Pipeline** : nouvelle branche `runFecPipeline` dans `analysisPipeline` qui rejoue exactement la même chaîne que la sync dynamique (pcgAggregator + dailyAccountingBuilder + balanceSheetSnapshotBuilder).
- **Tests** : 13 unitaires sur le parser + tests d'intégration `analysisPipelineFec.test.ts`.
- **Décision** : le FEC est traité comme une **source dynamique** (produit `dailyAccounting` + `balanceSheetSnapshot`), pas comme un upload statique — il a la granularité quotidienne.

### `637cb5a` — feat: enriched seed — 6 months PME accounting

- `scripts/seed-sandbox.mts` : seed Pennylane sandbox avec ~80 écritures sur 12 mois (10 customers, 8 suppliers, 12 products, 4 invoices, salaires mensuels, loyer, taxes trimestrielles, DAP).
- **Décision** : un seed enrichi est nécessaire pour avoir suffisamment de couverture sur tous les KPI (CA, VA, EBITDA, BFR, charges, etc.).

### `f5d85d7` — feat: connection dup-prevention (409), security audit, .env.example, docs/INTEGRATIONS.md

- `connectionStore.createConnection` lève `ConnectionAlreadyExistsError` (HTTP 409) si déjà actif pour `(userId, provider)`.
- **Front** : `AccountingConnectionWizard`, `DataSourceSelector`, `SourceBadge` ajoutés.
- **Doc** : `.env.example` + `docs/INTEGRATIONS.md` (guide intégrations).
- **Assets** : logos providers (Pennylane, MyUnisoft, Odoo, Tiime).
- **Décision** : interdire les doublons à la source plutôt que de les nettoyer en post-traitement.

### `3ca7179` — feat: financial PDF report v2 — Quantis branding, trend chart, recommendations, condensed layout

- **Route** : `app/api/reports/financial/route.ts`.
- **Service** : `services/reports/financialReportPdf.ts` (TS) + `services/reports/python/financial_report.py` (génération PDF via reportlab côté Python).
- **Recommandations** : `services/reports/recommendations.ts` (text snippets dérivés des KPI).
- **Front download** : `lib/reports/downloadFinancialReport.ts`.
- **Smoke** : `scripts/smoke-financial-report.mts`.

### `ff0e1fe` — fix: dashboard guardrails — empty-period filter + aberrant value sanitizer + healthScore guard

Trois garde-fous critiques contre les données pourries :

1. **`recomputeKpisForPeriod`** : si `dailyAccounting` existe mais `filtered.length === 0` (période hors plage), on retourne `analysis.kpis` au lieu d'écraser par des zéros.
2. **`services/kpiSanitizer.ts`** (nouveau) : rejette toute valeur `mappedData` > 10¹² € ou non-finie (Infinity/NaN), retourne warnings serveur. Câblé dans les 2 branches d'`analysisPipeline` (PDF static + FEC). 5 tests.
3. **`scoreHealth`** dans `kpiEngine` : retourne `null` si `ca === 0` ET au moins un autre signal non-null (workingCapital/grossMarginRate/netProfit/cashRunwayMonths). Distingue "input vide" de "parsing partiel".

- **TemporalityBar** : défaut initial passe de "mois courant" à "12 derniers mois glissants" (`buildRolling12MonthsFromDate`).
- **Tests** : +8 sur kpiSanitizer + healthScore guard.
- **Décision** : un null explicite vaut mieux qu'une valeur fausse. Le healthScore=100 sur EBITDA=-159k € (bug observé sandbox SORETOLE) ne doit plus jamais arriver.

### `ffd1d20` — chore(scripts): Firestore ops tooling

6 scripts admin :
- `audit-analyses.mts`, `cleanup-test-uids.mts`, `cleanup-pennylane-smoketest.mts`, `delete-analysis.mts` (gated sur expectedUserId), `diag-pdf-analysis.mts` (dump détaillé d'une analyse), `find-soretole-history.mts`.

### `02b8b6f` — feat(dashboard): show "Données insuffisantes" instead of misleading "0" when healthScore is null

- `components/dashboard/HealthScore.tsx` : gros tiret "—" centré au lieu d'animer un "0" trompeur.
- `lib/dashboard/premiumDashboardAdapter.ts` : `getPremiumHealthState(null).label` = "Données insuffisantes" (au lieu de "Indéterminée").

### `7c6be84` — feat(dashboard): replace "N/D" by "Données insuffisantes" across all KPI tiles

- Constante `INSUFFICIENT_DATA_LABEL` ajoutée à `components/dashboard/formatting.ts`.
- 11 fichiers modifiés (KPIBlock, KPIWide, QuantisScoreCard, BreakEvenChart, BreakEvenTooltip, 4 onglets navigation, formatting, test).
- Test `dashboardPremium.test.tsx` aligné.

### `f5a7f61` — feat(source): explicit active analysis selection + dashboard source indicator

- **Helper** : `lib/source/activeSource.ts` — read/write/clear `quantis.activeAnalysis` localStorage. Résolveur avec priorité dynamic > FEC > upload, plus récent à priorité égale.
- **Hook** : `lib/source/useActiveAnalysisId.ts` (subscribes aux storage events + custom events).
- **Composants** : `ActiveSourceBadge` (header), `AnalysisCard` (bouton "Utiliser comme source active", bordure dorée + badge "Active" pour l'active).
- **Bonus tech** : `DEFAULT_INITIAL_PERIOD_MONTHS` 12 → 36 dans syncOrchestrator (l'apport en capital + emprunts + trésorerie initiale étaient absents du snapshot avec une fenêtre 12 mois).
- **Renommage** : `tresorerie` → `disponibilites` dans `PremiumKpis` + tag "Trésorerie nette" → "Disponibilités" dans DashboardLayout.
- **Tests** : 9 sur le résolveur.

### `cb57356` — chore(scripts): Pennylane sandbox audit + Firestore analysis inspector

- `scripts/audit-pennylane-sandbox.mts` : audit live API (sans Firestore).
- `scripts/inspect-pennylane-analysis.mts` : dump d'une analyse Firestore + dailyAccounting bucketé par année.

### `e75c483` — fix(sync): align all 3 sync routes on DEFAULT_INITIAL_PERIOD_MONTHS

Bug : les routes API `pennylane/myunisoft/odoo /sync` hardcodaient encore 12 mois pour `buildAndPersistAnalysisFromSync`, ignorant la constante du syncOrchestrator. Correctif : export de la constante + import dans les 3 routes.

### `c2ba2b0` — chore(scripts): re-sync Pennylane + rebuild analysis from existing entities

- `scripts/resync-pennylane.mts` (full pipeline).
- `scripts/rebuild-analysis-from-entities.mts` (skip runSync, ré-aggrège les entités).

### `9626a16` — fix(dashboard): tile tag was still 'Trésorerie nette' + reset stale temporality localStorage

- Correction d'un Edit oublié (le tag visuel n'avait pas suivi le rename du champ).
- Bump `quantis.temporality.v1` → `v2` pour invalider les états périmés (utilisateurs qui avaient navigué jusqu'à "Année 2027").
- Test ajouté sur `buildRolling12MonthsFromDate`.

### `39e3fbc` — fix(dashboard): annualize DSO/DPO/BFR ratios + fix marge nette bug + add anomaly warnings

- **`recomputeKpisForPeriod`** : remplace `× 365` codé en dur par `× periodDays` (= span calendaire) dans DSO/DPO/rot_bfr/rot_stocks. Plus de DSO à 1 906 jours en mode mensuel.
- **`ValueCreationTest`** : fix bug d'affichage "Marge nette -13 866 %" — on passait `kpis.netProfit` (en €) à `formatPercent` qui le considérait déjà en %.
- **`InvestmentTest`** : nouvelle prop `anomaly` sur `DelayCard` qui rend la valeur en rouge + bandeau ⚠ quand DSO/DPO/DIO/rot_bfr dépassent 365 j.

### `704eb61` — feat(temporality): adapt TemporalityBar to data availability

- **Helper** : `lib/temporality/availableRange.ts` — `computeAvailableRange(analysis)` + `shouldShowTemporalityBar(analysis)`. 6 tests.
- **TemporalityBar** : props `availableRange` + `daysInPeriod`. Flèches grisées/disabled aux bornes. Bandeau ambre "Aucune donnée sur cette période" si hors plage.
- **SyntheseView/AnalysisDetailView** : masque la bar pour les sources statiques (PDF/Excel sans daily) → texte simple "Période · Exercice YYYY".

### `012c043` — chore(scripts): full Pennylane sandbox reset

- `scripts/purge-user-firestore.mts <userId> [--apply]` (dry-run par défaut).
- `scripts/reset-pennylane-sandbox.mts <userId>` : connect + sync + build + rapport KPIs + couverture écrans + check unicité.

### `8fa1156` — docs: architecture globale, kpiRegistry, simulationEngine — fondations pour P1/P2/IA

Trois fondations posées AVANT de coder l'UI :

- **`lib/kpi/kpiRegistry.ts`** : `KpiDefinition` typée + 38 KPIs renseignés (formula, formulaCode, tooltip vulgarisé, suggestedQuestions, thresholds, simulation levers, dependencies, sourceLayer, phase CT/MT/LT). 11 tests.
- **`lib/simulation/simulationEngine.ts`** : `applyLeverDeltas` (pure) + `runSimulation` qui réutilise STRICTEMENT `computeKpis` — pas de nouvelle formule. 5 scénarios (embauche, hausse_prix, reduction_charges, nouvel_emprunt, perte_client) avec leviers visibles + cachés (cascade vers agrégats `total_prod_expl`, `creances`). 16 tests.
- **`docs/ARCHITECTURE.md`** : 10 sections — schéma couches, contrat de données, sources/adapters, registre KPI, simulation, Bridge MT, structure front cible, roadmap, points de vigilance, scripts ops.
- **`docs/AI_ARCHITECTURE.md`** : 3 niveaux IA (tooltip déterministe / question suggérée / chat libre), format complet du system prompt, stockage Firestore `chats/{userId}/conversations/{id}/messages/{id}`, routes API prévues, observabilité, sécurité, roadmap.

### `d1139c8` — feat(ui): branch kpiRegistry/simulationEngine on dashboard + AI placeholder

- **`lib/kpi/kpiDiagnostic.ts`** : `getKpiDiagnostic(value, thresholds)` → 'good' | 'warning' | 'danger' | 'neutral'. Gère les seuils ascendants (CA-style) ET descendants (DSO-style). 8 tests.
- **`components/kpi/KpiTooltip.tsx`** : popover avec border-l dorée, max-w 350px, hover-controlled. Lecture exclusive depuis `getKpiDefinition`.
- **`components/simulation/SimulationWidget.tsx`** : sélecteur de scénario, sliders pour leviers visibles, recalcul live, panneau résultats avant→après avec flèches verte/rouge.
- **`SimulationToggleButton`** : câblé dans SyntheseView au-dessus du dashboard.
- **`app/assistant-ia/page.tsx`** + **`AssistantPlaceholder.tsx`** : page teaser avec 5 questions modèles.
- **Sidebar** : entrée "Assistant IA" (icône Bot) ajoutée dans les 3 vues (Synthese, Documents, AnalysisDetail).
- **Onglets navigation** : 16 tiles câblés avec `kpiId` (ca, tcam, ebe, va, marge_ebitda, point_mort, bfr, ratio_immo, capacite_remboursement_annees, caf, fte, solvabilite, gearing, tn, roe, roce).

### `305ec48` — chore(scripts): export kpiRegistry + simulation scenarios to xlsx for human review

- `scripts/dump-kpi-data.mts` (Node) → JSON.
- `scripts/build-kpi-review-xlsx.py` (Python, openpyxl) → xlsx avec 2 onglets, 262 cellules en jaune (= contenu subjectif à reviewer).

### `0c4441b` — fix(ui): simulator scaling + KPI tooltip placement + cockpit coverage

- **Bornes dynamiques** : `computeDynamicLeverBounds(lever, baseValue)` dans simulationEngine. Levier `absolute` → ±50 % de la valeur réelle, step adaptatif (0,05 % × magnitude). Levier `percent` → bornes statiques. 8 nouveaux tests.
- **SimulationWidget** : sliders consomment les bornes dynamiques, sous-texte mono "Valeur actuelle : X €. Variation simulée : Y % (Z €)".
- **Intro vulgarisée** : description du scénario rendue dans un bloc dédié au-dessus des sliders.
- **KpiTooltip** : position au-dessus par défaut, auto-flip si débordement, z-index 999, max-h + overflow-y, halo doré subtil.
- **Cockpit** : KPIBlock, KPIWide, HealthScore acceptent `kpiId`. DashboardLayout passe les 4 (ca, disponibilites, ebe, healthScore).

### `96e4a28` — fix(ui): KpiTooltip via portal + missing tooltips on special cards

- **Portal** : `createPortal(document.body)` pour échapper au `overflow: hidden` des cartes parentes (`precision-card`).
- **Tooltips ajoutés** : `resultat_net`, `tmscv` (ValueCreation), `rot_bfr`, `dso`, `rot_stocks`, `dpo` (Investment), `effet_levier` (Rentability). DelayCard a maintenant les props `kpiId`/`kpiValue`.

### `be9ccb7` — fix(ui): KpiTooltip — bottom anchoring, gold transparent fill, backdrop blur, liquidity tooltips

- **Anchor `bottom`** au lieu de `top` pour le mode "above" → plus de gap fantôme dû à la sur-estimation de hauteur.
- **Backdrop** : overlay plein écran `rgba(9,9,11,0.55)` + `backdrop-blur(3px)`.
- **Fond doré transparent** : `rgba(197,160,89,0.12)` + `backdrop-blur-xl` (au lieu de bleu marine `#1A1A2E`).
- **Liquidity** : champ `kpiId` ajouté à `FinancingIndicator` type, `buildLiquidityIndicators` peuple `liq_gen`/`liq_red`/`liq_imm`.

### `4cbfea2` — fix(ui): KpiTooltip — fluid enter/exit animation

- Machine d'états `renderInDom` + `animateIn` avec double-RAF pour garantir que la transition CSS s'applique vraiment.
- Animation enter (220 ms, `cubic-bezier(0.16, 1, 0.3, 1)` = ease-out-expo) : opacity 0→1, scale 0.96→1, translateY ±8 px → 0, glow doré progressif.
- Backdrop : 250 ms (légèrement plus lent → impression de hiérarchie).

### `c2b7b89` — fix(ui): KpiTooltip — softer backdrop blur (-10%) + tighter trigger gap (-25%)

- Backdrop blur 3 → 2,7 px.
- POPOVER_GAP 8 → 6 px.

### `4b8dfbf` — feat(ai): two entry points to assistant + KPI-contextualized placeholder

- **KpiTooltip** : 2 boutons interactifs (gros = question pré-remplie + petit "Ou ouvrir le chat sans question →"). `<Link>` next/link au lieu de `useRouter` (tolérant aux tests SSR).
- **AssistantPlaceholder** : lit `?kpi=` et `?q=` (Suspense local en Next 16). Mode contextuel avec 5 questions générées (whenBad, whenGood, +3 templates avec le shortLabel substitué). Champ texte visible mais désactivé.

### `39e0f00` — fix(ui): KpiTooltip — align horizontally with parent KPI card, not trigger icon

- `findKpiCardAncestor()` remonte le DOM jusqu'à `precision-card` ou `<article>`.
- Bord du popover s'aligne sur le bord de la TUILE, plus sur le trigger.

### `fb87a76` — fix(ui): KpiTooltip — vertical anchor on tile edges (top/bottom), not trigger

- Mode "above" : popover sort 6 px au-dessus du bord HAUT de la tuile.
- Mode "below" : popover sort 6 px sous le bord BAS de la tuile.
- Choix above/below basé sur l'espace au-dessus de la tuile (≥ 200 px).

### `24b2d07` — fix(ui): KpiTooltip — corner-to-corner overlap with parent tile

Refactor final : alignement **coin à coin** entre popover et tuile.
- Vertical : trigger dans la moitié haute → coin haut ; sinon coin bas.
- Horizontal : suit `align` (right par défaut).
- Le popover OVERLAPPE la tuile, le backdrop blur fait ressortir.
- `transform-origin` suit le coin ancré.
- `POPOVER_GAP` supprimé (plus de sens en mode coin-à-coin).

---

## Section 2 — Changelog produit

### Intégrations comptables

**Sources supportées** :
- **Pennylane** (token entreprise, OAuth2, ou token cabinet) — production.
- **MyUnisoft** (Partner JWT, clé partenaire en env var serveur) — production.
- **Odoo** (instance URL + database + login + API key) — production.
- **FEC** (upload `.txt` ou `.csv`, sniff automatique des en-têtes officiels art. A47 A-1 LPF) — production.
- **PDF** (liasse fiscale, Document AI + parser v1) — production, qualité variable selon le format.
- **Excel** (balance simple) — production.
- **Bridge** (PSD2, banque temps réel) — non implémenté, prévu MT.

**Parcours utilisateur de connexion** :
1. Page Documents → bloc "Connecter ma compta" → wizard `AccountingConnectionWizard`.
2. Sélection du provider (cards visuelles avec logos).
3. Saisie des credentials (token / login / API key selon provider).
4. Connexion testée immédiatement (route `/api/integrations/<provider>/connect` retourne 201 ou 409 si déjà active).
5. Sync initial automatique sur fenêtre 36 mois.
6. Production des entités Firestore (journals, ledger_accounts, contacts, accounting_entries, invoices) + de l'analyse (`analyses`).
7. Le badge "ActiveSourceBadge" en haut du dashboard signale "Pennylane · sync il y a 2h" (ou équivalent).

### Dashboard

**Cockpit Synthèse** :
- HealthScore (cadran central 0-100, label "Données insuffisantes" si null).
- KPI principaux : CA, Disponibilités, EBE.
- Tooltips IA sur chaque KPI principal.
- Bouton "✨ Simuler un scénario" pour ouvrir le widget What-If.

**4 onglets navigation** :
- **Création de valeur** : CA, TCAM, EBE, VA, marge EBITDA, point mort, résultat net + marge nette, TMSCV.
- **Investissement** : BFR, ratio immo, rotation BFR, DSO, DIO, DPO (avec warnings ⚠ si > 365 j).
- **Financement** : capacité de remboursement, CAF, FTE, solvabilité, gearing, trésorerie nette, 3 ratios de liquidité.
- **Rentabilité** : ROE, ROCE, effet de levier.

**TemporalityBar** :
- Défaut : "12 derniers mois glissants" (au lieu du mois courant).
- Plage de navigation calée sur les dates réelles de `dailyAccounting` (flèches grisées aux bornes).
- Badge "Aucune donnée sur cette période" si hors plage.
- Masquée pour les sources statiques (PDF/Excel) → texte simple "Exercice YYYY".

**Sélection de source active** :
- Une seule source active à la fois (`localStorage.quantis.activeAnalysis`).
- Priorité par défaut : dynamique (Pennylane > MyUnisoft > Odoo) > FEC > upload, plus récent à priorité égale.
- Bouton "Utiliser comme source active" sur chaque card Documents.
- Card active : bordure dorée + badge "Active". Autres cards : opacité réduite.

**Garde-fous données** :
- Valeurs `mappedData` > 10¹² € ou non-finies → null + warning serveur.
- `healthScore` = null si CA = 0 ET d'autres signaux présents (= parsing partiel).
- Affichage "Données insuffisantes" partout où une valeur est absente (au lieu de "N/D" ou "0" trompeur).
- Annualisation automatique des ratios temporels (DSO/DPO/rotation) en fonction de la période sélectionnée.
- Warnings ⚠ rouge sur les délais > 365 j.

### Tooltips IA (KPI explainer)

**Couverture** : 25 KPI ont un tooltip aujourd'hui (cockpit + 4 onglets + ratios de liquidité).

**Contenu** : tout vient de `lib/kpi/kpiRegistry.ts` (source de vérité unique) :
- Explication vulgarisée 3-4 lignes pour un dirigeant non-financier.
- Diagnostic contextuel (vert / rouge) selon les seuils franchis par la valeur courante.
- Benchmark sectoriel quand on a une donnée fiable (INSEE ESANE, Banque de France).
- Question suggérée adaptée (whenGood ou whenBad selon le diagnostic).
- Formule en pseudo-code pour les curieux.

**3 niveaux utilisateur** :
- **Niveau 1** (livré) : tooltip déterministe, 0 appel API, lecture directe du registre.
- **Niveau 2** (placeholder) : clic sur la question suggérée → page `/assistant-ia` contextualisée avec le KPI + 5 questions générées (whenBad, whenGood, "comparaison secteur", "facteurs", "évolution réaliste"). Implémentation chat = MT.
- **Niveau 3** (placeholder) : clic sur "Ou ouvrir le chat sans question →" → même page sans question pré-remplie, champ libre désactivé.

**Design tooltip** :
- Popover ancré coin-à-coin sur la tuile parente (overlap, pas adjacent).
- Fond doré transparent (`rgba(197,160,89,0.12)`) + backdrop-blur-xl.
- Animation enter en 220 ms ease-out-expo (opacity + scale + translateY + glow).
- Backdrop sur le reste de la page (`rgba(9,9,11,0.55)` + blur 2,7 px).
- Border-l dorée à `#C5A059`.

### Simulateur What-If

**5 scénarios** :
- **Embauche** : levier salaires + charges sociales (absolute).
- **Hausse de prix** : levier ventes_march + prod_vendue + total_prod_expl en cascade (percent).
- **Réduction de charges** : levier ace (percent).
- **Nouvel emprunt** : levier emprunts + dispo (absolute).
- **Perte d'un client majeur** : levier prod_vendue + clients + creances en cascade (percent).

**Bornes dynamiques** : pour les leviers `absolute`, min/max = ±50 % de la valeur réelle dans `mappedData`. Step adapté à la magnitude (0,05 % × valeur, plancher 100 €). Plus de sliders "0 → 150 k€" hors-sol.

**Comportement** :
- Sliders modifient le delta en temps réel.
- Sous chaque slider : "Valeur actuelle : X €. Variation simulée : Y % (Z €)".
- Recalcul instantané via `runSimulation` (qui réutilise `computeKpis` → zéro nouvelle formule).
- Panel résultats avant → après avec flèches verte (amélioration) ou rouge (dégradation), selon que le KPI est "plus grand = mieux" ou inversement (dérivé des seuils du registre).

**Limitation documentée** : `kpiEngine` lit `resultat_net` directement depuis `mappedData.res_net` (donnée stockée), donc la simulation ne fait pas bouger ce KPI tant qu'on n'aura pas câblé un cascade explicite.

### Rapport PDF financier

- Génération côté Python (reportlab) via service appelé par la route `/api/reports/financial`.
- Branding Quantis (logo, palette dorée).
- Trend chart, recommandations textuelles dérivées des KPI.
- Layout condensé sur 2-3 pages.

### Wizard de connexion

`components/integrations/AccountingConnectionWizard.tsx` — étapes :
1. Sélection provider (cards visuelles avec logos brand).
2. Champs de credentials adaptés au provider (token, login, API key + URL+database pour Odoo).
3. Test de connexion + erreur 409 explicite si une connexion active existe déjà.
4. Sync automatique au succès, redirection vers Documents.

### Sécurité

- **Tokens chiffrés** : `lib/server/tokenCrypto.ts` (AES-GCM, dérivation via PBKDF2 depuis `ENCRYPTION_KEY` env var).
- **Isolation par utilisateur** : toutes les queries Firestore filtrent strictement par `userId`. Les entités sont scopées par `userId+connectionId`.
- **Auth** : `lib/server/requireAuth.ts` valide le token Firebase Auth sur chaque route API protégée.
- **Anti-doublon** : `createConnection` lève une erreur 409 si une connexion active existe déjà pour `(userId, provider)` — évite les analyses fantômes.
- **RGPD** : suppression d'utilisateur via `purge-user-firestore.mts <userId> --apply` (purge analyses + connexions + 7 collections d'entités).
- **Pas de données sensibles dans les logs** : tokens chiffrés stockent un `tokenPreview` (4 premiers + 4 derniers chars) pour identification UI sans exposer le secret.

---

## Section 3 — Décisions d'architecture

Choix structurants pris pendant la session, avec leur justification.

### 1. Pipeline unifié — toutes sources convergent vers le même schéma 2033-SD

**Décision** : Pennylane, MyUnisoft, Odoo, FEC, PDF, Excel produisent tous le même `MappedFinancialData` (69 champs, codes 2033-SD) avant `computeKpis`.

**Pourquoi** : permet au front d'ignorer la source, d'appliquer les mêmes formules KPI partout, et de comparer des analyses entre elles (PDF de N-1 vs sync Pennylane de N).

**Coût** : un adapter par provider (5 fichiers chacun) + un agrégateur pivot (`pcgAggregator`). Mais le moteur KPI lui-même reste unique.

### 2. Une source active à la fois (`activeAnalysisId`)

**Décision** : pas de merge entre analyses. L'utilisateur sélectionne UNE analyse via Documents → "Utiliser comme source active". Le dashboard la lit seule.

**Pourquoi** :
- Un merge multi-source (PDF + sync Pennylane) ouvre une boîte de Pandore (priorisation par champ, dédoublonnage, conflits de période).
- L'expérience utilisateur reste limpide : "tu regardes les chiffres de TELLE analyse, point".
- Permet une comparaison side-by-side ultérieurement (LT) sans engagement actuel.

### 3. KpiRegistry comme source de vérité unique

**Décision** : aucun composant UI ne hardcode de tooltip, seuil, formule, question IA. Tout passe par `lib/kpi/kpiRegistry.ts`.

**Pourquoi** :
- Audit/review humain centralisé (cf. `kpi_review.xlsx` exporté avec 262 cellules en jaune).
- Couplage faible : ajouter un nouveau KPI = ajouter une entrée registre + un emplacement UI qui passe le `kpiId`. Le tooltip arrive gratuitement.
- Les futurs niveaux IA (chat libre, prompt système) peuvent injecter le contenu du registre sans réécrire de prompts.

### 4. SimulationEngine réutilise `computeKpis` (pas de formule dupliquée)

**Décision** : `runSimulation(scenario, mappedData, deltas)` = `computeKpis(applyLeverDeltas(mappedData, deltas))`. Pas de nouvelle formule métier dans le simulateur.

**Pourquoi** :
- Garantit que la simulation reflète exactement les chiffres affichés sur le dashboard (impossible d'avoir une dérive entre les deux).
- Adapter le simulateur quand le moteur KPI évolue = zéro travail.
- Limite documentée : `resultat_net` est stocké, pas recalculé — ne bouge pas dans la simulation. Décision MT.

### 5. 3 niveaux IA (tooltip / question suggérée / chat libre)

**Décision** : pas tout-en-un. On stratifie l'IA en 3 paliers de coût/latence/personnalisation.

**Pourquoi** :
- **Niveau 1** (tooltip déterministe) : 0 appel API. Couvre 80 % des besoins "expliquer ce KPI". Latence < 16 ms.
- **Niveau 2** (question suggérée, 1 appel) : contextualisé avec les KPI réels de l'entreprise via system prompt. Latence < 3 s. Coût ~0,01 $.
- **Niveau 3** (chat libre, multi-tour) : conversation persistante, history Firestore. Latence < 8 s par tour. Coût plus élevé mais usage plus rare.
- Permet de livrer l'expérience IA progressivement sans dépendre d'un chat complet dès le départ.

### 6. Bridge (banque PSD2) = couche complémentaire, pas remplacement comptable

**Décision** (architecturale, non implémentée) : `bank_accounts/` + `bank_transactions/` sont des collections Firestore SÉPARÉES des entités comptables. Le rapprochement (matching transactions ↔ écritures) est une feature MT/LT, pas un préalable.

**Pourquoi** :
- L'utilisateur veut voir SA banque temps réel SANS attendre que tout soit rapproché.
- KPIs bancaires (`realtime_balance`, `realtime_burn_rate`, `realtime_runway`) ont `sourceLayer: "banking"` dans le registre — distincts des KPIs comptables.
- Évite un couplage fort entre les deux qui fragiliserait Bridge si une banque casse.

### 7. Garde-fous "fail-safe over fail-silent"

**Décision** : valeurs aberrantes (parsing PDF qui produit 6,57×10²⁶ €) → null + warning, jamais propagées.

**Pourquoi** : un null explicite affiché en "Données insuffisantes" est honnête. Une valeur fausse propagée vers le healthScore qui retourne 100 sur une entreprise en faillite est dangereux pour la décision.

### 8. TemporalityBar adaptive

**Décision** : la TemporalityBar n'autorise pas de naviguer hors de la plage `dailyAccounting` réelle. Pour les sources statiques sans daily, elle disparaît au profit d'un texte "Exercice YYYY".

**Pourquoi** : montrer "Année 2027" à un utilisateur dont les données s'arrêtent en avril 2026 produit zéro insight et beaucoup de confusion. Le UX doit refléter la réalité des données.

---

## Documents de référence

| Fichier | Contenu (résumé une ligne) |
|---|---|
| [docs/ARCHITECTURE.md](./ARCHITECTURE.md) | Vue d'ensemble : couches, contrat de données, pipeline unifié, sources, registre KPI, simulation, Bridge MT, structure front, roadmap CT/MT/LT. |
| [docs/AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md) | 3 niveaux IA, format complet du system prompt, stockage Firestore des conversations, routes API prévues, sécurité, roadmap. |
| [docs/INTEGRATIONS.md](./INTEGRATIONS.md) | Détails techniques par intégration (Pennylane / MyUnisoft / Odoo / FEC) — auth, endpoints, mappers, troubleshooting. |
| [docs/CHANGELOG_SESSION.md](./CHANGELOG_SESSION.md) | Le présent document — récap des 30 commits, par technique / produit / décisions. |

---

## Statistiques de la session

- **30 commits** sur `feat/session-complete` depuis `269c573` (main).
- **HEAD final** : `24b2d07`.
- **Tests** : 570 passants (+~150 ajoutés sur la session : kpi sanitizer, registry, diagnostic, simulation engine, available range, active source, mappers MyUnisoft / Odoo, agrégateurs).
- **Fichiers créés** : 90+ (adapters, agrégateurs, fondations, scripts ops, docs).
- **Documentation** : 4 fichiers (ARCHITECTURE, AI_ARCHITECTURE, INTEGRATIONS, ce changelog).
- **Scripts ops** : 13 (audit, cleanup, diag, reset, resync, rebuild, dump, build xlsx, etc.).
- **Main intacte** : aucune modification poussée sur `main`.
