# QUANTIS V2 - Résumé Exécutif Présentation
## Version ultra-condensée pour pitch rapide

---

## Mise a jour produit (2026-04-01)

- Positionnement actuel: plateforme de pilotage financier multi-onglets avec pipeline Excel/PDF, stockage Firestore et dashboards de decision.
- Stack courante: Next.js 16 (App Router), React 19, TypeScript, Firebase/Firestore, Recharts.
- Livrables recents a mettre en avant:
  - TCAM multi-annees calcule sur l'historique reel (annee la plus ancienne -> annee courante).
  - Indicateurs de tendance KPI (hausse/baisse/stable) sur Synthese et sections metier.
  - Point mort premium corrige (intersection exacte, repere aligne, tooltip lisible, plein ecran).
  - Formules investissement/financement alignees (`BFR`, `ratio_immo`, `cash reel`).

> Note: le reste du document est conserve comme trame de pitch. En cas d'ecart, se referer a `README.md` et `projet.md`.

---

## 🎯 EN 30 SECONDES

**Quantis = CFO adaptatif pour PME**
- Upload liasse comptable (Excel/PDF) → mapping 2033 → KPI actionnables
- Pilotage en 4 onglets metier : Creation de valeur, Investissement, Financement, Rentabilite
- Historique multi-annees avec TCAM, tendances KPI et cash reel
- Stack : Next.js 16, TypeScript, Firebase/Firestore, Recharts

---

## 🏗️ ARCHITECTURE EN 1 DIAPOSITIVE

```
[Upload documents comptables]
        ↓
[Parsing + extraction]
        ↓
[Mapping financier 2033]
        ↓
[Calcul KPI]
        ↓
[Corrections historiques multi-annees]
        ↓
[Dashboards premium + graphes metier]
```

**Stack :** Next.js 16 | TypeScript | Tailwind CSS | Firebase/Firestore

---

## ✅ CHOIX TECHNIQUES (3 points)

1. **Next.js (App Router)** → API Routes intégrées, pas de backend séparé
2. **TypeScript strict** → Sécurité calculs financiers
3. **Architecture modulaire** → Extensibilité garantie

---

## 🔥 DIFFICULTÉS & SOLUTIONS (3 points)

1. **Donnees heterogenes Excel** → Mapping renforce + fallback par labels/codes.
2. **Historique non ordonne** → Tri fiscal robuste + recalcul TCAM multi-annees.
3. **Lisibilite decisionnelle** → Refonte point mort/BFR (alignment, tooltip, plein ecran, zones visuelles).

---

## 📊 KPIs MVP (4 métriques)

| Métrique | Objectif |
|----------|----------|
| Cohérence TCAM multi-années | 100% |
| Cohérence BFR / cash réel | 100% |
| Alignement visuel point mort | 100% |
| Stabilité rendu dashboard | Fluide en desktop et mobile |

---

## 🚀 NEXT STEPS (3 priorités)

1. **Parser PDF semantique** (cas multi-pages complexes)
2. **Optimisations perf front** (reduire rerenders et animations couteuses)
3. **Wording global** (passage exhaustif de tous les libelles)

---

## 💬 PHRASES CLÉS POUR LA PRÉSENTATION

- *"Nous transformons la comptabilité en intelligence stratégique"*
- *"Les formules financières sont centralisées et testables, pas dupliquées dans l'UI."*
- *"Le multi-années est robuste: l'ordre d'import des exercices n'impacte plus les KPI."*
- *"Le point mort est lisible en quelques secondes et mathématiquement cohérent."*

---

## 🎬 DÉMO RECOMMANDÉE (30 sec)

1. Importer une liasse puis ouvrir `Synthese` (KPI + tendances N vs N-1).
2. Aller dans `Creation de valeur` et montrer le point mort (date, zones, intersection).
3. Montrer `Investissement` (BFR, ratio immo net/brut) puis `Financement` (cash reel).
4. Changer l'exercice et visualiser la mise a jour TCAM/tendances.

---

**Format : 4 minutes = 30s vision + 1min tech + 1min difficultés + 1min KPIs + 30s next steps**
