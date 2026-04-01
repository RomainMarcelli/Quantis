# QUANTIS V2 - Présentation Technique & Démo
## Guide de présentation - 4 minutes

---

## Mise a jour produit (2026-04-01)

- Stack actuelle: Next.js 16, React 19, TypeScript, Tailwind, Firebase/Firestore, Recharts.
- Parcours demo recommande:
  1. Upload d'une liasse Excel/PDF.
  2. Lecture Synthese avec tendances N vs N-1.
  3. Onglet Creation de valeur: focus TCAM multi-annees + point mort.
  4. Onglet Investissement: modele BFR et ratio immobilisations net/brut.
  5. Onglet Financement: cash reel (`CAF - delta BFR`) et liquidites.
- Le moteur historique recalcule automatiquement les KPI sensibles a l'ordre des annees (TCAM, delta BFR, cash reel).

> Note: les sections historiques ci-dessous restent utiles pour la narration, mais l'etat de verite est dans `README.md` et `projet.md`.

---

## 🎯 STRUCTURE DE LA PRÉSENTATION (4 min)

### **Slide 1 : Vision & Problème (30 sec)**
**Le problème :**
- 99,8% des PME naviguent dans un brouillard financier
- Données comptables = artefacts de conformité, pas d'aide à la décision
- Dirigeants prennent des décisions stratégiques (recrutement, investissement, prix) à l'intuition

**La solution Quantis :**
- Transformer la donnée comptable statique en intelligence stratégique dynamique
- Un "CFO adaptatif" accessible via langage naturel
- De la question à la décision en 4 étapes : Intention → Raisonnement → Enrichissement → Restitution

---

### **Slide 2 : Architecture Technique (45 sec)**

#### **Stack Technologique**
- **Frontend :** Next.js 16 + React 19 + TypeScript
- **Styling :** Tailwind CSS (design system modulaire)
- **Data & stockage :** Firebase (Auth + Firestore)
- **Visualisation :** Recharts
- **Architecture :** Full-stack monorepo avec API Routes Next.js

#### **Architecture en 3 couches**

```
┌─────────────────────────────────────────┐
│   COUCHE PRÉSENTATION (UI)             │
│   - Dashboard Bento Grid               │
│   - Decision Mode (onglets dynamiques) │
│   - Composants UI générés dynamiquement│
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│   COUCHE LOGIQUE MÉTIER                 │
│   - Question Classifier (5 types)      │
│   - Parameter Extractor (OpenAI)       │
│   - Data Requirement Checker           │
│   - Analyzers spécialisés              │
│   - Calculators (KPI, scénarios)       │
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│   COUCHE DONNÉES                        │
│   - FinancialData (TypeScript types)    │
│   - Extraction PDF/Excel (à venir)      │
│   - Datasets Acme Corporation (test)   │
└─────────────────────────────────────────┘
```

#### **Flux de traitement d'une question**

1. **Question utilisateur** → `/api/question` (POST)
2. **Classification** → `question-classifier.ts` (mots-clés → 5 types de décision)
3. **Extraction paramètres** → `parameter-extractor.ts` (OpenAI GPT-4o-mini)
4. **Vérification données** → `data-requirement-checker.ts` (gap analysis)
5. **Analyse financière** → `*-analyzer.ts` (calculs métier)
6. **Génération UI** → `ui-generator.ts` (composants React dynamiques)
7. **Rendu** → `DynamicRenderer.tsx` (registry de composants)

---

### **Slide 3 : Choix Techniques & Justifications (45 sec)**

#### **1. Next.js (App Router)**
✅ **Pourquoi :**
- API Routes intégrées (pas besoin de backend séparé)
- Server Components pour performance
- Routing automatique basé sur fichiers
- Optimisations SEO/performance natives

#### **2. TypeScript strict**
✅ **Pourquoi :**
- Types financiers complexes (FinancialData, AnalysisResult)
- Sécurité des calculs (pas d'erreurs de typage sur montants)
- Auto-complétion IDE pour développement rapide
- Documentation vivante via types

#### **3. Architecture modulaire (analyzers/calculators/generators)**
✅ **Pourquoi :**
- Séparation des responsabilités claire
- Testabilité unitaire facilitée
- Extensibilité (ajout nouveaux types de décision)
- Réutilisabilité des calculs

#### **4. OpenAI GPT-4o-mini (vs GPT-4)**
✅ **Pourquoi :**
- Coût 10x inférieur pour extraction paramètres
- Latence acceptable (< 2s)
- Qualité suffisante pour structuration JSON
- Fallback regex si API indisponible

#### **5. UI Dynamique (Component Registry)**
✅ **Pourquoi :**
- Génération d'interfaces adaptées au type de décision
- Pas de code dupliqué entre types
- Évolutivité (nouveaux composants = ajout registry)

---

### **Slide 4 : Difficultés Rencontrées & Solutions (60 sec)**

#### **Difficulté 1 : Extraction de données financières depuis PDF/Excel**
🔴 **Problème :**
- Formats comptables variés (liasses fiscales, balances Excel)
- Structures non standardisées
- Nécessité de comprendre la sémantique comptable

✅ **Solution MVP :**
- Dataset Acme Corporation généré (Python scripts)
- Types TypeScript stricts pour validation
- Architecture prête pour intégration OCR/parsing (à venir)

#### **Difficulté 2 : Classification précise des questions**
🔴 **Problème :**
- Questions ambiguës ("Est-ce que je peux recruter ?")
- Mots-clés multiples possibles
- Contexte métier nécessaire

✅ **Solution :**
- Système de scoring par mots-clés (français + anglais)
- 5 types de décision MVP bien définis
- Fallback vers extraction OpenAI si classification échoue

#### **Difficulté 3 : Gap Analysis (données manquantes)**
🔴 **Problème :**
- Questions incomplètes ("Recruter un commercial")
- Données financières partielles
- Besoin d'interaction utilisateur

✅ **Solution :**
- `data-requirement-checker.ts` identifie champs manquants
- Formulaire dynamique (`DataRequestForm`) généré selon type
- Workflow conversationnel (pas de blocage)

#### **Difficulté 4 : Génération UI dynamique**
🔴 **Problème :**
- Chaque type de décision nécessite UI différente
- Graphiques spécifiques (projections, scénarios)
- Évolutivité sans réécriture

✅ **Solution :**
- `ComponentRegistry` centralisé
- `DynamicRenderer` avec mapping type → composant
- Composants UI réutilisables (KPICard, LineChart, etc.)

#### **Difficulté 5 : Calculs financiers fiables**
🔴 **Problème :**
- Formules complexes (BFR, point mort, ROI)
- Gestion arrondis/erreurs
- Scénarios multiples (optimiste/réaliste/pessimiste)

✅ **Solution :**
- `financial-calculator.ts` centralisé avec fonctions pures
- Tests unitaires sur formules critiques
- `scenario-generator.ts` pour projections

---

### **Slide 5 : KPIs de Mesure du MVP (45 sec)**

#### **Métriques Techniques**

| KPI | Objectif MVP | Mesure |
|-----|--------------|--------|
| **Taux de classification** | > 85% | Questions correctement typées |
| **Temps de réponse** | < 3s | De la question à l'analyse complète |
| **Taux de complétude** | > 70% | Analyses sans données manquantes |
| **Précision calculs** | 100% | Validation formules financières |
| **Couverture types** | 5/5 | Tous types MVP fonctionnels |

#### **Métriques Métier (Valeur Utilisateur)**

| KPI | Objectif MVP | Mesure |
|-----|--------------|--------|
| **Taux d'adoption** | > 60% | Utilisateurs posant ≥ 3 questions/semaine |
| **Temps économisé** | -80% | vs consultation expert-comptable |
| **Décisions éclairées** | 100% | Analyses avec projections + scénarios |
| **ROI utilisateur** | Positif | Argent trouvé > coût abonnement |

#### **Métriques Qualité**

| KPI | Objectif MVP | Mesure |
|-----|--------------|--------|
| **Erreurs calculs** | 0 | Validation unitaire + manuelle |
| **UX Score** | > 4/5 | Feedback utilisateurs beta |
| **Performance** | < 2s | Temps chargement page |
| **Disponibilité** | > 99% | Uptime API |

#### **Comment mesurer objectivement ?**

1. **Tests automatisés :**
   - Suite de tests sur 5 types de décision
   - Validation formules financières
   - Tests d'intégration API

2. **Dataset de référence :**
   - Acme Corporation (scénarios connus)
   - Validation résultats attendus vs calculés

3. **Métriques utilisateur :**
   - Analytics (questions posées, temps session)
   - Feedback qualitatif (interviews dirigeants PME)

4. **Benchmark :**
   - Comparaison avec outils existants (Excel, BI)
   - Temps de réponse vs consultation humaine

---

### **Slide 6 : Next Steps (15 sec)**

#### **Court terme (1-2 mois)**
1. ✅ **Intégration extraction PDF/Excel**
   - OCR pour liasses fiscales
   - Parser Excel robuste (balances, comptes de résultat)

2. ✅ **Authentification & Multi-tenant**
   - Auth0 ou NextAuth
   - Isolation données par entreprise

3. ✅ **Base de données**
   - PostgreSQL pour historique analyses
   - Cache Redis pour performances

#### **Moyen terme (3-6 mois)**
4. ✅ **Benchmarking sectoriel**
   - Agrégation anonymisée données
   - Comparaisons PME similaires

5. ✅ **Notifications proactives**
   - Détection opportunités (argent dormant)
   - Alertes trésorerie

6. ✅ **Export & Partage**
   - PDF analyses pour banquiers
   - Intégration outils comptables

#### **Long terme (6-12 mois)**
7. ✅ **IA prédictive avancée**
   - Modèles ML pour projections
   - Détection anomalies financières

8. ✅ **Marketplace conseils**
   - Connexion experts-comptables
   - Conseils personnalisés

---

## 🎤 CONSEILS DE PRÉSENTATION

### **Timing recommandé :**
- **0:00-0:30** : Vision & Problème (hook émotionnel)
- **0:30-1:15** : Architecture Technique (démos visuelles)
- **1:15-2:15** : Choix & Difficultés (crédibilité technique)
- **2:15-3:00** : KPIs (objectivité & mesure)
- **3:00-3:15** : Next Steps (vision future)
- **3:15-4:00** : Q&A / Démo live

### **Points forts à mettre en avant :**
1. ✅ **Architecture modulaire** = évolutivité
2. ✅ **TypeScript strict** = fiabilité calculs
3. ✅ **UI dynamique** = adaptabilité
4. ✅ **Fallbacks** = robustesse (pas de single point of failure)
5. ✅ **MVP fonctionnel** = 5 types de décision opérationnels

### **Points de vigilance :**
- ⚠️ Extraction PDF/Excel = "à venir" (honnêteté)
- ⚠️ Dataset test uniquement (pas encore production)
- ⚠️ OpenAI dépendance (mais fallback prévu)

### **Démo recommandée :**
1. Poser une question : *"Est-ce que je peux recruter un directeur commercial à 60k€ ?"*
2. Montrer le flux : Classification → Extraction → Gap Analysis → Analyse
3. Afficher résultat : KPIs + Graphiques + Projections
4. Expliquer la valeur : Décision éclairée en 3 secondes

---

## 📊 DIAPOSITIVES VISUELLES SUGGÉRÉES

1. **Architecture diagram** (Slide 2)
2. **Flux de traitement** (Slide 2)
3. **Tableau choix techniques** (Slide 3)
4. **Timeline difficultés** (Slide 4)
5. **Dashboard KPIs** (Slide 5)
6. **Roadmap next steps** (Slide 6)

---

## 💡 MESSAGES CLÉS À RETENIR

1. **"Nous transformons la comptabilité en intelligence stratégique"**
2. **"Architecture modulaire = MVP solide + évolutivité garantie"**
3. **"5 types de décision opérationnels, extraction PDF à venir"**
4. **"KPIs mesurables = MVP objectivement évaluable"**
5. **"Next steps clairs = vision produit définie"**

---

**Bonne présentation ! 🚀**
