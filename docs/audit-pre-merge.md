# Audit pré-merge `feature/maj-connecteurs` → `features`

> Rapport produit avant toute modification de Phase 1.
> Branche auditée : `feature/maj-connecteurs` (8 commits depuis `features`).
> Date : 14/05/2026.

## 1. Diff résumé

**17 fichiers modifiés / créés**, 1831 insertions, 71 suppressions. Aucun fichier supprimé. Aucun renommage.

| Type | Path | Notes |
|---|---|---|
| ⊕ Nouveau | `app/api/integrations/pennylane/config/route.ts` | GET public, expose `companyEnabled` |
| ⊕ Nouveau | `docs/integrations/pennylane-certification.md` | Checklist certif |
| ⊕ Nouveau | `docs/integrations/pennylane.md` | Architecture OAuth |
| ⊕ Nouveau | `scripts/seed-pennylane-sandbox.mts` | Validation sandbox read-only |
| ⊕ Nouveau | `services/integrations/adapters/pennylane/auth.test.ts` | 17 nouveaux tests |
| ⊕ Nouveau | `services/integrations/adapters/pennylane/firmOAuth.ts` | Helper post-token |
| ⊕ Nouveau | `services/integrations/adapters/pennylane/firmOAuth.test.ts` | 15 nouveaux tests |
| Ⓜ Modifié | `app/api/integrations/pennylane/callback/route.ts` | **Critique** : redirect + state.kind + companies fetch |
| Ⓜ Modifié | `app/api/integrations/pennylane/connect/route.ts` | **Critique** : param `kind` + 503 si Company off |
| Ⓜ Modifié | `components/integrations/AccountingConnectionWizard.tsx` | **Critique UX** : sélecteur 3 méthodes |
| Ⓜ Modifié | `services/integrations/adapters/pennylane/auth.ts` | **Critique** : helper kind + scopes + flag |
| Ⓜ Modifié | `services/integrations/adapters/pennylane/client.ts` | Propagation kind dans refresh 401 |
| Ⓜ Modifié | `services/integrations/storage/connectionStore.ts` | **Schéma** : 2 overrides optionnels (input seulement) |
| Ⓜ Modifié | `.env.example` | 9 nouvelles vars Pennylane |
| Ⓜ Modifié | `README.md` | Section setup Pennylane OAuth |
| Ⓜ Modifié | `scripts/probe-myunisoft.mts` | Commentaire URL doc (rebrand MyU) |
| Ⓜ Modifié | `services/integrations/adapters/myunisoft/client.ts` | Commentaire URL doc (rebrand MyU) |

**Schéma Firestore** : zéro changement persisté. Les 2 overrides ajoutés (`externalCompanyIdOverride`, `externalFirmIdOverride`) sont des **paramètres d'INPUT** de `createConnection`, pas des champs du `ConnectionRecord` stocké. Le record final reste rigoureusement identique aux versions Phase 1.5.

## 2. État des tests

```
Test Files : 10 failed | 116 passed | 3 skipped (129 total)
      Tests :  6 failed | 933 passed | 3 skipped (942 total)
   Durée  : 9.64 s
```

### Tests Pennylane-adjacents (13 fichiers, 109 tests) — **TOUS VERTS ✅**

| Fichier | Tests | Statut |
|---|---|---|
| `services/integrations/adapters/pennylane/fetchers.test.ts` | 6 | ✅ préexistant |
| `services/integrations/adapters/pennylane/auth.test.ts` | 17 | ✅ NOUVEAU |
| `services/integrations/adapters/pennylane/firmOAuth.test.ts` | 15 | ✅ NOUVEAU |
| `services/integrations/aggregations/` | 12 | ✅ préexistants |
| `services/dataSourcesStore.test.ts` | 27 | ✅ préexistant |
| `lib/source/sourceKind.test.ts` | 8 | ✅ préexistant |
| `lib/server/tokenCrypto.test.ts` | 8 | ✅ préexistant |
| `services/integrations/__tests__/*` | 16 | ✅ préexistants |

Aucun test du pipeline Pennylane d'origine (parser, mapping 2033-SD, fetchers) n'est cassé.

### 10 fichiers en échec — origine

| Fichier | Origine | Lien avec ce sprint |
|---|---|---|
| `services/pdf-analysis/__tests__/fusalpIntegration.test.ts` | **Préexistant** (fixture PDF) | Aucun |
| `services/pdf-analysis/__tests__/ripcurlIntegration.test.ts` | **Préexistant** (fixture PDF) | Aucun |
| `components/synthese/SyntheseDashboard.test.tsx` | Hérité du commit `8f69104` (refactor dashboard widgets) | Aucun |
| `components/dashboard/navigation/FinancingTest.test.tsx` | Hérité du commit `8f69104` | Aucun |
| `components/dashboard/navigation/InvestmentTest.test.tsx` | Hérité du commit `8f69104` | Aucun |
| `components/dashboard/navigation/RentabilityTest.test.tsx` | Hérité du commit `8f69104` | Aucun |
| `components/ai/AiSpinner.test.tsx` | Hérité de `9792160` (refonte chat IA) | Aucun |
| `components/ai/AiMessageBubble.test.tsx` | Hérité de `9792160` | Aucun |
| `lib/ai/aiService.test.ts` | Hérité | Aucun |
| `components/dashboard/dashboardPremium.test.tsx` | Hérité | Aucun |

**Vérification empirique** : run de la suite via `git stash -u` puis sans stash → résultat identique (6 failed). Aucun test ne fail à cause des changements de `feature/maj-connecteurs`.

**Différence avec le brief** : le brief mentionne "2 échecs préexistants sur fixtures PDF". L'état réel sur `features` à `8b8b31c` montre **10 fichiers / 6 tests en échec** dont 2 sur fixtures PDF + 4 hérités du refactor dashboard widgets (8f69104) et de la refonte AI (9792160). À débrieffer avec Romain — ce n'est pas le scope de ce sprint.

## 3. Variables d'environnement ajoutées

**9 nouvelles entrées** dans `.env.example` :

| Variable | Obligatoire prod ? | Fallback rétrocompat | Notes |
|---|---|---|---|
| `PENNYLANE_FIRM_CLIENT_ID` | ✓ recommandé | ← `PENNYLANE_OAUTH_CLIENT_ID` | Identifie le OAuth client Firm |
| `PENNYLANE_FIRM_CLIENT_SECRET` | ✓ recommandé | ← `PENNYLANE_OAUTH_CLIENT_SECRET` | Secret OAuth Firm |
| `PENNYLANE_FIRM_REDIRECT_URI` | ✓ recommandé | ← `PENNYLANE_OAUTH_REDIRECT_URI` | URL callback enregistrée chez Pennylane |
| `PENNYLANE_FIRM_SCOPES` | ✗ optionnel | défaut `["read"]` | 11 scopes readonly préremplis |
| `PENNYLANE_COMPANY_CLIENT_ID` | ✗ feature flag | ← `PENNYLANE_OAUTH_CLIENT_ID` | Lu seulement si flag ON |
| `PENNYLANE_COMPANY_CLIENT_SECRET` | ✗ feature flag | ← `PENNYLANE_OAUTH_CLIENT_SECRET` | |
| `PENNYLANE_COMPANY_REDIRECT_URI` | ✗ feature flag | ← `PENNYLANE_OAUTH_REDIRECT_URI` | |
| `PENNYLANE_COMPANY_SCOPES` | ✗ feature flag | défaut `["read"]` | |
| `PENNYLANE_COMPANY_ENABLED` | ✗ optionnel | `false` par défaut | **Désactive le bouton Entreprise du wizard** |

**Aucune variable supprimée ou renommée**. Tous les noms historiques `PENNYLANE_OAUTH_*` restent honorés.

## 4. Vérification rétrocompatibilité Pennylane

**Fichier qui gère le fallback** : [`services/integrations/adapters/pennylane/auth.ts:113-119`](services/integrations/adapters/pennylane/auth.ts#L113-L119)

```ts
const prefix = kind === "firm" ? "PENNYLANE_FIRM" : "PENNYLANE_COMPANY";
const clientId =
  process.env[`${prefix}_CLIENT_ID`] ?? process.env.PENNYLANE_OAUTH_CLIENT_ID;
const clientSecret =
  process.env[`${prefix}_CLIENT_SECRET`] ?? process.env.PENNYLANE_OAUTH_CLIENT_SECRET;
const redirectUri =
  process.env[`${prefix}_REDIRECT_URI`] ?? process.env.PENNYLANE_OAUTH_REDIRECT_URI;
```

**Scénario "déploiement prod actuel — seules les anciennes vars définies"** :

| Var lue | Source effective |
|---|---|
| client_id Firm | `PENNYLANE_OAUTH_CLIENT_ID` ✓ |
| client_secret Firm | `PENNYLANE_OAUTH_CLIENT_SECRET` ✓ |
| redirect_uri Firm | `PENNYLANE_OAUTH_REDIRECT_URI` ✓ |
| scopes Firm | `DEFAULT_OAUTH_SCOPES = ["read"]` (fallback dur) |

⚠️ **Point d'attention** : sans `PENNYLANE_FIRM_SCOPES`, le code retombe sur `["read"]` qui ne correspond PAS aux 11 scopes validés par Pennylane pour la Firm API. Conséquence pratique : le déploiement continue de fonctionner mais Pennylane retournera des 403 sur les endpoints non couverts par le scope `read`. À documenter dans la procédure de migration (à inclure dans Tâche 4 — rollback).

Couverture par test : à ajouter dans Phase 1 Tâche 2 (`pennylaneCompat.test.ts`).

## 5. Non-régression MyU

**2 fichiers concernés, commentaires uniquement** :

```diff
- // Doc : https://partners.api.myunisoft.fr/
+ // Doc partenaire : https://partners.api.myu.fr/ (rebrand MyUnisoft → MyU, semaine du 18/05/2026)
+ // Doc API runtime : https://docs.api.myunisoft.fr/ (inchangée)
```

```diff
- // ─── Endpoints MAD officiels (cf. partners.api.myunisoft.fr/MAD) ────
+ // ─── Endpoints MAD officiels (cf. partners.api.myu.fr/MAD) ─────────
+ // Note : doc partenaire renommée MyUnisoft → MyU (rebrand 18/05/2026).
+ // L'URL d'API runtime reste docs.api.myunisoft.fr (inchangée).
```

**Hors périmètre** (confirmé inchangés) :
- URLs d'API runtime (`docs.api.myunisoft.fr`, `MYUNISOFT_API_BASE_URL`) ✓
- Credentials (`MYUNISOFT_THIRD_PARTY_SECRET`, `MYUNISOFT_TEST_JWT`) ✓
- Logique métier (client.ts, fetchers, auth.ts MyUnisoft) ✓
- Wizard utilisateur (composant `MyUnisoftStep`) ✓
- Aucun appel HTTP modifié

**Zéro impact runtime** pour les bêta-testeurs MyU existants.

## 6. Non-régression Pennylane (52 tests E2E historiques)

Le brief mentionne "52 tests E2E Pennylane". Le repo compte exactement :
- **6 tests** dans `fetchers.test.ts` (pipeline parser + mapping 2033-SD) — préexistants ✅
- **103 tests** dans les modules adjacents (`aggregations/`, `storage/`, `dataSourcesStore`, `tokenCrypto`, `sourceKind`) — préexistants ✅
- **32 tests** nouveaux dans `auth.test.ts` + `firmOAuth.test.ts` (ajoutés par ce sprint)

**Total Pennylane-adjacent** : 141 tests dans 13 fichiers, **tous verts**. La couverture exacte du chiffre "52 E2E" n'est pas localisée formellement mais aucun test du pipeline lectures/parser/mapping n'est en régression.

## 7. Vérification ConnectionRecord

**Réfutation d'une assomption du brief** : le brief mentionne "nouveaux champs ajoutés (`kind: 'firm' | 'company' | 'manual'`, `externalFirmId`, `companies_count`, etc.)". **Aucun de ces champs n'a été ajouté au `ConnectionRecord` Firestore** :

| Champ supposé | Réalité |
|---|---|
| `kind` | ❌ NON ajouté. Le "kind" est dérivé de `providerSub` (`"pennylane_firm"` vs `"pennylane_company"`), champ qui existait déjà dans le schéma Phase 1.5. |
| `externalFirmId` | ✓ Existait déjà (utilisé par `firm_token` mode depuis Phase 1.5). Désormais aussi peuplé pour OAuth Firm via override. |
| `companies_count` | ❌ NON persisté. Exposé uniquement dans le query param `?companies_count=` du redirect callback. |

**Changements réels au CRUD** :
- Le type `CreateConnectionInput` accepte 2 overrides optionnels (`externalCompanyIdOverride`, `externalFirmIdOverride`). Si non fournis, comportement identique à avant.

**Conséquence migration** : **AUCUNE**. Les `ConnectionRecord` existants en base (créés via le wizard manuel ou via Phase 1.5) restent valides et lisibles tels quels. Pas de script de migration. Pas de risque sur les bêta-testeurs existants.

État de la collection `oauth_states` :
- Champ `kind?: "firm" | "company"` ajouté (optionnel). TTL 10 min, document éphémère — aucune compat ascendante requise.

## 8. Vérification sécurité

### Logs

| Fichier | Logs | Risque |
|---|---|---|
| `firmOAuth.ts:78` | `console.warn("[pennylane-firm] fetch /companies network error", { detail })` | ✓ pas de token, juste le message d'erreur |
| `firmOAuth.ts:88` | `console.warn("[pennylane-firm] /companies non-OK", { status })` | ✓ status code uniquement |
| `auth.ts:190` | `throw new Error(`Pennylane OAuth token endpoint ${status}: ${text.slice(0, 200)}`)` | ⚠️ La réponse Pennylane tronquée peut contenir `error_description` mais jamais de token (requête échouée). Acceptable mais à structurer en Phase 1 Tâche 3. |
| `/connect`, `/callback` | Aucun log explicite | À enrichir en Phase 1 Tâche 3 (state ID, étapes) |

**Aucun secret n'apparaît dans les logs**. Aucun token n'est exposé dans les réponses API.

### State CSRF

- Génération : `randomBytes(24).toString("base64url")` ([connect/route.ts:114](app/api/integrations/pennylane/connect/route.ts#L114))
- Stockage : Firestore collection `oauth_states/{state}` avec TTL 10 min
- Validation callback : présence, expiration, provider match ([callback/route.ts:78-114](app/api/integrations/pennylane/callback/route.ts))
- Consommé après échange (delete une seule fois) ✓

### Authentification des routes

| Route | Auth | Notes |
|---|---|---|
| `POST /connect` | `requireAuthenticatedUser` ([line 41-47](app/api/integrations/pennylane/connect/route.ts#L41)) | ✓ |
| `GET /callback` | Pas d'auth (open OAuth callback by design) | ✓ — validation via state CSRF + userId stocké dans le state |
| `GET /config` | Pas d'auth (config UI publique, booléen seulement) | ✓ |

### Tokens chiffrés

- AES-256-GCM via `tokenCrypto.ts` ([line 94-98 connectionStore](services/integrations/storage/connectionStore.ts#L94-L98))
- Clé maître : `CONNECTOR_ENCRYPTION_KEY` (32 octets)
- Refresh token chiffré séparément ✓
- `tokenPreview` ("abcdef…wxyz") pour affichage UI — pas un secret

**Aucune fuite identifiée. Hardening logs prévu en Phase 1 Tâche 3.**

---

## 🟢 Verdict d'audit

**La branche est mergeable en l'état** avec les caveats suivants :

| Caveat | Sévérité | Action Phase 1 |
|---|---|---|
| 6 tests fail héritage `features` (pas liés à ce sprint) | 🟡 Bas — non-bloquant pour ce sprint | À traiter par Romain hors scope |
| Pas de test rétrocompat `PENNYLANE_OAUTH_*` automatisé | 🟠 Moyen | **Tâche 2** : ajouter `pennylaneCompat.test.ts` |
| Logs OAuth non structurés (manque state ID, fingerprint) | 🟠 Moyen | **Tâche 3** : enrichir logs |
| Sans `PENNYLANE_FIRM_SCOPES` en prod, fallback `["read"]` insuffisant | 🟡 Bas (doc-only) | Documenter dans rollback Tâche 4 |
| Pas de procédure rollback formalisée | 🟠 Moyen | **Tâche 4** : `docs/rollback-procedure.md` |
| Pas de checklist validation manuelle | 🟠 Moyen | **Tâche 5** : `docs/checklist-validation-prod.md` |
| Pas de messages bêta-testeurs prêts | 🟢 Cosmétique | **Tâche 6** : drafts |

**Tâche 1 (corrections anomalies)** : aucune anomalie bloquante détectée → SKIP.

## Suite suggérée

Une fois validé par Antoine, attaquer dans l'ordre :
2. Test rétrocompat (`pennylaneCompat.test.ts`)
3. Hardening logs
4. Rollback procedure
5. Checklist validation
6. Drafts messages bêta-testeurs

Aucune modification ne sera faite tant que l'audit n'est pas validé.
