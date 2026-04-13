# PROJECT_TECH_STATUS.md
> Snapshot global du projet Quantis — 2026-04-13

---

## Stack technique

| Couche | Techno |
|---|---|
| Frontend | Next.js + React + TypeScript + Tailwind CSS |
| Backend | Next.js API Routes + Node.js |
| Base de données | Firebase Firestore |
| Auth | Firebase Authentication |
| OCR | Google Document AI |
| Hébergement | Vercel |
| Source vérité métier | Quantis_Mapping_2033SD.xlsx (formulaire 2033-SD) |

---

## État des modules principaux

| Module | Statut | Notes |
|---|---|---|
| Authentification | ✅ En place | Firebase Auth |
| Upload PDF | ✅ Fonctionnel | Via UI /pdf-parser-test |
| Pipeline OCR → parsing | ✅ Fonctionnel | Google DocAI sync |
| Mapping métier (bridge) | ✅ Partiel | Couverture ~25% des 61 champs |
| Calcul KPI | ✅ Partiel | ~7 KPI stables sur 34 définis |
| Persistance Firestore | ✅ OK | mappedData + kpis + diagnostic |
| UI test parser | ✅ OK | /pdf-parser-test |
| Dashboard principal | 🔍 Statut inconnu | À confirmer |
| Gestion PDF longs | ⚠️ Partiel | Erreur propre, pas de vrai async |
| Tests automatisés | 🔍 Statut inconnu | À confirmer |

---

## Documents de pilotage du parser

| Fichier | Contenu |
|---|---|
| `PARSER_STATUS.md` | Snapshot état actuel (champs + KPI + infra) |
| `PARSER_ROADMAP.md` | Lots priorisés avec critères de "done" |
| `PARSER_FIELD_COVERAGE.md` | Couverture champ par champ (61 variables) |
| `PARSER_KPI_COVERAGE.md` | État des 34 KPI avec dépendances |
| `PARSER_DECISIONS.md` | Log des décisions d'architecture |
| `PROJECT_TECH_STATUS.md` | Ce fichier — vue globale projet |

---

## Priorités immédiates

1. **Accès au code source** du parser pour confirmer l'état réel des 43 champs "à vérifier"
2. **Lot 1** : débloquer `dettes_fisc_soc` et `autres_creances` → débloque BFR + 5 KPI liquidités
3. **Lot 2** : audit de couverture complet sur PDF réel de référence

---

## Ce qui n'est PAS une priorité maintenant

- Traitement async PDF longs (Lot 5)
- Benchmark Mistral OCR (Lot 6)
- Refactoring majeur de l'architecture

---

## Prochain jalon cible

**BFR calculé et affiché sur le PDF de référence réel.**
C'est le KPI le plus attendu et le plus bloquant pour la crédibilité produit.
