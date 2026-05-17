# Rollback procedure — Sprint C multi-tenant

> Procédure de restauration en cas de problème détecté après le merge /
> déploiement Sprint C (mode cabinet UX). Délai cible : **< 30 min**.

## Pré-requis

- **PITR Firestore actif** (rétention 7 jours).
- Tag commit pré-Sprint C : créer `multi-tenant-C-deployed-<timestamp>`
  juste après le merge dans `features` pour faciliter `git revert`.

## Étape 1 — Détection (< 5 min)

| Symptôme | Origine probable |
|---|---|
| Un `company_owner` est redirigé vers `/onboarding` au login | Bug routing accountType |
| `firm_member` voit /analysis vide alors qu'il devrait voir une Company spécifique | activeCompanyStore non hydraté |
| Picker `/cabinet/onboarding/picker` affiche 0 dossier | Échec callback OAuth Firm ou Sprint B `createMappingsForFirmCallback` |
| Vue `/cabinet/portefeuille` retourne 403 sur firm_member | Mauvaise lecture `users.accountType` |
| Sélecteur de Company invisible pour firm_member | `/api/cabinet/portefeuille` 500 silencieux |
| Erreur Firestore rules sur `firms/{firmId}` | Règle `memberUserIds` mal déployée |

## Étape 2 — Feature flag d'urgence (sans rollback Git)

Le brief Sprint D introduit un feature flag (cf. `docs/rollback-multi-tenant-D.md`). En attendant son déploiement, désactivation par revert Git uniquement.

## Étape 3 — Rollback Firestore (PITR)

### Collections impactées en Sprint C

| Collection | Modification | Action rollback |
|---|---|---|
| `firms` | Créée par Sprint C | Supprimer entièrement (tests internes uniquement avant prod) |
| `users` | Champs `accountType` + `firmId` ajoutés à certains docs | PITR restore ciblé ou nettoyer les 2 champs |
| `oauth_states` | Nouvelle valeur `kind: "firm"` | Aucune action (TTL 10 min, éphémère) |
| `connections` | Nouvelles entrées `providerSub: "pennylane_firm"` | Marker `status: "revoked"` |
| `connection_companies` | Nouvelles entrées | `isActive=false` ou suppression |

### Commandes

```bash
# Si très peu de docs touchés : nettoyage manuel via console.
# Sinon, PITR restore ciblé :
gcloud firestore restore \
  --source-backup=<BACKUP_ID_PRE_SPRINT_C> \
  --collection-ids=firms,users,connections,connection_companies
```

## Étape 4 — Rollback code

```bash
git checkout features
git pull origin features
git revert -m 1 <SHA_DU_MERGE_SPRINT_C>
git push origin features
```

Vercel redéploie automatiquement.

## Étape 5 — Effets de bord à surveiller

| Effet | Risque | Mitigation |
|---|---|---|
| `users.accountType` reste peuplé sur certains docs | Aucun — Sprint A/B continuent de fonctionner sans lire ce champ | Cleanup batch post-stabilisation |
| Entrées `connections` Firm OAuth orphelines | Tokens chiffrés inutilisables, pas de risque sécu | Suppression batch via script ad-hoc |
| `firms/{id}` orphelins | Doc lisible uniquement par memberUserIds — pas de fuite | Suppression batch |
| Cabinets bêta-testeurs ayant complété l'onboarding | Régression UX (redirige vers `/documents`) | Communiquer en amont, garder leurs `firmId` en attente de re-déploiement |

## Étape 6 — Communication aux bêta-testeurs cabinet

> Bonjour,
>
> Nous avons identifié un problème technique sur le mode cabinet de Vyzor
> et avons restauré la version précédente de l'application. Vos données
> et vos connexions Pennylane restent intactes.
>
> Le mode cabinet sera réactivé après corrections. Nous vous tiendrons
> informé(e).
>
> [Signature]

## Étape 7 — Post-mortem

Documenter dans `docs/incidents/YYYY-MM-DD-multi-tenant-C.md` :
- Symptôme observé
- Diagnostic
- Cause racine
- Plan de correction
- Test E2E qui couvrirait le cas

## Validation post-rollback

| Vérif | Méthode |
|---|---|
| `users` sans `accountType` → routing par défaut `company_owner` OK | Test login dirigeant existant |
| Routes `/cabinet/*` → 404 ou redirect | Browser direct |
| Sprint B / Sprint A toujours opérationnels | `pnpm test` sur les 47 tests Sprint A+B |
| Pas d'erreur `[CompanyAccessError]` inhabituelle dans Vercel logs | Dashboard logs |

## Délai estimé total

| Étape | Durée |
|---|---|
| Détection | 5 min |
| Décision | 1 min |
| Rollback Firestore | 10 min |
| Rollback code (revert + redéploiement) | 5 min |
| Communication bêta-testeurs cabinet | 5 min |
| **Total** | **< 30 min** |
