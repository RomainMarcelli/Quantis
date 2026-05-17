# Rollback procedure — Sprint A multi-tenant

> Procédure de restauration en cas de problème détecté après la migration
> Sprint A. Délai cible total (détection → rollback complet) : **< 30 min**.

## Pré-requis

- **PITR Firestore activé** le 16/05/2026 18:32 UTC+2 (cf. `docs/audit-sprint-A.md`).
- Rétention 7 jours. Au-delà, le rollback n'est plus possible via PITR.
- Localisation Firestore : `eur3`.
- Accès console GCP avec permissions `Cloud Datastore Owner` ou équivalent.

## Étape 1 — Détection (< 5 min)

Symptômes qui doivent déclencher le rollback :

| Symptôme | Origine probable |
|---|---|
| Utilisateurs reportent "page blanche" sur synthese/analysis | Migration analyses incomplète |
| 404/403 systématiques sur les routes API sync/reports/ai | `resolveCompanyContext` throw — Company non créée pour ce user |
| Erreur `Aucune Company active pour user X` dans les logs Vercel | Idem |
| Doublons de Companies en console Firebase | Script de migration relancé sans le check d'idempotence (anomalie) |
| Tests E2E rouges sur preview Vercel après merge | Régression code |

## Étape 2 — Décision rollback (1 min)

Critère : **toute interruption de service > 10 min** justifie le rollback
immédiat. Pas de tentative de correction "à chaud" sur la prod.

Informer Antoine + Romain immédiatement (Slack ou WhatsApp), puis exécuter
les commandes ci-dessous.

## Étape 3 — Rollback Firestore via PITR (< 15 min)

### 3a. Identifier le timestamp avant la migration

Le commit de migration prod est tagué `multi-tenant-A-deployed-<timestamp>`
(à créer après exécution prod). En l'absence du tag, prendre le timestamp
UTC juste avant l'exécution du script.

### 3b. Lancer la restauration PITR

```bash
# Identifier le PITR snapshot disponible le plus proche du timestamp T-1min :
gcloud firestore operations list --filter="metadata.type=BACKUP"

# Restauration sélective des collections impactées (préférable à un
# restore complet qui écraserait aussi les nouvelles connections, etc.) :
gcloud firestore restore \
  --source-backup=<BACKUP_ID_PRE_MIGRATION> \
  --destination-database='(default)' \
  --collection-ids=companies,analyses,connections,accounting_entries,invoices,journals,ledger_accounts,contacts,bank_accounts,bank_transactions,banking_summaries
```

**Note** : `gcloud firestore restore` ne supporte pas le PITR "à la
seconde près" pour `(default)`. Si nécessaire, utiliser
`gcloud firestore export` à un timestamp PITR + `gcloud firestore import`.

### 3c. Vérifier que les data sont revenues à l'état pré-migration

Console Firebase :
- `users` → 10 documents (inchangés)
- `analyses` → 17 documents SANS le champ `companyId`
- `connections` → 5 documents SANS le champ `companyId`
- `companies` → vide (la collection a été créée par la migration)

Si OK → service revient à l'état pré-Sprint A.

## Étape 4 — Rollback code (< 5 min)

### 4a. Identifier le commit pré-Sprint A

```bash
git log --oneline main | head -5
# Cherche le dernier commit avant le merge feature/multi-tenant-A.
```

### 4b. Revert le merge dans features

Si Romain a déjà mergé `feature/multi-tenant-A` dans `features` :

```bash
git checkout features
git pull origin features
git revert -m 1 <MERGE_COMMIT_SHA>
git push origin features
```

Cela annule le merge sans perdre l'historique des commits Sprint A
(qui restent sur la branche `feature/multi-tenant-A`).

### 4c. Redéployer la preview Vercel ou la prod

Vercel redéploie automatiquement après le push sur la branche cible.
Vérifier le déploiement dans le dashboard Vercel.

## Étape 5 — Communication aux bêta-testeurs (< 5 min)

Message à envoyer (Slack ou email) :

> Bonjour,
>
> Nous avons identifié un problème technique sur Vyzor ce matin et avons
> immédiatement restauré la version précédente de l'application. Vos données
> sont intactes — aucune perte. Vous pouvez continuer à utiliser Vyzor
> normalement.
>
> Nous reprendrons la mise à jour dans les prochains jours après
> investigation. Merci pour votre patience.
>
> [Signature]

## Étape 6 — Post-mortem (jour suivant)

- Documenter dans `docs/incidents/YYYY-MM-DD-multi-tenant-A.md` :
  - Symptôme observé
  - Diagnostic
  - Cause racine
  - Plan de correction
  - Plan de validation avant nouvelle tentative
- Ne pas relancer la migration tant que la cause racine n'est pas corrigée
  ET qu'un test E2E couvre le cas.

## Effets de bord à surveiller post-rollback

| Effet | Risque | Mitigation |
|---|---|---|
| Connections créées APRÈS la migration (entre déploiement et rollback) avec `companyId` orphelin | Donnée présente mais inutilisable car référence une Company restaurée hors PITR | Identifier ces connections via `where("companyId", "!=", null)` côté Admin, les nettoyer manuellement |
| Bêta-testeurs qui ont déjà utilisé le nouveau wizard pendant la fenêtre cassée | UX inconnue (peut-être Company créée à la volée) | Audit manuel des `companies/*` après rollback |
| Logs Vercel saturés d'erreurs `CompanyAccessError` | Bruit dans le monitoring | Nettoyer le dashboard logging |

## Délai estimé total

| Étape | Durée |
|---|---|
| Détection | 5 min |
| Décision | 1 min |
| Rollback Firestore (PITR) | 15 min |
| Rollback code (revert + redéploiement) | 5 min |
| Communication bêta-testeurs | 5 min |
| **Total** | **< 30 min** |

## Validation conjointe

Cette procédure doit être :
- [x] Documentée (ce fichier)
- [ ] Testée à blanc sur une base de test au moins une fois avant l'exécution prod
- [ ] Connue de l'équipe (Antoine + Romain au minimum)
- [ ] Mise à jour après chaque sprint (B/C/D) car le périmètre des collections impactées change
