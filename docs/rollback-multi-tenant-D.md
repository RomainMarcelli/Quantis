# Rollback — `feature/multi-tenant` (Sprint D)

> Branche consolidée des 4 sprints multi-tenant. Sprint D ne déploie pas
> automatiquement — c'est Antoine qui donne le feu vert à Romain pour
> le merge `feature/multi-tenant` → `features`.

## Si régression critique AVANT merge dans `features`

1. `features` et `main` sont intactes — rien à faire côté Git.
2. Identifier le sprint fautif via `git log --oneline feature/multi-tenant`.
3. Reverter sur `feature/multi-tenant` :
   ```bash
   git revert <merge-commit-hash> --mainline 1
   ```
4. Relancer `npm run test:unit` pour confirmer la stabilité.

## Si régression APRÈS merge dans `features`

1. `git revert <merge-commit-hash> --mainline 1` sur `features`.
2. `npm run test:unit && npm run build`.
3. Déployer `features` en preview Vercel pour confirmer.
4. Alerter Romain avant tout push sur `main`.

## Feature flag d'urgence

Pour masquer le mode cabinet **sans rollback Git** (Vercel env vars) :

```env
NEXT_PUBLIC_FIRM_MODE_ENABLED=false
```

Effet attendu (à brancher Sprint D+1 si besoin) :
- OnboardingSelector affiche uniquement le flow `company_owner` (carte cabinet masquée).
- Routes `/cabinet/*` répondent 404 ou redirect `/dashboard`.
- Aucune perte de données — les Firms, mappings, accountType restent en base et seront réactivés au flip suivant.

⚠️ **Le flag n'est pas câblé en Sprint D livré** — c'est un placeholder pour un futur incident. Le câblage prend ~30 min : ajouter une condition `if (process.env.NEXT_PUBLIC_FIRM_MODE_ENABLED === "false") return null` dans `OnboardingSelector` et un middleware Next.js qui redirect `/cabinet/*` vers `/dashboard`.

## Effets de bord post-rollback

| Effet | Risque | Mitigation |
|---|---|---|
| `users.accountType` reste peuplé sur les comptes ayant testé le mode cabinet | Aucun — Sprint A continue d'ignorer ce champ | Cleanup batch post-stabilisation |
| Collections `firms`, `connection_companies` orphelines | Données lisibles uniquement par leurs propriétaires — pas de fuite | Suppression batch si pollution gênante |
| Token OAuth Pennylane Firm en base avec `providerSub: "pennylane_firm"` | Token chiffré inutilisable sans le code Sprint C — pas de risque sécu | Marquer `status: "revoked"` via script ad-hoc |

## Validation post-rollback

| Vérif | Méthode |
|---|---|
| Routes `/cabinet/*` → 404 / redirect | Browser direct |
| Connexion `company_owner` historique OK | Login + cockpit |
| Sync Pennylane Firm token manuel OK | Test sandbox |
| `npm run test:unit` → 64 tests Sprint A+B+C verts (sans les 15 E2E Sprint D) | CI |

## Délai estimé total

| Étape | Durée |
|---|---|
| Détection | 5 min |
| Décision | 1 min |
| Revert + redéploiement Vercel | 5 min |
| Communication bêta-testeurs cabinet | 5 min |
| Validation rollback | 10 min |
| **Total** | **< 30 min** |
