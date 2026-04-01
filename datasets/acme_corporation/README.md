# Datasets Acme Corporation - Documentation

## Mise a jour (2026-04-01)

- Ce dataset 2023 reste un jeu de reference pour tests et demos.
- L'application supporte maintenant un historique multi-annees via `fiscalYear` (analyse de plusieurs exercices).
- Les nouvelles liasses reelles (ex: 2025) peuvent etre chargees en complement, sans remplacer ce dataset de base.

## Vue d'ensemble

Ce dossier contient les fichiers Excel complets et cohérents pour **Acme Corporation**, une PME manufacturière fictive utilisée pour tester l'application Quantis.

## Profil de l'entreprise

- **Type** : PME manufacturière, secteur industrie
- **Effectif** : 45 salariés
- **CA annuel 2023** : 3,5M€
- **Trésorerie** : 145k€
- **Santé globale** : 85%
- **Croissance** : +8% par an
- **Marge brute** : ~38-44%
- **Délais clients** : 45 jours (moyenne)
- **Délais fournisseurs** : 30 jours (moyenne)
- **Rotation stocks** : 45 jours

## Fichiers générés

### 1. AcmeCorporation_Balance_2023.xlsx
**Balance Générale au 31/12/2023**

- Structure complète du plan comptable français (PCG)
- Actif total : 1,850,000 €
- Passif total : 1,850,000 € (équilibré)
- Trésorerie : 145,000 € (comptes 512 + 531)

**Postes principaux :**
- Immobilisations : 1,330,000 €
- Stocks : 142,000 €
- Créances : 233,000 €
- Disponibilités : 145,000 €
- Capitaux propres : 1,435,000 €
- Dettes : 172,000 €

### 2. AcmeCorporation_CompteResultat_2023.xlsx
**Compte de Résultat Mensuel (12 mois)**

- CA annuel : 3,500,000 € HT
- CA TTC : 4,200,000 €
- Achats : ~1,970,000 €
- Charges personnel : 540,000 €
- Charges sociales : 228,000 €
- Résultat net : ~102,000 €

**Variations mensuelles :**
- Croissance progressive : +0,67% par mois
- Saisonnalité : variations ±10-15%
- Données cohérentes sur 12 mois

### 3. AcmeCorporation_GrandLivre_2023.xlsx
**Grand Livre - Toutes les écritures comptables**

- Nombre d'écritures : ~1,880
- Journaux : VT (Ventes), AC (Achats), BQ (Banque), OD (Opérations Diverses)
- Total débits = Total crédits (équilibré)
- Écritures mensuelles cohérentes avec le compte de résultat

**Structure :**
- Date | Journal | N° Pièce | Compte | Libellé | Débit | Crédit | Tiers | Solde

### 4. AcmeCorporation_BalanceAgeeClients_2023.xlsx
**Balance Âgée Clients - Détail des créances**

- Total créances : 205,000 €
- Délai moyen : ~44 jours
- Répartition réaliste :
  - 30% payés (0 jours)
  - 25% en attente (30 jours)
  - 25% retards modérés (60 jours)
  - 15% retards importants (90 jours)
  - 5% très anciens (120 jours)

**Structure :**
- Client | N° Facture | Date Facture | Date Échéance | Montant HT | Montant TTC | Jours | Statut

### 5. AcmeCorporation_BalanceAgeeFournisseurs_2023.xlsx
**Balance Âgée Fournisseurs - Détail des dettes**

- Total dettes : 107,000 €
- Délai moyen : ~29 jours
- Répartition :
  - 40% payés récemment
  - 60% en attente (délais 20-40 jours)

**Structure :**
- Fournisseur | N° Facture | Date Facture | Date Échéance | Montant HT | Montant TTC | Jours | Statut

## Cohérences validées

✅ **Balance équilibrée** : Actif = Passif = 1,850,000 €
✅ **Trésorerie conforme** : 145,000 €
✅ **Grand Livre équilibré** : Débits = Crédits
✅ **Totaux cohérents** : Balance Âgée Clients = 205k€ (correspond à Balance)
✅ **Totaux cohérents** : Balance Âgée Fournisseurs = 107k€ (correspond à Balance)
✅ **Délais moyens conformes** : Clients ~45j, Fournisseurs ~30j
✅ **CA annuel conforme** : 3,500,000 €

## Scénarios de test validés

### ✅ Simulation Recrutement Directeur Commercial
- Salaire brut : 60,000 €/an
- Coût chargé : 85,200 €/an (7,100 €/mois)
- **Résultat** : Trésorerie reste > 50k€ après 12 mois (59,800 €)
- **Statut** : ✅ Recrutement soutenable

### ✅ Santé Globale
- Score calculé : 85%
- Ratios excellents :
  - Liquidité : > 2 (excellent)
  - Endettement : 0 (pas de dette structurelle)
  - Marge brute : ~38-44%
- **Statut** : ✅ Santé excellente

### ✅ Argent Dormant
- Détecté : ~36,000 €
- Sources :
  - Stocks lents : ~15,000 €
  - Créances anciennes (>90j) : ~21,000 €
- **Statut** : ✅ Détection fonctionnelle

### ✅ Alertes
- Nombre d'alertes générées : 6
- Types :
  - Retards clients
  - Échéances fiscales
  - Paiements en attente
- **Statut** : ✅ Système d'alertes fonctionnel

## Utilisation

Ces fichiers peuvent être utilisés pour :
1. **Tests de l'application Quantis** : Upload des fichiers Excel pour tester toutes les fonctionnalités
2. **Développement backend** : Validation de l'extraction et du traitement des données
3. **Tests de scénarios** : Simulation de décisions stratégiques
4. **Validation des KPIs** : Vérification du calcul des ratios et indicateurs

## Notes

- Les données sont **fictives** mais **réalistes** et **cohérentes**
- Tous les fichiers respectent le **plan comptable français (PCG)**
- Les dates sont cohérentes (année 2023)
- Les montants sont en **euros (EUR)**
- Les délais clients/fournisseurs sont réalistes pour une PME française

## Génération

Pour régénérer les fichiers :
```bash
python scripts/generate_acme_datasets.py
```

Pour valider les fichiers :
```bash
python scripts/validate_acme_datasets.py
```
