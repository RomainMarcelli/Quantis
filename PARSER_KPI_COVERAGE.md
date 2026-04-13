# PARSER_KPI_COVERAGE.md — Couverture KPIs Quantis

> Dernière mise à jour : 2026-04-13

---

## Légende

- ✅ **Débloqué** : toutes les dépendances sont disponibles depuis le parser
- ⚠️ **Partiel** : certaines dépendances sont disponibles, résultat possible mais incomplet
- ❌ **Bloqué** : dépendances manquantes dans le parser actuel

---

## KPIs et leurs dépendances

| KPI | Formule (résumé) | Dépendances `MappedFinancialData` | Statut |
|---|---|---|---|
| `ca` | ventes_march + prod_vendue | `ventes_march`, `prod_vendue` | ✅ Débloqué |
| `va` | total_prod_expl - achats_march - achats_mp - ace | `total_prod_expl`, `achats_march`, `achats_mp`, `ace` | ✅ Débloqué |
| `ebitda` | va - impots_taxes - salaires - charges_soc | `va`, `impots_taxes`, `salaires`, `charges_soc` | ✅ Débloqué |
| `ebe` | = ebitda | voir ebitda | ✅ Débloqué |
| `marge_ebitda` | ebitda / total_prod_expl × 100 | `ebitda`, `total_prod_expl` | ✅ Débloqué |
| `charges_var` | achats_march + achats_mp + var_stock_march + var_stock_mp | `achats_march`, `achats_mp`, `var_stock_march`, `var_stock_mp` | ✅ Débloqué |
| `mscv` | ca - charges_var | `ca`, `charges_var` | ✅ Débloqué |
| `tmscv` | mscv / ca | `mscv`, `ca` | ✅ Débloqué |
| `charges_fixes` | ace + salaires + charges_soc + dap | `ace`, `salaires`, `charges_soc`, `dap` | ✅ Débloqué |
| `point_mort` | charges_fixes / tmscv | `charges_fixes`, `tmscv` | ✅ Débloqué |
| `ratio_immo` | total_actif_immo_net / total_actif_immo_brut | `total_actif_immo_net`, `total_actif_immo_brut` | ⚠️ Partiel — nécessite brut ET net distincts |
| `bfr` | (total_stocks + creances) - (fournisseurs + dettes_fisc_soc) | `total_stocks`, `creances`, `fournisseurs`, `dettes_fisc_soc` | ✅ Débloqué (validé Lot 1) |
| `rot_bfr` | bfr / (total_prod_expl × 1.2) × 365 | `bfr`, `total_prod_expl` | ✅ Débloqué |
| `dso` | clients × 365 / (total_prod_expl × 1.2) | `clients`, `total_prod_expl` | ✅ Débloqué |
| `dpo` | fournisseurs × 365 / ((achats_march + ace) × 1.2) | `fournisseurs`, `achats_march`, `ace` | ✅ Débloqué (validé Lot 1) |
| `rot_stocks` | total_stocks × 365 / total_prod_expl | `total_stocks`, `total_prod_expl` | ✅ Débloqué |
| `caf` | res_net + dap | `res_net`, `dap` | ✅ Débloqué |
| `fte` | caf - delta_bfr | `caf`, `delta_bfr` | ⚠️ Partiel — `delta_bfr` non alimenté (nécessite 2 exercices) |
| `tn` | dispo - emprunts | `dispo`, `emprunts` | ✅ Débloqué |
| `solvabilite` | total_cp / total_passif | `total_cp`, `total_passif` | ✅ Débloqué |
| `gearing` | (emprunts - dispo) / ebitda | `emprunts`, `dispo`, `ebitda` | ✅ Débloqué |
| `liq_gen` | total_actif_circ / (fournisseurs + dettes_fisc_soc) | `total_actif_circ`, `fournisseurs`, `dettes_fisc_soc` | ✅ Débloqué |
| `liq_red` | (creances + dispo) / (fournisseurs + dettes_fisc_soc) | `creances`, `dispo`, `fournisseurs`, `dettes_fisc_soc` | ✅ Débloqué |
| `liq_imm` | dispo / (fournisseurs + dettes_fisc_soc) | `dispo`, `fournisseurs`, `dettes_fisc_soc` | ✅ Débloqué |
| `disponibilites` | = dispo | `dispo` | ✅ Débloqué |
| `roce` | (ebit × 0.75) / (total_actif_immo + bfr) | `ebit`, `total_actif_immo`, `bfr` | ✅ Débloqué |
| `roe` | res_net / total_cp | `res_net`, `total_cp` | ✅ Débloqué |
| `effet_levier` | roe - roce | `roe`, `roce` | ✅ Débloqué |
| `resultat_net` | res_net ou resultat_exercice | `res_net` | ✅ Débloqué |
| `grossMarginRate` | tmscv × 100 | `tmscv` | ✅ Débloqué |
| `netProfit` | resultat_net | `res_net` | ✅ Débloqué |
| `workingCapital` | = bfr | `bfr` | ✅ Débloqué (validé Lot 1) |
| `monthlyBurnRate` | abs(netProfit) / 12 si négatif | `res_net` | ✅ Débloqué |
| `cashRunwayMonths` | dispo / monthlyBurnRate | `dispo`, `monthlyBurnRate` | ✅ Débloqué |
| `capacite_remboursement_annees` | emprunts / caf | `emprunts`, `caf` | ✅ Débloqué |
| `etat_materiel_indice` | ratio_immo × 100 | `ratio_immo` | ⚠️ Partiel — dépend de ratio_immo |
| `tcam` | taux croissance annuel moyen | `ca`, `ca_n_minus_1`, `n` | ❌ Bloqué — `ca_n_minus_1` non alimenté |
| `healthScore` | score composite | `grossMarginRate`, `netProfit`, `workingCapital`, `cashRunwayMonths` | ✅ Débloqué |

---

## Résumé

| Statut | Nombre |
|---|---|
| ✅ Débloqué | 29 |
| ⚠️ Partiel | 3 (`fte`, `ratio_immo`, `etat_materiel_indice`) |
| ❌ Bloqué | 1 (`tcam`) |

---

## Actions pour débloquer les KPIs partiels / bloqués

### `tcam` (bloqué)
**Besoin** : extraire `ca_n_minus_1` depuis la colonne N-1 du compte de résultat.  
**Approche** : ajouter un champ `netTurnoverPreviousYear` dans `FinancialFieldKey` avec `columnStrategy: "nMinus1"`, puis le mapper dans le bridge.

### `ratio_immo` (partiel)
**Besoin** : distinguer `total_actif_immo_brut` (colonne brut) et `total_actif_immo_net` (colonne net) depuis le bilan actif.  
**Approche** : utiliser `totalFixedAssetsGross` (strategy `leftmost`) vs `totalFixedAssets` (strategy `netPriority`) — déjà définis, vérifier la sélection sur PDF réel.

### `fte` (partiel)
**Besoin** : `delta_bfr` nécessite 2 exercices.  
**Approche** : calculer automatiquement depuis le BFR N et BFR N-1 si les 2 sont disponibles.

---

## Notes importantes

- La formule `bfr` dans `kpiEngine.ts` utilise `sum()` qui retourne `null` si **une seule** dépendance est null. Donc `fournisseurs` et `dettes_fisc_soc` **doivent tous les deux** être non-null pour calculer `bfr`.
- Validé en Lot 1 : les deux sont maintenant extraits correctement.
