# Audit Sprint B — Découplage Connection ↔ Company

> Phase 0 du Sprint B (multi-tenant). Réponses Antoine aux 5 questions
> de cadrage. À conserver comme référence pour Romain au moment du merge.
>
> Date : 17 mai 2026.
> Branche : `feature/multi-tenant-B` (créée depuis `feature/multi-tenant-A`).

## 1. Politique de matching Connection → Company existante

**Décision** : matching strict par `(provider, externalCompanyId)` via la nouvelle collection `connection_companies`.

- Si un mapping existe déjà → on rattache.
- Sinon → on crée une nouvelle Company.
- **Pas de matching cross-provider par SIREN** en Sprint B (trop risqué sans dédup confirmée).
- Le matching cross-provider pourra être ajouté en Sprint D si Antoine en a besoin.

## 2. Suppression / déconnexion d'une Connection

**Décision** : pas de cascade destructive.

Quand une Connection est déconnectée :
- ✅ `Connection.status = "revoked"` (déjà géré).
- ✅ Mappings `connection_companies` mis à `isActive = false`.
- ✅ Companies restent `active` → données comptables historiques conservées (analyses, KPIs).
- ✅ Si reconnexion ultérieure : le matching via `connection_companies` permet de **réutiliser** les Companies existantes (pas de doublons).

## 3. Sync Pennylane Firm multi-dossiers

**Décision** : (a) **import auto de tous les dossiers au callback OAuth Firm**.

- Sprint B câble le backend complet : fetch /companies → pour chaque dossier, `findOrCreateCompanyForConnection` + `createMapping`.
- Picker UI déplacé en Sprint C (UX cabinet complète).
- Justification : `PENNYLANE_FIRM_VISIBLE=false` en prod actuellement → l'import auto reste invisible pour les bêta-testeurs dirigeants. Quand on activera Firm en Sprint C avec le mode cabinet, le picker UI sera l'expérience attendue.

## 4. Cible des fetchers Pennylane Firm (clarification critique)

**Pattern confirmé** : **Token-scoped + query-param company selection**, PAS path-scoped.

- ✅ URLs identiques : `/api/external/v2/ledger_entries`, etc.
- ✅ Token Firm unique pour tous les dossiers (pas 1 token par Company).
- ✅ **Injection** : `?company_id=X` dans la query string.
- ⚠️ **Fallback** : si `?company_id=X` retourne 403/404, retomber sur header custom `X-Company-Id: X`.

**Modification fetchers** (Tâche 5) :
- Ajouter `targetCompanyId?: string` à chaque fonction de fetch.
- Tenter `?company_id=X` en premier (pattern REST le plus courant).
- En cas de 403/404, log un warning + retry avec `X-Company-Id` en header.

**Validation à faire** dès accès à la sandbox Firm :
```bash
curl "https://app.pennylane.com/api/external/v2/ledger_entries?company_id=COMPANY_ID" \
  -H "Authorization: Bearer <FIRM_TOKEN>"
```
- 200 → query-param confirmé, on garde ce pattern.
- 403/404 → header `X-Company-Id` confirmé, on utilise le fallback.

## 5. Tests Pennylane sandbox

**Décision** : **mocks** pour Sprint B + intégration sandbox réelle en Sprint C quand Nicolas Auzou aura provisionné plus de dossiers (la sandbox `admin+1@vyzor.fr` n'a actuellement qu'un dossier visible).

- Tests unitaires : `vi.spyOn(fetch)` retourne 3 companies factices → vérifier que les 3 mappings sont créés.
- Tests d'intégration : pas d'appel HTTP réel en Sprint B.

## Récap décisions consolidées

| Q | Décision |
|---|---|
| Q1 — matching | Strict `(provider, externalCompanyId)` via `connection_companies` |
| Q2 — disconnect | Conservation Companies + Connection `revoked` + mappings `isActive=false` |
| Q3 — sync Firm | Import auto au callback, picker UI Sprint C |
| Q4 — fetchers | Token-scoped + query-param `?company_id=X`, fallback header `X-Company-Id` |
| Q5 — tests | Mocks pour Sprint B, sandbox réelle en Sprint C |

## Périmètre Sprint B (rappel)

8 tâches dans l'ordre :
1. Lever `ConnectionAlreadyExistsError(userId, provider)` → `(companyId, provider)` + index.
2. Collection `connection_companies` + store + rules + index.
3. Service `findOrCreateCompanyForConnection`.
4. Sync orchestrator itère sur N Companies pour Firm.
5. Fetchers acceptent `targetCompanyId` (query-param + fallback header).
6. Callback OAuth Firm crée les mappings automatiquement.
7. Tests (mocks, matching, orchestrator, callback).
8. Docs (`architecture/multi-tenant.md` + `rollback-multi-tenant-B.md`).
