# Architecture multi-tenant — Vyzor

> Le modèle Vyzor évolue d'un schéma "1 user = 1 entreprise" implicite vers
> un schéma multi-tenant explicite, où l'entité centrale est la **Company**.
> Ce document trace les sprints A → D et le pattern à respecter pour toute
> nouvelle route API.

## Modèle cible

```
┌──────────────────┐
│   User           │   1 utilisateur Firebase (auth)
│   - uid          │   = 1 humain identifié
│   - email        │
│   - profil       │
└────────┬─────────┘
         │
         │ owns           (Sprint A : 1-1 ; Sprint B+ : 1-N)
         ▼
┌──────────────────┐
│   Company        │   1 entreprise dont on suit les KPIs
│   - id           │
│   - ownerUserId  │   ← propriétaire dirigeant
│   - firmId?      │   ← Sprint C : rattachement cabinet
│   - name, siren  │
│   - source       │   provenance (manual / pennylane / myu / ...)
│   - status       │
└────────┬─────────┘
         │
         │ porte (companyId)
         ▼
┌──────────────────────────────────────────────────────────────┐
│   Données comptables (collections Firestore existantes)      │
│   - analyses/{analysisId}        + companyId                 │
│   - connections/{connectionId}   + companyId                 │
│   - accounting_entries/{id}      + companyId                 │
│   - invoices/{id}                + companyId                 │
│   - journals/{id}                + companyId                 │
│   - ledger_accounts/{id}         + companyId                 │
│   - contacts/{id}                + companyId                 │
│   - bank_accounts/{id}           + companyId                 │
│   - bank_transactions/{id}       + companyId                 │
│   - banking_summaries/{userId}   + companyId (doc ID inchangé)│
└──────────────────────────────────────────────────────────────┘
```

**Principe** : aucune donnée comptable ne vit DANS le `CompanyRecord`. La
Company est un nœud de regroupement. Les analyses / connections / entités
existantes restent dans leurs collections top-level et portent un champ
`companyId` qui pointe vers `companies/{id}`.

## Sprints

| Sprint | Livré | Statut |
|---|---|---|
| **A** | Modèle Company + companyStore + migration + middleware + 3 routes critiques en rétrocompat | ✅ Branche `feature/multi-tenant-A` |
| **B** | Découplage Connection ↔ Company : contrainte d'unicité passée à `(companyId, provider)`, collection `connection_companies` (jointure N:N), `findOrCreateCompanyForConnection`, sync orchestrator multi-dossiers `runSyncForFirmConnection`, fetchers Pennylane acceptent `targetCompanyId` (query `?company_id=X` + fallback header `X-Company-Id`) | ✅ Branche `feature/multi-tenant-B` |
| **C** | Mode cabinet UX : firmId + firm_members + UI cabinet (1 user cabinet → liste de Companies dossiers clients). Pennylane Firm OAuth (commit 88e3e4b) réactivé conditionnellement pour les users cabinet | ⏳ |
| **D** | Polish + observabilité : migration de toutes les routes vers companyId explicite, suppression des logs `[resolveCompanyContext] fallback`, dépréciation des params `userId` | ⏳ |

## Sprint B — découplage Connection ↔ Company

### Collection `connection_companies/{id}`

Table de jointure N:N entre Connections et Companies.

```ts
{
  id: string;
  userId: string;          // owner (= owner de la Connection)
  connectionId: string;    // FK → connections
  companyId: string;       // FK → companies
  externalCompanyId: string; // ID côté provider (Pennylane company_id)
  externalCompanyName?: string;
  isActive: boolean;       // toggle au disconnect/reconnect
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Scénarios supportés

```
1 Connection Firm Pennylane    →    N Companies (1 par dossier cabinet)
                                    ┌─→ Company A (mapping ext_a active)
   Connection Firm OAuth ────────── ├─→ Company B (mapping ext_b active)
                                    └─→ Company C (mapping ext_c active)

N Connections                  →    1 Company (Pennylane + Bridge même entreprise)
   Connection Pennylane ────┐
                            ├─→ Company Acme (2 mappings)
   Connection Bridge ───────┘
```

### Pattern de matching (`findOrCreateCompanyForConnection`)

```ts
const { company, isNew } = await findOrCreateCompanyForConnection({
  userId, connectionId,
  source: "pennylane_oauth",
  externalCompanyId: "pennylane-dossier-42",
  companyMetadata: { name: "Acme SAS", siren: "123456789" },
});
```

Algorithme :
1. `findMappingByExternalRef(connectionId, externalCompanyId)`
2. Mapping trouvé + Company existe → `{ company, isNew: false }`.
3. Mapping trouvé + Company supprimée (cas dégénéré) → log warning + crée nouvelle.
4. Pas de mapping → `createCompany` + retourne `{ company, isNew: true }`.

Le helper NE crée PAS le mapping — c'est le caller qui s'en charge via `createMapping` ou via le helper `createMappingsForFirmCallback` (batch).

### Sync multi-dossiers (`runSyncForFirmConnection`)

```ts
const report = await runSyncForFirmConnection({
  userId,
  connectionId: firmConnection.id,
});
// → { totalCompanies: 3, succeeded: 3, failed: 0, perCompany: [...] }
```

Architecture :
- Lit les mappings actifs via `listMappingsForConnection(connectionId)`.
- Lance N `runSync` en parallèle (Promise.allSettled) avec `targetCompanyId: mapping.externalCompanyId`.
- Un échec sur 1 dossier n'interrompt pas les autres.
- Le ctx `AdapterSyncContext` propage `targetCompanyId` aux fetchers Pennylane.

### Pattern fetchers (`?company_id=X` + fallback `X-Company-Id`)

Pennylane Firm API : token unique + ciblage par query-param. Cf. `audit-sprint-B.md` Q4.

```ts
// client.ts injecte automatiquement :
url.searchParams.set("company_id", targetCompanyId);
// Si réponse 403/404 → retry UNE fois avec header :
headers["X-Company-Id"] = targetCompanyId;
```

À valider en sandbox réelle dès que Nicolas Auzou aura provisionné plus de dossiers.

### Callback OAuth Firm (`createMappingsForFirmCallback`)

Helper réutilisable par le callback OAuth Firm (qui vit actuellement sur `feature/maj-connecteurs`) :

```ts
const results = await createMappingsForFirmCallback(
  userId,
  connectionId,
  "pennylane_oauth",
  await fetchFirmCompaniesWithToken(accessToken)
);
// → [{ mapping, company, outcome: "created"|"reused"|"reactivated" }, ...]
```

Idempotent : relance sans risque de doublon, gère les 3 cas (nouveau, déjà actif, réactivation post-disconnect).

### Conséquence sur le disconnect

Cf. `audit-sprint-B.md` Q2 — pas de cascade destructive.

```ts
// Disconnect d'une Connection :
await updateConnectionStatus(connectionId, "revoked");
await deactivateMappingsForConnection(connectionId); // batch isActive=false
// Companies restent active → analyses historiques accessibles.
// Si reconnexion ultérieure → mappings réactivés (pas de nouveaux doublons).
```

## Migration des users existants (Sprint A)

Script : `scripts/migrate-to-multi-tenant.mts`.

Pour chaque user :
1. **Skip** si une Company `active` existe déjà pour cet `ownerUserId` (idempotence).
2. **Sinon** :
   - Crée `companies/{newId}` avec :
     - `ownerUserId = user.id`
     - `name = user.companyName?.trim() || "Mon entreprise"`
     - `siren = user.siren?.trim() || undefined`
     - `source` déduit de la connection active la plus récente (sinon `"manual"`)
     - `createdAt = user.createdAt ?? Timestamp.now()` (préserve l'historique)
3. **Mappe** `userId → companyId` en mémoire.

Pour chaque collection (analyses, connections, accounting_entries, …) :
- Pour chaque doc sans `companyId` ET avec `userId` valide :
  - Résoudre `companyId` via la map.
  - `update({ companyId })`.

Pour `banking_summaries/{userId}` :
- Doc ID inchangé (= userId).
- Juste un champ `companyId` ajouté en interne.

**Garanties** :
- ✅ Idempotent (re-exécutable sans doublons).
- ✅ Dry-run (`--dry-run`) qui log sans écrire.
- ✅ PITR Firestore activé comme filet de sécurité (rollback < 7 jours).
- ✅ Logging détaillé : compteurs par étape + erreurs explicites.

## Pattern `requireCompanyAccess()`

Middleware d'autorisation à utiliser **en complément** de
`requireAuthenticatedUser()` :

```ts
// Pattern Sprint A — companyId optionnel (rétrocompat) :
const userId = await requireAuthenticatedUser(request);
const companyIdHint = typeof body.companyId === "string" ? body.companyId.trim() : null;
try {
  const { company, mode } = await resolveCompanyContext(userId, companyIdHint);
  // mode === "explicit" : front a passé companyId, validation faite
  // mode === "fallback" : rétrocompat, on a pris la 1re Company du user
  // → continuer la logique métier en utilisant company.id
} catch (err) {
  if (err instanceof CompanyAccessError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  throw err;
}
```

```ts
// Pattern Sprint B+ — companyId obligatoire (strict) :
const userId = await requireAuthenticatedUser(request);
const companyId = typeof body.companyId === "string" ? body.companyId : "";
if (!companyId) {
  return NextResponse.json({ error: "companyId requis." }, { status: 400 });
}
const { company } = await requireCompanyAccess(userId, companyId);
// → continuer
```

## Comment ajouter une nouvelle route API qui respecte l'isolation

**Checklist obligatoire** :

- [ ] La route appelle `requireAuthenticatedUser()` en première instruction (auth Firebase).
- [ ] La route accepte un `companyId` en body/query (optionnel en Sprint A, obligatoire en Sprint B+).
- [ ] La route appelle `resolveCompanyContext()` (Sprint A) ou `requireCompanyAccess()` (Sprint B+) avant tout accès aux données.
- [ ] La route filtre TOUS les reads Firestore par `companyId` (jamais par `userId` seul une fois le Sprint B livré).
- [ ] La route ne fait JAMAIS confiance à un `companyId` reçu sans validation par `requireCompanyAccess()`.
- [ ] La route loggue les erreurs `CompanyAccessError` mais ne les laisse pas remonter en 500 silencieux.
- [ ] Tests : couvrir `mode: "explicit"` valide, `mode: "explicit"` 403 (mauvais owner), `mode: "fallback"` rétrocompat.

## Routes adaptées au Sprint A (rétrocompat)

| Route | Statut | Mode |
|---|---|---|
| `POST /api/sync/trigger` | ✅ | `resolveCompanyContext(uid, body.companyId)` |
| `POST /api/reports/financial` | ✅ | idem |
| `POST /api/ai/ask` | ✅ | idem |
| Toutes les autres routes | ⏳ Sprint B+ | encore en pattern `userId` pur |

## Firestore rules

```
match /companies/{companyId} {
  allow read: if request.auth != null
    && resource.data.ownerUserId == request.auth.uid;
  // ...
}
```

Sprint A : seul `ownerUserId` peut lire/écrire.
Sprint C : étendra avec un OR sur les firm_members (`firmId in getUserFirms()`).

## Index Firestore

```json
{
  "collectionGroup": "companies",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "ownerUserId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "ASCENDING" }
  ]
}
```

Pour la query `listCompaniesForUser(userId)` qui filtre par owner + status + tri.
