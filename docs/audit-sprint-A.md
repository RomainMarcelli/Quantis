# Audit Sprint A — Fondations Multi-Tenant

> Phase 0 du sprint multi-tenant : réponses Antoine aux questions de cadrage
> avant tout code. À conserver comme référence pour Romain au moment du merge
> et pour les sprints B/C/D suivants.
>
> Date : 16 mai 2026.
> Branche : `feature/multi-tenant-A` (créée depuis `main`).

## 1. Backup Firestore

**Point-in-Time Recovery (PITR) activé** sur Firestore le **16/05/2026 18:32 UTC+2**, avec rétention **7 jours**.

- Toute modification post-activation est réversible.
- Pas de snapshot manuel additionnel requis : le PITR couvre intégralement le besoin de rollback.
- Localisation Firestore : `eur3` (région EU, RGPD-compatible).

**Garantie de rollback** : si la migration introduit un problème dans les 7 jours, Antoine restaure via PITR (commande `gcloud firestore restore --source-backup ... --restore-collection-ids ...`).

## 2. Volumes en prod (comptés manuellement console Firebase)

| Collection | Documents |
|---|---|
| `users` | 10 |
| `analyses` | 17 |
| `connections` | 5 (toutes `active`, provider `pennylane`, `authMode: "company_token"`) |

Volume très faible — migration in-place sans batch, sans pagination, sans throttling.

## 3. Stratégie de migration

**In-place avec PITR comme filet de sécurité**.

- Script idempotent obligatoire (relance sans doublons).
- Dry-run sur base de test obligatoire avant exécution prod.
- Antoine déclenche manuellement l'exécution prod après validation du dry-run.

## 4. Naming du module

Convention validée : `services/companies/` (en miroir de `services/integrations/`, `services/sync/`, etc.).

## 5. Backward compat des routes API

Validée. Stratégie de transition :

- Les routes existantes acceptent toujours `userId`.
- `companyId` optionnel pendant la transition Sprint A.
- Si seul `userId` fourni → fallback automatique sur la première Company du user (acceptable car en Sprint A chaque user a exactement 1 Company après migration).
- Migration progressive des routes au fil des sprints B/C/D.
- Aucun breaking change visible côté front en Sprint A.

## 6. Routes prioritaires à adapter (Tâche 5)

Confirmées :
1. `/api/analyses/*` — listing + lecture des analyses
2. `/api/integrations/*/sync` — déclenche les syncs
3. `/api/reports/*` — génération PDF/Word

## 7. Champs disponibles pour la migration

### Sur `User` (collection `users/{uid}`)

| Champ | Type | Destination Company |
|---|---|---|
| `companyName` | string | → `Company.name` (fallback `"Mon entreprise"` si vide) |
| `siren` | string | → `Company.siren` (optionnel) |
| `companySize` | enum | **reste sur User** (taille = profil utilisateur, pas attribut entreprise dans ce modèle) |
| `sector` | string | **reste sur User** (idem) |
| `firstName`, `lastName`, `email`, `themePreference`, etc. | divers | **restent sur User** |

### Sur `ConnectionRecord` (collection `connections/{id}`)

Champs déjà présents qui anticipent le multi-tenant :

| Champ | État actuel | Sprint A | Sprints B/C |
|---|---|---|---|
| `externalCompanyId` | `""` (vide) | — | Sprint B : stocke l'ID Pennylane Company |
| `externalFirmId` | `null` | — | Sprint B/C : OAuth Firm cabinet |
| `userId` | présent | restera, + ajout `companyId` | Sprint B : devient déduplicable par `(companyId, provider)` |

## 8. Mapping migration recommandé

### Pour chaque User → créer une Company

```ts
{
  id: <UUID Firestore>,
  ownerUserId: User.id,
  name: User.companyName?.trim() || "Mon entreprise",
  siren: User.siren?.trim() || undefined,
  source: <déduit de Connection active du user, sinon "manual">,
  status: "active",
  createdAt: User.createdAt ?? Timestamp.now(),
  updatedAt: Timestamp.now(),
  firmId: undefined,  // pas de cabinet en Sprint A
  externalCompanyId: <Connection.externalCompanyId si non vide>,
}
```

Déduction du `source` :
- Si Connection active `provider === "pennylane"` → `source = "pennylane_manual"` (toutes les 5 connections actuelles sont en `authMode: "company_token"`).
- Si Connection active `provider === "myunisoft"` → `source = "myu"`.
- Si Connection active `provider === "bridge"` → `source = "bridge"`.
- Sinon → `source = "manual"`.

Cas non couvert en Sprint A (rare) : user avec **plusieurs connections actives** → on prend la plus récente par `lastSyncAt`.

### Mise à jour des entités existantes

Ajouter un champ `companyId` à :
- `analyses/{analysisId}` (top-level)
- `connections/{connectionId}` (top-level)
- `accounting_entries/{id}` (top-level)
- `invoices/{id}` (top-level)
- `journals/{id}` (top-level)
- `ledger_accounts/{id}` (top-level)
- `contacts/{id}` (top-level)
- `banking_summaries/{userId}` — cas spécial, doc ID = userId

**Pour `banking_summaries`** : le doc ID est déjà le `userId`. On ajoute simplement un champ `companyId` à l'intérieur (pas de renommage du doc ID — risque de casser le code existant qui lit par userId).

## 9. Points d'attention identifiés (non-bloquants)

1. **Aucun middleware d'isolation automatique côté API** — Sprint A introduit `requireCompanyAccess()` mais ne force pas son usage. Le test est manuel à chaque nouvelle route.
2. **Contrainte `ConnectionAlreadyExistsError(userId, provider)`** — toujours présente en Sprint A, sera levée au Sprint B (devient `(companyId, provider)`).
3. **Le `connectionStore.createConnection` ne connaît pas encore `companyId`** — Sprint A ajoute le champ via le script de migration UNIQUEMENT pour les connections existantes. Les nouvelles connections créées en Sprint A continueront sans `companyId` (Sprint B câblera la création).

## 10. Validation conjointe attendue

Antoine valide ensemble :
- ✅ Le rapport Phase 0 (ce document).
- ⏳ Le schéma Firestore et les rules (commit 3).
- ⏳ Le script de migration en dry-run sur une base de test (commit 5).
- ⏳ La rétrocompat des routes API (test manuel sur preview Vercel — commit 6).
- ⏳ La doc architecture (commit 8).
- ⏳ Le plan de rollback (commit 8).

Si tout est validé, **Antoine déclenche la migration prod manuellement** (pas Claude Code). Puis Romain merge `feature/multi-tenant-A` dans `features`.
