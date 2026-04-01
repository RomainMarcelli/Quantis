# QUANTIS V2 - Documentation Technique Complète
## Guide exhaustif pour préparation de présentation

---

## Addendum de synchronisation (2026-04-01)

Cette documentation est conservee pour la trame historique et la presentation. L'etat de verite du produit actif est:

- `README.md` (setup, pipeline, commandes)
- `projet.md` (suivi d'implementation et changelog)
- le code source (services + composants dashboard)

Mises a jour majeures integrees au produit depuis la version initiale de ce document:

- calcul TCAM multi-annees robuste (tri fiscal, reference annee la plus ancienne);
- calcul historique `delta_bfr` puis cash reel (`caf - delta_bfr`);
- formules alignees pour `BFR` et `ratio_immo` (net/brut);
- refonte du point mort (calculs 2033SD, intersection, zones pertes/benefices, plein ecran);
- indicateurs de tendance KPI sur les principales sections metier.

En cas de contradiction avec les sections ci-dessous, cet addendum et `projet.md` priment.

---

# TABLE DES MATIÈRES

1. [Vue d'ensemble du projet](#1-vue-densemble-du-projet)
2. [Contexte & Vision](#2-contexte--vision)
3. [Architecture Technique Complète](#3-architecture-technique-complète)
4. [Fonctionnement Détaillé du Système](#4-fonctionnement-détaillé-du-système)
5. [Choix Techniques & Justifications](#5-choix-techniques--justifications)
6. [Difficultés Rencontrées & Solutions](#6-difficultés-rencontrées--solutions)
7. [KPIs & Métriques de Mesure](#7-kpis--métriques-de-mesure)
8. [Next Steps & Roadmap](#8-next-steps--roadmap)
9. [Détails d'Implémentation](#9-détails-dimplémentation)

---

# 1. VUE D'ENSEMBLE DU PROJET

## 1.1 Qu'est-ce que Quantis ?

**Quantis** est une plateforme d'intelligence financière pour PME qui transforme les données comptables statiques en analyses stratégiques dynamiques. Le système fonctionne comme un "CFO adaptatif" accessible via langage naturel.

### Proposition de valeur
- **Input** : Question en langage naturel + fichiers comptables (PDF/Excel)
- **Traitement** : Analyse financière automatisée avec IA
- **Output** : Analyse complète avec KPIs, projections, scénarios, recommandations

### Différenciation
- **Pas un logiciel comptable** : Ne fait pas de saisie, ne remplace pas l'expert-comptable
- **Pas un outil de trésorerie opérationnelle** : Pas de gestion au jour le jour
- **Pas un outil BI classique** : Ne se contente pas d'afficher des graphiques à décrypter
- **Nouvelle catégorie** : "Interprétation Financière as a Service"

## 1.2 Types de Décisions Supportées (MVP)

Le MVP supporte **5 types de décisions stratégiques** :

1. **Recrutement** (`recruitment`)
   - Analyse impact trésorerie d'un recrutement
   - Projections sur 12 mois
   - Calcul point mort, coût total chargé
   - Scénarios optimiste/réaliste/pessimiste

2. **Investissement** (`investment`)
   - ROI, période de récupération
   - Impact trésorerie selon type de financement
   - Amortissement mensuel

3. **Prix/Tarifs** (`pricing`)
   - Impact sur CA, marge brute, résultat net
   - Analyse de sensibilité volume
   - Point mort volume

4. **BFR/Trésorerie** (`cashflow`)
   - Optimisation délais clients/fournisseurs
   - Projection BFR
   - Détection opportunités

5. **Stock/Inventaire** (`inventory`)
   - Détection argent dormant
   - Optimisation rotation stocks
   - Identification stocks lents

## 1.3 Stack Technologique

```
Frontend:
├── Next.js 16 (App Router)
├── React 19
├── TypeScript 5
├── Tailwind CSS 3
└── Lucide React (icônes)

Backend:
├── Next.js API Routes
└── Firebase/Firestore (stockage analyses + auth)

Outils:
├── ESLint
├── Vitest
├── Playwright
├── PostCSS
└── Autoprefixer
```

---

# 2. CONTEXTE & VISION

## 2.1 Le Problème Résolu

### La Fracture Interprétative
- **99,8% des entreprises** sont des PME
- Les données comptables sont des "artefacts de conformité"
- Les dirigeants reçoivent leurs comptes **6 mois après la clôture**
- Décisions stratégiques prises à l'intuition et au solde bancaire

### La Solitude Décisionnelle
- Pas de CFO interne pour PME 30-60 salariés
- Expert-comptable consulté trop tard
- Manque de visibilité sur :
  - Impact recrutements
  - Optimisation BFR
  - Argent dormant
  - Murs de trésorerie

## 2.2 La Solution Quantis

### Mécanique de Valeur : Du PDF à la Décision

**Étape 1 : Ingestion**
- Upload fichiers comptables standards (PDF liasses fiscales, Excel balances)
- Traitement et extraction données structurées

**Étape 2 : Question Utilisateur**
- Barre de recherche intelligente
- Langage naturel : "Est-ce que je peux recruter un directeur commercial ?"

**Étape 3 : Raisonnement & Gap Analysis**
- Classification automatique du type de décision
- Extraction paramètres (salaire, date, etc.)
- Vérification données disponibles vs nécessaires
- Demande complémentaire si besoin

**Étape 4 : Restitution Décisionnelle**
- Graphiques de projection
- KPIs d'impact
- Interprétation stratégique
- Actions recommandées
- Alternatives

## 2.3 Ambition Stratégique

1. **Devenir le "Cerveau Droit" du Dirigeant**
   - Partenaire silencieux pour décisions stratégiques
   - Aucune décision importante sans analyse Quantis

2. **Le "Bloomberg des PME"**
   - Agrégation anonymisée données milliers PME
   - Benchmarking sectoriel précis
   - Intelligence collective

3. **Démocratisation Excellence Financière**
   - Analyses de haut niveau accessibles à toutes PME
   - Prix d'un abonnement téléphonique
   - Transformation obligation administrative en avantage compétitif

---

# 3. ARCHITECTURE TECHNIQUE COMPLÈTE

## 3.1 Architecture Générale

```
┌─────────────────────────────────────────────────────────────┐
│                    COUCHE PRÉSENTATION                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Dashboard   │  │ DecisionMode │  │ CFOAssistant │     │
│  │  (BentoGrid) │  │  (Onglets)   │  │    (Chat)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │      DynamicRenderer (Server-Driven UI)            │     │
│  │  ComponentRegistry → Composants React dynamiques  │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP POST
┌─────────────────────────────────────────────────────────────┐
│                  COUCHE API (Next.js Routes)                │
│  ┌────────────────────────────────────────────────────┐     │
│  │         /api/question (POST)                      │     │
│  │  - Classification                                  │     │
│  │  - Extraction paramètres                           │     │
│  │  - Gap Analysis                                    │     │
│  │  - Génération UI                                   │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│              COUCHE LOGIQUE MÉTIER                         │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │   ANALYZERS       │  │   CALCULATORS     │             │
│  │                   │  │                   │             │
│  │ • question-       │  │ • financial-      │             │
│  │   classifier      │  │   calculator      │             │
│  │ • parameter-      │  │ • kpi-calculator  │             │
│  │   extractor       │  │ • scenario-      │             │
│  │ • data-requirement│  │   generator       │             │
│  │   -checker        │  │ • treasury-      │             │
│  │ • recruitment-    │  │   projector      │             │
│  │   analyzer        │  │                   │             │
│  │ • investment-     │  └──────────────────┘             │
│  │   analyzer        │                                    │
│  │ • pricing-        │  ┌──────────────────┐             │
│  │   analyzer        │  │   GENERATORS     │             │
│  │ • cashflow-       │  │                   │             │
│  │   analyzer        │  │ • ui-generator   │             │
│  │ • inventory-      │  │ • chart-generator │             │
│  │   analyzer        │  │ • text-generator │             │
│  └──────────────────┘  └──────────────────┘             │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    COUCHE DONNÉES                          │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │  TypeScript      │  │  FinancialData    │             │
│  │  Types           │  │  (Extracted)      │             │
│  │                  │  │                  │             │
│  │ • analysis-types │  │ • Balance        │             │
│  │ • ui-schema      │  │ • Income         │             │
│  │ • data-types     │  │   Statement      │             │
│  │                  │  │ • Aged          │             │
│  │                  │  │   Receivables   │             │
│  │                  │  │ • Aged Payables │             │
│  │                  │  │ • Ratios        │             │
│  └──────────────────┘  └──────────────────┘             │
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Dataset Acme Corporation (Test)                   │     │
│  │  • Balance_2023.xlsx                              │     │
│  │  • CompteResultat_2023.xlsx                       │     │
│  │  • GrandLivre_2023.xlsx                          │     │
│  │  • BalanceAgeeClients_2023.xlsx                 │     │
│  │  • BalanceAgeeFournisseurs_2023.xlsx            │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## 3.2 Structure des Répertoires

```
quantis-v2/
├── app/                          # Next.js App Router
│   ├── api/
│   │   └── question/
│   │       └── route.ts          # API endpoint principal
│   ├── page.tsx                  # Page principale (Dashboard/DecisionMode)
│   ├── login/
│   │   └── page.tsx              # Page de connexion
│   └── layout.tsx                # Layout global
│
├── components/                   # Composants React
│   ├── decision/                # Composants spécifiques décisions
│   │   ├── AnalysisSection.tsx
│   │   ├── CFOAssistant.tsx     # Chat assistant CFO
│   │   ├── ChartSection.tsx
│   │   ├── ChatBar.tsx
│   │   ├── DataRequestForm.tsx  # Formulaire données manquantes
│   │   ├── HypothesisBar.tsx
│   │   ├── KPIWidget.tsx
│   │   ├── ProjectionCanvas.tsx
│   │   ├── ProjectionsChart.tsx
│   │   ├── QuestionAnalyzer.tsx # Analyseur de question
│   │   ├── StrategicAnalysis.tsx
│   │   └── VerdictHeader.tsx
│   ├── dynamic/                 # Système Server-Driven UI
│   │   ├── ComponentRegistry.tsx  # Registre composants
│   │   └── DynamicRenderer.tsx     # Rendu dynamique JSON → React
│   ├── ui/                      # Composants UI réutilisables
│   │   ├── ActionsList.tsx
│   │   ├── AlertBox.tsx
│   │   ├── AlternativesGrid.tsx
│   │   ├── ConsiderationsList.tsx
│   │   ├── KPICard.tsx
│   │   ├── KPIGrid.tsx
│   │   ├── LineChart.tsx
│   │   ├── MultiScenarioChart.tsx
│   │   ├── Section.tsx
│   │   ├── StrengthsWeaknesses.tsx
│   │   └── TextBlock.tsx
│   ├── widgets/                 # Widgets dashboard
│   │   ├── AlertsWidget.tsx
│   │   ├── DormantMoneyWidget.tsx
│   │   ├── HealthWidget.tsx
│   │   ├── QuickActionsWidget.tsx
│   │   └── RecentActivityWidget.tsx
│   ├── BentoGrid.tsx            # Grille Bento dashboard
│   ├── DashboardHeader.tsx
│   ├── DecisionBar.tsx
│   ├── DecisionMode.tsx        # Mode décision (onglets)
│   ├── GoldenCommandDeck.tsx
│   ├── Header.tsx
│   ├── HeroDecisionBar.tsx
│   ├── ProtectedRoute.tsx
│   ├── Sidebar.tsx
│   └── SuggestionChips.tsx
│
├── contexts/                    # Contextes React
│   ├── AuthContext.tsx          # Authentification
│   └── TabsContext.tsx          # Gestion onglets décisions
│
├── lib/                         # Logique métier
│   ├── analyzers/              # Analyseurs spécialisés
│   │   ├── cashflow-analyzer.ts
│   │   ├── data-requirement-checker.ts  # Gap Analysis
│   │   ├── inventory-analyzer.ts
│   │   ├── investment-analyzer.ts
│   │   ├── parameter-extractor.ts       # Extraction OpenAI
│   │   ├── pricing-analyzer.ts
│   │   ├── question-classifier.ts        # Classification
│   │   └── recruitment-analyzer.ts
│   ├── calculators/            # Calculateurs financiers
│   │   ├── financial-calculator.ts      # Calculs de base
│   │   ├── kpi-calculator.ts            # Calcul KPIs
│   │   ├── scenario-generator.ts        # Génération scénarios
│   │   └── treasury-projector.ts        # Projections trésorerie
│   └── generators/             # Générateurs UI/Textes
│       ├── chart-generator.ts           # Données graphiques
│       ├── text-generator.ts            # Textes OpenAI
│       └── ui-generator.ts              # Structure UI JSON
│
├── types/                       # Types TypeScript
│   ├── analysis-types.ts        # Types analyses financières
│   ├── data-types.ts            # Types données financières
│   └── ui-schema.ts             # Schema Server-Driven UI
│
├── datasets/                    # Datasets de test
│   └── acme_corporation/
│       ├── AcmeCorporation_Balance_2023.xlsx
│       ├── AcmeCorporation_CompteResultat_2023.xlsx
│       ├── AcmeCorporation_GrandLivre_2023.xlsx
│       ├── AcmeCorporation_BalanceAgeeClients_2023.xlsx
│       ├── AcmeCorporation_BalanceAgeeFournisseurs_2023.xlsx
│       └── README.md
│
└── scripts/                     # Scripts Python
    ├── generate_acme_datasets.py
    └── validate_acme_datasets.py
```

## 3.3 Flux de Données Complet

### Flux 1 : Traitement d'une Question Utilisateur

```
1. UTILISATEUR
   └─> Tape question : "Est-ce que je peux recruter un directeur commercial à 60k€ ?"
   
2. FRONTEND (DecisionMode.tsx)
   └─> Envoie POST /api/question
       Body: {
         query: "...",
         providedData: {},
         financialData: {...}
       }
   
3. API ROUTE (/api/question/route.ts)
   │
   ├─> 3.1 CLASSIFICATION
   │   └─> question-classifier.ts
   │       └─> Scoring mots-clés → "recruitment"
   │
   ├─> 3.2 EXTRACTION PARAMÈTRES
   │   └─> parameter-extractor.ts
   │       ├─> OpenAI GPT-4o-mini (si disponible)
   │       │   └─> Extrait: { salary: 60000, startDate: "2024-01-01" }
   │       └─> Fallback regex (si OpenAI échoue)
   │
   ├─> 3.3 GAP ANALYSIS
   │   └─> data-requirement-checker.ts
   │       ├─> Vérifie données nécessaires vs disponibles
   │       ├─> Si manquantes → Retourne MissingDataResponse
   │       └─> Si complètes → Continue
   │
   └─> 3.4 GÉNÉRATION ANALYSE
       └─> ui-generator.ts (generateRecruitmentUI)
           │
           ├─> 4.1 ANALYSE FINANCIÈRE
           │   └─> recruitment-analyzer.ts
           │       ├─> calculateTotalCost()
           │       ├─> projectTreasuryWithStartDate()
           │       ├─> findMinTreasuryMonth()
           │       └─> generateTreasuryScenarios()
           │
           ├─> 4.2 CALCUL KPIs
           │   └─> kpi-calculator.ts
           │       └─> calculateRecruitmentKPIs()
           │
           ├─> 4.3 GÉNÉRATION GRAPHIQUES
           │   └─> chart-generator.ts
           │       ├─> generateRecruitmentChartData()
           │       └─> generateMultiScenarioChartData()
           │
           ├─> 4.4 GÉNÉRATION TEXTES
           │   └─> text-generator.ts
           │       ├─> generateDecisionDescription() (OpenAI)
           │       ├─> generateImportanceText() (OpenAI)
           │       └─> generateContextConclusion() (OpenAI)
           │
           ├─> 4.5 CONSIDÉRATIONS/ACTIONS/ALTERNATIVES
           │   └─> recruitment-analyzer.ts
           │       ├─> generateRecruitmentConsiderations()
           │       ├─> generateRecruitmentActions()
           │       └─> generateRecruitmentAlternatives()
           │
           └─> 4.6 CONSTRUCTION UI JSON
               └─> PageConfig {
                     pageTitle: "...",
                     metadata: {...},
                     data: {...},
                     layout: [UIComponent[]]
                   }

5. RETOUR API
   └─> AnalysisResponse {
         status: "complete",
         query: "...",
         analysis: PageConfig {...}
       }

6. FRONTEND (DecisionMode.tsx)
   └─> Reçoit réponse
       └─> DynamicRenderer
           └─> Rendu récursif UIComponent[] → Composants React
```

### Flux 2 : Server-Driven UI (Dynamic Rendering)

```
1. PageConfig JSON
   └─> {
         layout: [
           {
             type: "Section",
             props: { title: "...", icon: "Target" },
             children: [
               {
                 type: "KPIGrid",
                 props: { kpis: [...] }
               },
               {
                 type: "LineChart",
                 props: { chartData: {...} }
               }
             ]
           }
         ]
       }

2. DynamicRenderer.tsx
   └─> Parcourt layout récursivement
       └─> Pour chaque UIComponent:
           ├─> getComponent(component.type)
           │   └─> ComponentRegistry.COMPONENT_MAP[type]
           │
           ├─> processProps(component.props, data)
           │   └─> Remplace template strings ${data.path}
           │
           └─> Rendu récursif children
               └─> <Component {...props}>{children}</Component>

3. Composants React Rendu
   └─> Section
       └─> KPIGrid
           └─> KPICard × 3
       └─> LineChart
           └─> Graphique SVG/Canvas
```

---

# 4. FONCTIONNEMENT DÉTAILLÉ DU SYSTÈME

## 4.1 Classification des Questions

### Algorithme de Classification

**Fichier :** `lib/analyzers/question-classifier.ts`

```typescript
function classifyQuestion(query: string): DecisionType | null {
  // 1. Normalisation
  const lowerQuery = query.toLowerCase();
  
  // 2. Dictionnaire mots-clés par type
  const keywords = {
    recruitment: ['recrut', 'embauch', 'salarié', 'directeur', ...],
    investment: ['invest', 'équipement', 'machine', 'achat', ...],
    pricing: ['prix', 'tarif', 'augment', 'marge', ...],
    cashflow: ['bfr', 'trésorerie', 'délai', 'client', ...],
    inventory: ['stock', 'inventaire', 'rotation', ...]
  };
  
  // 3. Scoring
  const scores = { recruitment: 0, investment: 0, ... };
  Object.entries(keywords).forEach(([type, words]) => {
    words.forEach(word => {
      if (lowerQuery.includes(word)) scores[type]++;
    });
  });
  
  // 4. Retour type avec score max
  const maxScore = Math.max(...Object.values(scores));
  return maxScore > 0 ? type avec maxScore : null;
}
```

**Exemple :**
- Input: "Est-ce que je peux recruter un directeur commercial ?"
- Scores: recruitment=2, investment=0, pricing=0, cashflow=0, inventory=0
- Output: `"recruitment"`

## 4.2 Extraction de Paramètres

### Avec OpenAI GPT-4o-mini

**Fichier :** `lib/analyzers/parameter-extractor.ts`

```typescript
async function extractParameters(query: string, decisionType: DecisionType) {
  const prompt = `Extrais les paramètres de recrutement de cette question: "${query}"
Réponds en JSON avec cette structure:
{
  "salary": nombre (salaire brut annuel en euros),
  "startDate": "YYYY-MM-DD" (date d'embauche),
  "charges": nombre (pourcentage charges sociales, défaut 42),
  "position": "string" (type de poste),
  "fullTime": boolean
}
Si un paramètre n'est pas mentionné, utilise null.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Tu es un assistant qui extrait des paramètres financiers...' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });
  
  return JSON.parse(completion.choices[0].message.content);
}
```

**Fallback Regex :**
Si OpenAI indisponible, extraction basique par regex :
- `/(\d+)\s*k?€/` → Montant
- `/(\d{1,2})\/(\d{1,2})\/(\d{4})/` → Date

## 4.3 Gap Analysis (Vérification Données)

**Fichier :** `lib/analyzers/data-requirement-checker.ts`

### Données Requises par Type

```typescript
const REQUIRED_DATA = {
  recruitment: ['salary', 'startDate'],      // Minimum requis
  investment: ['amount', 'duration'],
  pricing: ['newPrice', 'volume'],
  cashflow: [],                              // Tout depuis fichiers
  inventory: ['currentStockValue']
};
```

### Processus de Vérification

1. **Vérification données utilisateur**
   - Paramètres extraits présents ?
   - Types corrects ?

2. **Vérification données financières**
   - `financialData.balance.treasury` présent ?
   - `financialData.incomeStatement` présent ?
   - Selon type de décision

3. **Génération formulaire manquant**
   - Si données manquantes → `MissingDataField[]`
   - Formulaire dynamique généré
   - Utilisateur complète → Nouvelle requête

## 4.4 Analyse Financière (Exemple : Recrutement)

**Fichier :** `lib/analyzers/recruitment-analyzer.ts`

### Étapes d'Analyse

```typescript
function analyzeRecruitment(parameters, financialData): RecruitmentAnalysis {
  // 1. Calcul coût total chargé
  const totalCostAnnual = calculateTotalCost(salary, chargesPercent);
  // Ex: 60k€ × 1.42 = 85.2k€
  
  // 2. Impact mensuel
  const monthlyImpact = -totalCostAnnual / 12;
  // Ex: -7.1k€/mois
  
  // 3. Projection trésorerie sur 12 mois
  const treasuryProjection = projectTreasuryWithStartDate(
    initialTreasury,      // Ex: 50k€
    monthlyImpact,        // Ex: -7.1k€
    startMonth,           // Ex: 0 (janvier)
    12,
    monthlyRevenue,       // Ex: [25k, 25k, ...]
    monthlyCharges        // Ex: [20k, 20k, ...]
  );
  // Résultat: [50k, 42.9k, 35.8k, ..., 12.3k]
  
  // 4. Trouver minimum
  const { month, value } = findMinTreasuryMonth(treasuryProjection);
  // Ex: mois 6, valeur 12.3k€
  
  // 5. Générer scénarios
  const scenarios = generateTreasuryScenarios(treasuryProjection);
  // Optimiste: +15% revenus
  // Réaliste: projection de base
  // Pessimiste: -15% revenus, retards paiement
  
  // 6. Calcul point mort
  const breakEven = calculateBreakEven(totalCostAnnual, grossMarginPercent);
  // Ex: +4% CA nécessaire
  
  return {
    totalCost: totalCostAnnual,
    monthlyImpact,
    breakEven,
    treasuryProjection,
    minTreasury: value,
    minTreasuryMonth: month,
    scenarios
  };
}
```

## 4.5 Calcul des KPIs

**Fichier :** `lib/calculators/kpi-calculator.ts`

### KPIs Recrutement

```typescript
function calculateRecruitmentKPIs(salary, chargesPercent, grossMarginPercent) {
  const totalCostAnnual = calculateTotalCost(salary, chargesPercent);
  const monthlyImpact = -totalCostAnnual / 12;
  const breakEvenPercent = calculateBreakEven(totalCostAnnual, grossMarginPercent);
  
  return {
    totalCost: {
      label: 'Coût Total Chargé',
      value: formatCurrency(totalCostAnnual),  // "85k€"
      subtitle: 'Sur 12 mois',
      negative: false
    },
    treasuryImpact: {
      label: 'Impact Trésorerie',
      value: formatCurrency(monthlyImpact),    // "-7k€"
      subtitle: 'Réduction moyenne',
      negative: true
    },
    breakEven: {
      label: 'Point Mort',
      value: `+${breakEvenPercent.toFixed(1)}%`,  // "+4.2%"
      subtitle: 'CA supplémentaire requis',
      negative: false
    }
  };
}
```

## 4.6 Génération UI Dynamique

**Fichier :** `lib/generators/ui-generator.ts`

### Structure PageConfig

```typescript
const pageConfig: PageConfig = {
  pageTitle: "Est-ce que je peux recruter un directeur commercial à 60k€ ?",
  metadata: {
    generatedAt: "2024-01-15T10:30:00Z",
    confidence: 95,
    decisionType: "recruitment"
  },
  data: {
    kpis: { totalCost, treasuryImpact, breakEven },
    chartData: { treasuryProjection, multiScenario },
    scenarios: { recruitment: scenarios },
    considerations: considerations,
    actions: actions,
    alternatives: alternatives
  },
  layout: [
    {
      type: "Section",
      props: { icon: "Target", title: "La Décision à Analyser" },
      children: [
        { type: "TextBlock", props: { content: decisionDescription } }
      ]
    },
    {
      type: "KPIGrid",
      props: { columns: 3, kpis: [totalCost, treasuryImpact, breakEven] }
    },
    {
      type: "LineChart",
      props: { title: "Projection trésorerie", chartData: {...} }
    },
    // ... autres sections
  ]
};
```

## 4.7 Rendu Dynamique (DynamicRenderer)

**Fichier :** `components/dynamic/DynamicRenderer.tsx`

### Processus de Rendu

```typescript
function DynamicRenderer({ config }) {
  const pageConfig = extractPageConfig(config);
  
  return (
    <div>
      <h1>{pageConfig.pageTitle}</h1>
      {pageConfig.layout.map(component => (
        <ComponentRenderer component={component} data={pageConfig.data} />
      ))}
    </div>
  );
}

function ComponentRenderer({ component, data }) {
  // 1. Récupérer composant depuis registry
  const Component = getComponent(component.type);
  // Ex: Component = KPIGrid
  
  // 2. Traiter props (remplacer template strings)
  const processedProps = processProps(component.props, data);
  // Ex: "${data.kpis.totalCost.value}" → "85k€"
  
  // 3. Rendu récursif enfants
  const children = component.children?.map(child =>
    typeof child === 'string' 
      ? processTemplateString(child, data)
      : <ComponentRenderer component={child} data={data} />
  );
  
  // 4. Rendu composant
  return <Component {...processedProps}>{children}</Component>;
}
```

### Component Registry

**Fichier :** `components/dynamic/ComponentRegistry.tsx`

```typescript
export const COMPONENT_MAP = {
  Section: Section,
  KPICard: KPICard,
  KPIGrid: KPIGrid,
  LineChart: LineChart,
  MultiScenarioChart: MultiScenarioChart,
  ConsiderationsList: ConsiderationsList,
  ActionsList: ActionsList,
  AlternativesGrid: AlternativesGrid,
  AlertBox: AlertBox,
  TextBlock: TextBlock,
  StrengthsWeaknesses: StrengthsWeaknesses,
  // ...
};
```

---

# 5. CHOIX TECHNIQUES & JUSTIFICATIONS

## 5.1 Next.js 14 (App Router)

### Pourquoi Next.js ?

✅ **API Routes intégrées**
- Pas besoin de backend séparé
- Déploiement monolithique simplifié
- Latence réduite (même processus)

✅ **Server Components**
- Rendu côté serveur pour performance
- Réduction bundle JavaScript client
- SEO optimisé

✅ **Routing automatique**
- Structure fichiers = routes
- Pas de configuration manuelle
- Type-safe avec TypeScript

✅ **Optimisations natives**
- Code splitting automatique
- Image optimization
- Font optimization

### Alternatives considérées
- ❌ **React + Express** : Plus de complexité déploiement
- ❌ **Remix** : Écosystème moins mature
- ❌ **SvelteKit** : Moins de ressources disponibles

## 5.2 TypeScript Strict

### Pourquoi TypeScript ?

✅ **Sécurité calculs financiers**
```typescript
// Erreur détectée à la compilation
function calculateTotalCost(salary: number, chargesPercent: number): number {
  return salary * (1 + chargesPercent / 100);
}
// Impossible de passer string par erreur
```

✅ **Types financiers complexes**
```typescript
interface FinancialData {
  balance?: {
    treasury: number;  // Type strict = pas d'erreur runtime
    totalAssets: number;
  };
  incomeStatement?: {
    annualRevenue: number;
    monthlyRevenue: number[];  // Array typé
  };
}
```

✅ **Auto-complétion IDE**
- Découverte API facilitée
- Moins d'erreurs de frappe
- Documentation vivante

✅ **Refactoring sécurisé**
- Renommage automatique
- Détection usages
- Vérification cohérence

### Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

## 5.3 Architecture Modulaire (Analyzers/Calculators/Generators)

### Séparation des Responsabilités

```
lib/
├── analyzers/          # Analyse métier spécifique
│   ├── question-classifier.ts      # Classification
│   ├── parameter-extractor.ts      # Extraction IA
│   ├── data-requirement-checker.ts # Gap Analysis
│   └── *-analyzer.ts               # Analyse par type
│
├── calculators/        # Calculs financiers purs
│   ├── financial-calculator.ts     # Fonctions mathématiques
│   ├── kpi-calculator.ts           # Calcul KPIs
│   ├── scenario-generator.ts       # Génération scénarios
│   └── treasury-projector.ts      # Projections
│
└── generators/         # Génération UI/Textes
    ├── ui-generator.ts             # Structure UI JSON
    ├── chart-generator.ts          # Données graphiques
    └── text-generator.ts           # Textes OpenAI
```

### Avantages

✅ **Testabilité**
- Fonctions pures faciles à tester
- Mocking simplifié
- Tests unitaires isolés

✅ **Réutilisabilité**
- `calculateTotalCost()` utilisé partout
- Pas de duplication code

✅ **Extensibilité**
- Nouveau type décision = nouveau `*-analyzer.ts`
- Pas de modification code existant

✅ **Maintenabilité**
- Responsabilités claires
- Debugging facilité
- Onboarding développeurs rapide

## 5.4 OpenAI GPT-4o-mini (vs GPT-4)

### Pourquoi GPT-4o-mini ?

✅ **Coût 10x inférieur**
- GPT-4o-mini : ~$0.15 / 1M tokens input
- GPT-4 : ~$2.50 / 1M tokens input
- Pour extraction paramètres → qualité suffisante

✅ **Latence acceptable**
- < 2 secondes pour extraction
- Expérience utilisateur fluide

✅ **Qualité suffisante**
- Extraction JSON structurée → excellente
- Génération textes → bonne (améliorable)

✅ **Fallback robuste**
- Si API indisponible → regex
- Pas de single point of failure

### Utilisation OpenAI

1. **Extraction paramètres** (`parameter-extractor.ts`)
   - Prompt structuré
   - `response_format: { type: 'json_object' }`
   - Temperature: 0.3 (déterministe)

2. **Génération textes** (`text-generator.ts`)
   - Descriptions décisions
   - Textes d'importance
   - Conclusions contextuelles
   - Temperature: 0.7 (créatif)

## 5.5 Server-Driven UI (DynamicRenderer)

### Pourquoi Server-Driven UI ?

✅ **Génération UI adaptative**
- Chaque type décision = UI différente
- Pas de code dupliqué frontend
- Évolution backend = UI mise à jour automatiquement

✅ **Séparation logique/présentation**
- Backend génère structure JSON
- Frontend rend composants React
- Pas de logique métier dans composants

✅ **Évolutivité**
- Nouveau composant = ajout registry
- Pas de modification code existant
- A/B testing facilité

### Architecture

```
Backend (ui-generator.ts)
  └─> Génère PageConfig JSON
       └─> layout: UIComponent[]

Frontend (DynamicRenderer.tsx)
  └─> Parse PageConfig
       └─> ComponentRegistry
            └─> Rendu React Components
```

### Exemple

```typescript
// Backend génère
{
  type: "KPIGrid",
  props: {
    columns: 3,
    kpis: [
      { label: "Coût Total", value: "85k€" },
      { label: "Impact", value: "-7k€" },
      { label: "Point Mort", value: "+4.2%" }
    ]
  }
}

// Frontend rend
<KPIGrid columns={3} kpis={[...]} />
```

## 5.6 Tailwind CSS

### Pourquoi Tailwind ?

✅ **Design system cohérent**
- Couleurs, espacements standardisés
- Pas de CSS custom dispersé

✅ **Productivité**
- Classes utilitaires rapides
- Pas de nommage CSS complexe

✅ **Performance**
- Purge CSS automatique
- Bundle optimisé

✅ **Maintenabilité**
- Pas de CSS mort
- Refactoring facilité

---

# 6. DIFFICULTÉS RENCONTRÉES & SOLUTIONS

## 6.1 Extraction Données Financières depuis PDF/Excel

### Problème

🔴 **Formats variés**
- Liasses fiscales PDF (structure non standardisée)
- Balances Excel (colonnes variables selon logiciels)
- Comptes de résultat (formats différents)

🔴 **Sémantique comptable**
- Comprendre structure comptable française
- Mapping comptes comptables → données structurées
- Gestion erreurs/omissions

🔴 **Qualité données**
- OCR imprécis
- Tableaux mal formatés
- Données manquantes

### Solution MVP

✅ **Dataset test Acme Corporation**
- Scripts Python génèrent datasets Excel cohérents
- Structure standardisée pour développement
- Validation automatique cohérence

✅ **Architecture prête pour intégration**
- Types TypeScript `FinancialData` définis
- Interface extraction standardisée
- Prêt pour intégration OCR/parsing

✅ **Next Steps**
- Intégration bibliothèque OCR (Tesseract, AWS Textract)
- Parser Excel robuste (xlsx.js)
- Validation données extraites

### Code Structure

```typescript
// Types prêts
interface FinancialData {
  balance?: {
    treasury: number;
    totalAssets: number;
  };
  incomeStatement?: {
    annualRevenue: number;
    monthlyRevenue: number[];
  };
  // ...
}

// Interface extraction (à implémenter)
function extractFinancialDataFromPDF(pdfFile: File): Promise<FinancialData> {
  // TODO: OCR + parsing
}

function extractFinancialDataFromExcel(excelFile: File): Promise<FinancialData> {
  // TODO: xlsx.js parsing
}
```

## 6.2 Classification Précise des Questions

### Problème

🔴 **Ambiguïté questions**
- "Est-ce que je peux recruter ?" → Type clair
- "J'ai besoin d'aide pour embaucher" → Moins clair
- "Quel impact sur ma trésorerie si j'embauche ?" → Mix cashflow + recruitment

🔴 **Mots-clés multiples**
- "Recruter un commercial" → recruitment
- "Investir dans un commercial" → investment ?
- "Prix d'un commercial" → pricing ?

🔴 **Contexte métier**
- Comprendre intention utilisateur
- Gérer questions incomplètes

### Solution

✅ **Système de scoring**
- Compte occurrences mots-clés par type
- Retourne type avec score max
- Seuil minimum pour validation

✅ **Fallback OpenAI**
- Si classification échoue → extraction OpenAI
- Analyse sémantique plus poussée
- Amélioration continue

✅ **Gestion ambiguïté**
- Si score égal → demande clarification
- Message utilisateur explicite
- Suggestions reformulation

### Code

```typescript
function classifyQuestion(query: string): DecisionType | null {
  const scores = calculateScores(query);
  const maxScore = Math.max(...Object.values(scores));
  
  if (maxScore === 0) {
    // Aucun type identifié → Fallback OpenAI
    return classifyWithOpenAI(query);
  }
  
  // Vérifier égalité scores
  const winners = Object.entries(scores)
    .filter(([, score]) => score === maxScore);
  
  if (winners.length > 1) {
    // Ambiguïté → Demander clarification
    return null; // Avec message utilisateur
  }
  
  return winners[0][0] as DecisionType;
}
```

## 6.3 Gap Analysis (Données Manquantes)

### Problème

🔴 **Questions incomplètes**
- "Recruter un commercial" → Manque salaire, date
- "Investir dans une machine" → Manque montant, durée

🔴 **Données financières partielles**
- Balance présente mais pas compte de résultat
- Données mensuelles manquantes
- Ratios non calculables

🔴 **Expérience utilisateur**
- Ne pas bloquer utilisateur
- Demande progressive données
- Feedback clair

### Solution

✅ **Système de vérification hiérarchique**
- Données critiques vs optionnelles
- Calcul impact données manquantes
- Génération formulaire adaptatif

✅ **Workflow conversationnel**
- Formulaire dynamique selon manques
- Validation progressive
- Pas de blocage total

✅ **Fallbacks intelligents**
- Valeurs par défaut raisonnables
- Estimation depuis contexte
- Avertissement utilisateur

### Code

```typescript
function checkDataRequirements(
  decisionType: DecisionType,
  providedData: Record<string, any>,
  financialData?: FinancialData
): MissingDataField[] {
  const required = REQUIRED_DATA[decisionType];
  const missing: MissingDataField[] = [];
  
  // Vérifier données utilisateur
  required.forEach(field => {
    if (!providedData[field]) {
      missing.push(getFieldDefinition(decisionType, field));
    }
  });
  
  // Vérifier données financières
  if (needsFinancialData(decisionType)) {
    if (!financialData?.balance?.treasury) {
      missing.push({
        id: 'financial_data',
        label: 'Données financières',
        type: 'text',
        required: true,
        description: 'Veuillez uploader vos fichiers financiers'
      });
    }
  }
  
  return missing;
}
```

## 6.4 Génération UI Dynamique

### Problème

🔴 **UI différente par type**
- Recrutement → KPIs + Projections trésorerie
- Investissement → ROI + Période récupération
- Prix → Impact marge + Sensibilité volume

🔴 **Évolutivité**
- Ajout nouveau type = nouvelle UI
- Pas de duplication code
- Cohérence design

🔴 **Complexité rendu**
- Composants imbriqués
- Données injectées dynamiquement
- Template strings

### Solution

✅ **Server-Driven UI**
- Backend génère structure JSON
- Frontend rend composants React
- Registry centralisé composants

✅ **Component Registry**
- Mapping type → composant React
- Extensibilité facile
- Type-safe avec TypeScript

✅ **DynamicRenderer récursif**
- Rendu arbre JSON → React
- Injection données template strings
- Gestion enfants récursifs

### Code

```typescript
// Backend génère
const layout: UIComponent[] = [
  {
    type: "Section",
    props: { title: "KPIs" },
    children: [
      {
        type: "KPIGrid",
        props: {
          kpis: [
            { label: "Coût", value: "${data.kpis.totalCost.value}" }
          ]
        }
      }
    ]
  }
];

// Frontend rend
function DynamicRenderer({ config }) {
  return config.layout.map(component => (
    <ComponentRenderer component={component} data={config.data} />
  ));
}
```

## 6.5 Calculs Financiers Fiables

### Problème

🔴 **Formules complexes**
- BFR = Stocks + Créances - Dettes
- Point mort = Coût / Marge %
- ROI = (Bénéfice - Investissement) / Investissement × 100

🔴 **Gestion erreurs**
- Division par zéro
- Valeurs négatives
- Arrondis

🔴 **Scénarios multiples**
- Optimiste/réaliste/pessimiste
- Projections sur 12 mois
- Variations paramètres

### Solution

✅ **Fonctions pures**
- Pas d'effets de bord
- Testabilité maximale
- Validation inputs

✅ **Gestion erreurs**
- Vérification division par zéro
- Valeurs par défaut raisonnables
- Logging erreurs

✅ **Tests unitaires**
- Validation formules sur cas connus
- Edge cases couverts
- Documentation exemples

### Code

```typescript
function calculateBreakEven(
  additionalCost: number,
  grossMarginPercent: number
): number {
  if (grossMarginPercent === 0) {
    console.warn('Marge brute à 0%, point mort non calculable');
    return Infinity;
  }
  
  return (additionalCost / grossMarginPercent) * 100;
}

function projectTreasury(
  initialTreasury: number,
  monthlyImpact: number,
  months: number = 12
): number[] {
  const projection: number[] = [];
  let currentTreasury = initialTreasury;
  
  for (let i = 0; i < months; i++) {
    currentTreasury += monthlyImpact;
    projection.push(Math.max(0, currentTreasury)); // Ne pas aller en négatif
  }
  
  return projection;
}
```

---

# 7. KPIs & MÉTRIQUES DE MESURE

## 7.1 Métriques Techniques

### Taux de Classification

**Objectif MVP :** > 85%

**Mesure :**
- Nombre questions correctement typées / Total questions
- Test sur dataset 100 questions variées

**Méthode :**
```typescript
const testQuestions = [
  "Est-ce que je peux recruter un commercial ?",
  "Quel impact d'un investissement de 100k€ ?",
  // ... 98 autres
];

let correct = 0;
testQuestions.forEach(q => {
  const type = classifyQuestion(q);
  if (type === expectedType) correct++;
});

const rate = (correct / testQuestions.length) * 100;
```

### Temps de Réponse

**Objectif MVP :** < 3 secondes

**Mesure :**
- Temps entre POST /api/question et réponse complète
- P95 (95% requêtes < 3s)

**Breakdown :**
- Classification : < 50ms
- Extraction paramètres (OpenAI) : < 2s
- Gap Analysis : < 50ms
- Analyse financière : < 200ms
- Génération UI : < 500ms
- **Total :** ~2.8s

### Taux de Complétude

**Objectif MVP :** > 70%

**Mesure :**
- Analyses complètes sans données manquantes / Total analyses
- Amélioration avec dataset complet

### Précision Calculs

**Objectif MVP :** 100%

**Mesure :**
- Validation formules sur cas connus
- Tests unitaires couverture > 90%

**Exemples tests :**
```typescript
test('calculateTotalCost', () => {
  expect(calculateTotalCost(60000, 42)).toBe(85200);
  expect(calculateTotalCost(50000, 50)).toBe(75000);
});

test('calculateBreakEven', () => {
  expect(calculateBreakEven(85200, 0.35)).toBeCloseTo(243428.57);
});
```

### Couverture Types

**Objectif MVP :** 5/5 types fonctionnels

**Mesure :**
- Types opérationnels : recruitment ✅, investment ✅, pricing ✅, cashflow ✅, inventory ✅

## 7.2 Métriques Métier (Valeur Utilisateur)

### Taux d'Adoption

**Objectif MVP :** > 60%

**Mesure :**
- Utilisateurs posant ≥ 3 questions/semaine / Total utilisateurs actifs

**Tracking :**
- Analytics événements : `question_asked`, `analysis_completed`
- Dashboard métriques utilisateur

### Temps Économisé

**Objectif MVP :** -80% vs consultation expert-comptable

**Mesure :**
- Temps moyen consultation expert : 2-3 heures
- Temps moyen analyse Quantis : 3 minutes
- **Gain :** ~97% de temps économisé

### Décisions Éclairées

**Objectif MVP :** 100%

**Mesure :**
- Analyses avec projections + scénarios / Total analyses
- Toutes analyses incluent KPIs + Graphiques + Recommandations

### ROI Utilisateur

**Objectif MVP :** Positif (Argent trouvé > Coût abonnement)

**Mesure :**
- Montant optimisations identifiées / Coût abonnement annuel
- Exemple : 24k€ argent dormant détecté / 1.2k€ abonnement = ROI 2000%

## 7.3 Métriques Qualité

### Erreurs Calculs

**Objectif MVP :** 0

**Mesure :**
- Tests unitaires + intégration
- Validation manuelle sur cas réels
- Monitoring erreurs production

### UX Score

**Objectif MVP :** > 4/5

**Mesure :**
- Feedback utilisateurs beta (NPS, satisfaction)
- Temps pour première analyse réussie
- Taux abandon formulaire données manquantes

### Performance

**Objectif MVP :** < 2s chargement page

**Mesure :**
- Lighthouse score > 90
- First Contentful Paint < 1.5s
- Time to Interactive < 2s

### Disponibilité

**Objectif MVP :** > 99%

**Mesure :**
- Uptime API (monitoring externe)
- Gestion erreurs OpenAI (fallback)
- Retry automatique

## 7.4 Comment Mesurer Objectivement ?

### 1. Tests Automatisés

```typescript
// Suite tests complète
describe('Question Classification', () => {
  test('recruitment questions', () => {
    expect(classifyQuestion('recruter un commercial')).toBe('recruitment');
  });
  // ... 50+ tests
});

describe('Financial Calculations', () => {
  test('total cost calculation', () => {
    expect(calculateTotalCost(60000, 42)).toBe(85200);
  });
  // ... 100+ tests
});
```

### 2. Dataset de Référence

- **Acme Corporation** : Scénarios connus, résultats attendus
- Validation résultats calculés vs attendus
- Cas limites testés

### 3. Métriques Utilisateur

- **Analytics** : Questions posées, temps session, analyses complétées
- **Feedback qualitatif** : Interviews dirigeants PME
- **A/B Testing** : Variantes UI, prompts OpenAI

### 4. Benchmark

- Comparaison avec outils existants (Excel, BI)
- Temps réponse vs consultation humaine
- Précision calculs vs expert-comptable

---

# 8. NEXT STEPS & ROADMAP

## 8.1 Court Terme (1-2 mois)

### 1. Intégration Extraction PDF/Excel

**Priorité :** Critique

**Tâches :**
- Intégration bibliothèque OCR (Tesseract.js ou AWS Textract)
- Parser Excel robuste (xlsx.js)
- Validation données extraites
- Gestion erreurs extraction

**Livrables :**
- Fonction `extractFinancialDataFromPDF()`
- Fonction `extractFinancialDataFromExcel()`
- Tests sur vrais fichiers comptables

### 2. Authentification & Multi-tenant

**Priorité :** Haute

**Tâches :**
- Intégration NextAuth ou Auth0
- Isolation données par entreprise
- Gestion sessions utilisateurs
- Rôles/permissions

**Livrables :**
- Système auth fonctionnel
- Multi-tenant opérationnel
- Dashboard par entreprise

### 3. Base de Données

**Priorité :** Haute

**Tâches :**
- Setup PostgreSQL
- Schéma base données
- ORM (Prisma ou Drizzle)
- Migrations

**Livrables :**
- Base données opérationnelle
- Historique analyses sauvegardé
- Données financières persistées

## 8.2 Moyen Terme (3-6 mois)

### 4. Benchmarking Sectoriel

**Priorité :** Moyenne

**Tâches :**
- Agrégation anonymisée données
- Calcul moyennes sectorielles
- Comparaisons PME similaires
- Dashboard benchmarking

**Livrables :**
- Base données agrégée anonymisée
- Comparaisons sectorielles fonctionnelles
- Visualisations benchmarking

### 5. Notifications Proactives

**Priorité :** Moyenne

**Tâches :**
- Détection opportunités (argent dormant)
- Alertes trésorerie
- Notifications email/push
- Préférences utilisateur

**Livrables :**
- Système notifications opérationnel
- Détection automatique opportunités
- Alertes configurables

### 6. Export & Partage

**Priorité :** Moyenne

**Tâches :**
- Export PDF analyses
- Partage avec banquiers/investisseurs
- Intégration outils comptables
- Templates personnalisables

**Livrables :**
- Export PDF fonctionnel
- Partage sécurisé
- Intégrations comptables

## 8.3 Long Terme (6-12 mois)

### 7. IA Prédictive Avancée

**Priorité :** Basse

**Tâches :**
- Modèles ML pour projections
- Détection anomalies financières
- Prédictions tendances
- Apprentissage continu

**Livrables :**
- Modèles ML opérationnels
- Prédictions précises
- Détection anomalies

### 8. Marketplace Conseils

**Priorité :** Basse

**Tâches :**
- Connexion experts-comptables
- Conseils personnalisés
- Système rendez-vous
- Facturation intégrée

**Livrables :**
- Marketplace fonctionnelle
- Réseau experts
- Système paiement

---

# 9. DÉTAILS D'IMPLÉMENTATION

## 9.1 Types TypeScript Détaillés

### Analysis Types

```typescript
// types/analysis-types.ts

export type DecisionType =
  | 'recruitment'
  | 'investment'
  | 'pricing'
  | 'cashflow'
  | 'inventory';

export interface RecruitmentParameters {
  salary?: number;           // Salaire brut annuel (€)
  startDate?: string;        // Date embauche (ISO)
  charges?: number;          // % charges sociales (défaut: 42)
  position?: string;         // Type poste
  fullTime?: boolean;        // Temps plein/partiel
}

export interface FinancialData {
  balance?: {
    treasury: number;
    totalAssets: number;
    totalLiabilities: number;
    equity: number;
    debts: number;
  };
  incomeStatement?: {
    annualRevenue: number;
    monthlyRevenue: number[];
    totalCharges: number;
    netResult: number;
    grossMargin: number;
    grossMarginPercent: number;
  };
  agedReceivables?: {
    total: number;
    averageDelay: number;    // Jours
    breakdown: Array<{
      days: number;
      amount: number;
    }>;
  };
  // ...
}

export interface RecruitmentAnalysis {
  totalCost: number;
  monthlyImpact: number;
  breakEven: number;         // % CA supplémentaire
  treasuryProjection: number[];
  minTreasury: number;
  minTreasuryMonth: number;
  scenarios: {
    optimistic: number[];
    realistic: number[];
    pessimistic: number[];
  };
}
```

### UI Schema Types

```typescript
// types/ui-schema.ts

export type ComponentType =
  | 'Section'
  | 'KPIGrid'
  | 'LineChart'
  | 'ConsiderationsList'
  | 'ActionsList'
  | 'AlternativesGrid'
  | 'AlertBox'
  | 'TextBlock'
  | 'StrengthsWeaknesses'
  | 'MultiScenarioChart'
  | // ... 20+ autres types
  ;

export interface UIComponent {
  id?: string;
  type: ComponentType;
  props?: Record<string, any>;
  children?: UIComponent[] | string;
}

export interface PageConfig {
  pageTitle: string;
  metadata: AnalysisMetadata;
  data: AnalysisData;
  layout: UIComponent[];
}

export interface AnalysisResponse {
  status: 'complete' | 'missing_data' | 'processing';
  query: string;
  missingData?: MissingDataResponse;
  analysis?: PageConfig;
  progress?: {
    step: string;
    percentage: number;
  };
}
```

## 9.2 Exemples de Code Clés

### Question Classifier

```typescript
// lib/analyzers/question-classifier.ts

export function classifyQuestion(query: string): DecisionType | null {
  const lowerQuery = query.toLowerCase();
  
  const keywords: Record<DecisionType, string[]> = {
    recruitment: ['recrut', 'embauch', 'salarié', 'directeur', ...],
    investment: ['invest', 'équipement', 'machine', ...],
    pricing: ['prix', 'tarif', 'augment', ...],
    cashflow: ['bfr', 'trésorerie', 'délai', ...],
    inventory: ['stock', 'inventaire', 'rotation', ...]
  };
  
  const scores: Record<DecisionType, number> = {
    recruitment: 0,
    investment: 0,
    pricing: 0,
    cashflow: 0,
    inventory: 0
  };
  
  Object.entries(keywords).forEach(([type, words]) => {
    words.forEach(word => {
      if (lowerQuery.includes(word)) {
        scores[type as DecisionType]++;
      }
    });
  });
  
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return null;
  
  return Object.entries(scores)
    .find(([, score]) => score === maxScore)?.[0] as DecisionType || null;
}
```

### Parameter Extractor avec OpenAI

```typescript
// lib/analyzers/parameter-extractor.ts

export async function extractParameters(
  query: string,
  decisionType: DecisionType
): Promise<RecruitmentParameters | ...> {
  const prompts: Record<DecisionType, string> = {
    recruitment: `Extrais les paramètres de recrutement de cette question: "${query}"
Réponds en JSON avec cette structure:
{
  "salary": nombre (salaire brut annuel en euros),
  "startDate": "YYYY-MM-DD" (date d'embauche),
  "charges": nombre (pourcentage charges sociales, défaut 42),
  "position": "string" (type de poste),
  "fullTime": boolean
}
Si un paramètre n'est pas mentionné, utilise null.`,
    // ... autres types
  };
  
  if (!openai) {
    return extractParametersBasic(query, decisionType);
  }
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Tu es un assistant qui extrait des paramètres financiers depuis des questions en français. Réponds UNIQUEMENT avec du JSON valide, sans texte supplémentaire.'
      },
      {
        role: 'user',
        content: prompts[decisionType]
      }
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });
  
  const content = completion.choices[0]?.message?.content;
  if (!content) return null;
  
  return JSON.parse(content);
}
```

### Financial Calculator

```typescript
// lib/calculators/financial-calculator.ts

export function calculateTotalCost(
  baseAmount: number,
  chargesPercent: number = 42
): number {
  return baseAmount * (1 + chargesPercent / 100);
}

export function calculateBreakEven(
  additionalCost: number,
  grossMarginPercent: number
): number {
  if (grossMarginPercent === 0) return Infinity;
  return (additionalCost / grossMarginPercent) * 100;
}

export function formatCurrency(amount: number, decimals: number = 0): string {
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(decimals)}k€`;
  }
  return `${amount.toFixed(decimals)}€`;
}
```

### Treasury Projector

```typescript
// lib/calculators/treasury-projector.ts

export function projectTreasuryWithStartDate(
  initialTreasury: number,
  monthlyImpact: number,
  startMonth: number,
  months: number = 12,
  monthlyRevenue?: number[],
  monthlyCharges?: number[]
): number[] {
  const projection: number[] = [];
  let currentTreasury = initialTreasury;
  
  for (let i = 0; i < months; i++) {
    // Impact seulement à partir du mois de démarrage
    if (i >= startMonth) {
      currentTreasury += monthlyImpact;
    }
    
    // Ajouter revenus
    if (monthlyRevenue && monthlyRevenue[i]) {
      currentTreasury += monthlyRevenue[i];
    }
    
    // Soustraire charges
    if (monthlyCharges && monthlyCharges[i]) {
      currentTreasury -= monthlyCharges[i];
    }
    
    projection.push(Math.max(0, currentTreasury));
  }
  
  return projection;
}
```

### UI Generator

```typescript
// lib/generators/ui-generator.ts

export async function generateRecruitmentUI(
  query: string,
  parameters: RecruitmentParameters,
  financialData?: FinancialData
): Promise<PageConfig> {
  // 1. Analyse
  const analysis = analyzeRecruitment(parameters, financialData);
  
  // 2. KPIs
  const kpis = calculateRecruitmentKPIs(
    parameters.salary || 60000,
    parameters.charges || 42,
    financialData?.incomeStatement?.grossMarginPercent || 35
  );
  
  // 3. Graphiques
  const chartData = generateRecruitmentChartData(
    analysis,
    getInitialTreasury(financialData) || 50000
  );
  
  // 4. Textes (OpenAI)
  const decisionDescription = await generateDecisionDescription(
    query, 'recruitment', parameters
  );
  
  // 5. Construire layout
  const layout: UIComponent[] = [
    {
      type: 'Section',
      props: { icon: 'Target', title: 'La Décision à Analyser' },
      children: [
        {
          type: 'TextBlock',
          props: { content: decisionDescription }
        }
      ]
    },
    {
      type: 'KPIGrid',
      props: { columns: 3, kpis: [kpis.totalCost, kpis.treasuryImpact, kpis.breakEven] }
    },
    {
      type: 'LineChart',
      props: { title: chartData.title, chartData: chartData }
    }
    // ... autres sections
  ];
  
  return {
    pageTitle: query,
    metadata: {
      generatedAt: new Date().toISOString(),
      confidence: 95,
      decisionType: 'recruitment'
    },
    data: {
      kpis,
      chartData: { treasuryProjection: chartData },
      scenarios: { recruitment: analysis.scenarios }
    },
    layout
  };
}
```

### Dynamic Renderer

```typescript
// components/dynamic/DynamicRenderer.tsx

export function DynamicRenderer({ config }: { config: PageConfig }) {
  return (
    <div className="max-w-6xl mx-auto py-12 px-8">
      <h1>{config.pageTitle}</h1>
      {config.layout.map((component, index) => (
        <ComponentRenderer
          key={component.id || `component-${index}`}
          component={component}
          data={config.data}
        />
      ))}
    </div>
  );
}

function ComponentRenderer({ component, data }: { component: UIComponent; data: any }) {
  const Component = getComponent(component.type);
  if (!Component) return <div>Composant non disponible</div>;
  
  const processedProps = processProps(component.props || {}, data);
  
  let children: React.ReactNode = null;
  if (component.children) {
    if (Array.isArray(component.children)) {
      children = component.children.map((child, index) =>
        typeof child === 'string'
          ? processTemplateString(child, data)
          : <ComponentRenderer key={index} component={child} data={data} />
      );
    }
  }
  
  return <Component {...processedProps}>{children}</Component>;
}
```

---

# CONCLUSION

## Points Clés à Retenir

1. **Architecture modulaire** = Extensibilité garantie
2. **TypeScript strict** = Fiabilité calculs financiers
3. **Server-Driven UI** = Adaptabilité UI selon type décision
4. **OpenAI GPT-4o-mini** = Extraction intelligente à coût maîtrisé
5. **Fallbacks robustes** = Pas de single point of failure
6. **MVP fonctionnel** = 5 types de décision opérationnels
7. **KPIs mesurables** = Évaluation objective possible
8. **Next steps clairs** = Vision produit définie

## Messages pour Présentation

- **"Nous transformons la comptabilité en intelligence stratégique"**
- **"Architecture modulaire = MVP solide + évolutivité garantie"**
- **"5 types de décision opérationnels, extraction PDF à venir"**
- **"KPIs mesurables = MVP objectivement évaluable"**
- **"Next steps clairs = vision produit définie"**

---

**Document créé pour préparation présentation avec ChatGPT**
**Date : 2024**
**Version : 1.0**
