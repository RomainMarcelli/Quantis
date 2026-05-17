# Rollback procedure — Sprint B multi-tenant

> Procédure de restauration en cas de problème détecté après le merge /
> déploiement Sprint B (découplage Connection ↔ Company).
> Délai cible total : **< 30 min**.

## Pré-requis

- **PITR Firestore actif** (rétention 7 jours).
- Tag du commit pré-Sprint B : créer `multi-tenant-B-deployed-<timestamp>`
  juste après le merge dans `features` pour faciliter le rollback git.

## Étape 1 — Détection (< 5 min)

Symptômes qui doivent déclencher le rollback :

| Symptôme | Origine probable |
|---|---|
| Erreur `ConnectionAlreadyExistsError` inattendue sur des reconnexions | Mauvaise propagation `companyId` dans createConnection |
| Sync Pennylane Firm retourne 0 écritures alors qu'on s'attend à N | Fetchers oublient `?company_id=` (régression `targetCompanyId`) |
| Pennylane 403/404 systématiques sur les routes data | Fallback header `X-Company-Id` ne fonctionne pas |
| Collection `connection_companies` se remplit de doublons | Idempotence `findMappingByExternalRef` cassée |
| Disconnect d'une Connection détruit les Companies | Cascade destructive — bug grave |
| Sync token manuel (Company token) cassé | Régression non-Firm — `targetCompanyId` injecté à tort |

## Étape 2 — Rollback Firestore (PITR)

### Collections impactées en Sprint B

| Collection | Modification | Action rollback |
|---|---|---|
| `connection_companies` | Créée par Sprint B | Supprimer entièrement (collection vide pré-Sprint B) |
| `connections` | Champ `companyId` peuplé par migration Sprint A (déjà présent), pas touché par Sprint B | Aucune action |
| `companies` | Inchangée en Sprint B | Aucune action |

### Commandes

```bash
# 1. Identifier le timestamp pré-Sprint B (avant le merge dans features).
gcloud firestore operations list --filter="metadata.type=BACKUP"

# 2. Restauration sélective de connection_companies via export → import.
# Note : Sprint B ne touche QUE connection_companies en écriture, donc
# une restauration totale n'est pas nécessaire — on peut juste vider la
# collection nouvellement créée.
gcloud firestore export gs://<BUCKET>/rollback-b-<timestamp> \
  --collection-ids=connection_companies

# 3. Si on veut vraiment revenir à pré-Sprint B, supprimer manuellement
# tous les docs connection_companies via la console Firebase ou un
# script ad-hoc (volume très faible).
```

## Étape 3 — Rollback code

```bash
git checkout features
git pull origin features
git revert -m 1 <SHA_DU_MERGE_SPRINT_B>
git push origin features
```

Cela annule le merge sans perdre l'historique de `feature/multi-tenant-B`.
Vercel redéploie automatiquement.

## Étape 4 — Effets de bord à surveiller post-rollback

| Effet | Risque | Mitigation |
|---|---|---|
| `connections.companyId` reste peuplé (champ ajouté par migration Sprint A, pas Sprint B) | Aucun — Sprint A reste actif | Rien à faire |
| Mappings `connection_companies` orphelins si certains restent en base | Données inutilisées en lecture, pas de comportement défectueux | Cleanup via console ou script à blanc |
| Connections créées post-déploiement avec `companyId` correct | Comportement Sprint A préservé | Rien à faire |
| Sync Firm utilisant `targetCompanyId` perdu après rollback | Les Connections Firm ne synceront plus que sur le dossier par défaut (comportement pré-Sprint B) | Documenter aux bêta-testeurs Firm qu'ils sont temporairement réduits |

## Étape 5 — Communication aux bêta-testeurs

Message à envoyer (Slack ou email) :

> Bonjour,
>
> Nous avons identifié un problème technique sur Vyzor et avons restauré
> la version précédente de l'application. Vos données comptables sont
> intactes — aucune perte. Vos connections existantes continuent à
> fonctionner normalement.
>
> Nous reprendrons la mise à jour multi-dossiers dans les prochains jours
> après investigation.
>
> [Signature]

## Étape 6 — Post-mortem

Documenter dans `docs/incidents/YYYY-MM-DD-multi-tenant-B.md` :
- Symptôme observé.
- Diagnostic.
- Cause racine.
- Plan de correction.
- Test E2E qui couvrirait le cas (à ajouter avant nouvelle tentative).

## Validation post-rollback

| Vérif | Méthode |
|---|---|
| `connection_companies` collection vide ou inerte | Console Firebase |
| Routes `/api/sync/trigger` répondent 200 sur les Connections Sprint A | Test manuel preview |
| Pas d'erreur `[resolveCompanyContext]` inhabituelle dans Vercel logs | Dashboard logs |
| 47 tests multi-tenant verts | `npm run test:unit -- services/companies/ services/auth/` |

## Délai estimé total

| Étape | Durée |
|---|---|
| Détection | 5 min |
| Décision | 1 min |
| Rollback Firestore | 10 min (volume très faible) |
| Rollback code (revert + redéploiement) | 5 min |
| Communication bêta-testeurs | 5 min |
| **Total** | **< 30 min** |
