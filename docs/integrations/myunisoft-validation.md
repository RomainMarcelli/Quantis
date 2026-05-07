# MyUnisoft — Validation E2E sandbox

**Date :** 2026-05-07
**Branche :** `feature/myunisoft-integration`
**Cible :** API Partenaires MyUnisoft, format MAD (MyUnisoft Accounting Data)
**Spec :** https://github.com/MyUnisoft/api-partenaires/tree/main/docs/MAD/specs/v1.0.0

## Configuration

```env
MYUNISOFT_THIRD_PARTY_SECRET=<clé partenaire fournie par MyUnisoft>
MYUNISOFT_TEST_JWT=<JWT cabinet/société sandbox>
# MYUNISOFT_API_BASE_URL=https://api.myunisoft.fr/api/v1   (défaut prod)
# MYUNISOFT_API_BASE_URL=https://sandbox.api.myunisoft.fr/api/v1   (sandbox publique)
```

Auth = 2 headers :
- `X-Third-Party-Secret` : clé partenaire fixe (commune à tous les utilisateurs).
- `Authorization: Bearer <JWT>` : token par cabinet/société, saisi par
  l'utilisateur dans le wizard, chiffré AES-256-GCM avant écriture Firestore.

Tous les endpoints MAD requièrent le query param `version=1.0.0` —
auto-injecté par `services/integrations/adapters/myunisoft/client.ts`.

## Probe — résultats validés

Commande :

```bash
npx tsx --env-file=.env scripts/probe-myunisoft.mts
```

Résultat (cabinet de test "FAKE MYU SARL") :

| Endpoint            | Status | Latence  | Items  | Commentaire                                     |
|---------------------|--------|----------|--------|-------------------------------------------------|
| `/mad/exercices`    | 200    | 238 ms   | 3      | N+1 (2026, ouvert), N (2025, ouvert), N-1 (2024, clôturé) |
| `/mad/journals`     | 200    | 198 ms   | 21     | ACH, VTE, BQ, OD, NDF, Paie, Caisse, etc.       |
| `/mad/accounts`     | 200    | 942 ms   | 2025   | PCG complet sur 8 caractères (`10000000`…)      |
| `/mad/entries`      | 200    | ≈12 s    | 4317   | Tout 2026 ; chaque entry inclut `movements[]`   |
| `/mad/balance`      | 200    | 254 ms   | 0      | Cabinet test sans soldes — réel : 1 appel/classe PCG |

✅ Adapter validé pour tourner contre le cabinet de prod.

## Endpoints utilisés par l'adapter

Définis dans [`services/integrations/adapters/myunisoft/fetchers.ts`](../../services/integrations/adapters/myunisoft/fetchers.ts) :

| Fetcher                   | Endpoint MAD       | Params requis                                    |
|---------------------------|--------------------|--------------------------------------------------|
| `fetchJournals`           | `/mad/journals`    | (version auto)                                   |
| `fetchLedgerAccounts`     | `/mad/accounts`    | (version auto)                                   |
| `fetchContacts`           | `/mad/accounts`    | (version auto) — filtre côté mapper sur 40x/41x avec `company` |
| `fetchAccountingEntries`  | `/mad/entries`     | `startDate`, `endDate` (YYYY-MM-DD)              |
| `fetchTrialBalance`       | `/mad/balance`     | `startDate`, `endDate`, `classAccount` (1-8 itéré) |

`myUnisoftVerifyAuth` interroge `/mad/exercices` (endpoint léger).

## Forme des réponses (extraits réels)

### `/mad/exercices`
```json
[
  {
    "producerId": "665",
    "name": "N+1",
    "period": { "start": "2026-01-01", "end": "2026-12-31", "duration": 12, "closed": null },
    "state": "open",
    "additionalProducerProperties": { "lettering": "MONO" }
  }
]
```

### `/mad/journals`
```json
{
  "producerId": "12886",
  "name": "JOURNAL DE VENTES",
  "customerReferenceCode": "02",
  "type": "Vente",
  "counterpartAccount": null,
  "additionalProducerProperties": { "type": "VTE", "locked": false }
}
```

### `/mad/accounts`
```json
{
  "producerId": "1003531",
  "number": "10100000",
  "name": "CAPITAL",
  "closed": false,
  "counterpartAccount": null,
  "concordance": [],
  "correspondanceAccount": null
}
```

### `/mad/entries`
```json
{
  "producerId": "1249556",
  "date": "2026-05-05",
  "dueDate": "2026-05-05",
  "journal": { "producerId": "12886", "customerReferenceCode": "02", "name": "JOURNAL DE VENTES", "type": "Vente" },
  "currency": { "code": "EUR" },
  "movements": [
    {
      "producerId": "3692347",
      "description": "Facture N°ENP2600000977 FAKE MYU SARL n°1",
      "value": { "credit": 3282.8, "debit": 0, "amount": 3282.8 },
      "account": { "producerId": "1004436", "number": "70613000", "name": "ENTREPRISE" },
      "lettering": { "state": "none", "value": null },
      "analytics": []
    }
  ]
}
```

Note : `value.amount` est signé (positif = credit, négatif = debit).
L'adapter consomme uniquement `value.debit` et `value.credit` bruts pour
éviter les ambiguïtés de signe.

## Monitoring

Tout appel API (succès ou échec) est journalisé dans la collection
Firestore `integration_api_audit` via
[`lib/server/integrationAudit.ts`](../../lib/server/integrationAudit.ts).
Schéma :

```
{ provider: "myunisoft", endpoint, method, status, durationMs,
  userId, ok, errorMessage, metadata, createdAt }
```

Règle Firestore : `read, write: if false` — collection strictement
server-side via Admin SDK. Permet aux ops de débugger un cabinet
bêta sans accès direct à son compte.

## Mock fallback (dev sans credentials)

Quand `MYUNISOFT_THIRD_PARTY_SECRET` est absente, le client bascule
automatiquement sur les fixtures de
[`mock.ts`](../../services/integrations/adapters/myunisoft/mock.ts) — log
`[myunisoft/mock] GET /mad/...` pour signaler le mode dégradé.

Permet de :
- lancer le wizard de connexion sans erreur,
- voir un dashboard rempli (KPI calculés),
- exécuter `npm test` sans réseau (50 tests passent).

## Diagnostic post-validation 2026-05-08

### Bug identifié et corrigé : limite API 12 mois sur /mad/entries et /mad/balance

**Symptôme observé :** après le 1ᵉʳ test E2E du wizard, le dashboard /synthese affichait
"Données insuffisantes" pour CA et EBE alors que la sandbox (FAKE MYU SARL)
contient bien des données (CA brut 15 232 873 €, charges 279 831 €, 4317 entries
sur l'exercice 2026, dont 3021 mouvements sur 706).

**Cause racine :**
- L'orchestrator de sync envoie une fenêtre de 36 mois (`DEFAULT_INITIAL_PERIOD_MONTHS`)
  pour rapatrier l'historique typique d'une PME.
- Or `/mad/entries` et `/mad/balance` plafonnent à 12 mois et retournent
  `400 ERR-BAD-REQUEST: "Difference between start and end date should not exceed 12 months"`.
- Le fetcher throw → la passe `entries` du sync se termine en erreur → 0 écritures
  persistées en Firestore → `aggregateEntriesToParsedFinancialData([])` produit
  une `ParsedFinancialData` vide → tous les KPIs nuls.

**Vérifié via :**
- [scripts/inspect-myunisoft-sandbox.mts](../../scripts/inspect-myunisoft-sandbox.mts) :
  3036 mouvements classe 7, 306 mouvements classe 6 (donnée présente).
- [scripts/diagnose-myunisoft-pipeline.mts](../../scripts/diagnose-myunisoft-pipeline.mts) :
  pipeline backend (mappers + aggregator + bridge + KPI engine) calcule correctement
  CA=15 226 140 €, EBE=14 971 070 €, dispo=6 945 720 € quand on lui donne
  des entries non vides.
- [scripts/inspect-analysis-firestore.mts](../../scripts/inspect-analysis-firestore.mts) :
  l'analyse MyUnisoft persistée a tous ses KPIs à `null`, et l'inspection des
  collections révèle `accounting_entries: 0 documents` (vs journals 21,
  ledger_accounts 2025, contacts ~1300).

**Correctif appliqué :**
- [`fetchers.ts`](../../services/integrations/adapters/myunisoft/fetchers.ts) : nouvelles fonctions
  `splitDateRangeIntoChunks` (découpage 12 mois pour `/mad/entries`) et
  `clampDateRangeToMaxMonths` (clamp à 12 derniers mois pour `/mad/balance`).
- 7 tests unitaires couvrent les cas limites
  ([fetchers.test.ts](../../services/integrations/adapters/myunisoft/__tests__/fetchers.test.ts)).
- Re-validé via `diagnose-myunisoft-pipeline.mts` sur fenêtre 36 mois
  (`2023-05-07 → 2026-05-07`) : 3 chunks consécutifs, 4317 entries collectées,
  CA=15 226 140 €, EBE=14 971 070 €.

### Verdict /mad/balance "0 items"

Confirmé après re-test sur fenêtre 12 mois conforme : les 8 classes PCG retournent
toutes `[]` pour ce dossier sandbox. Le dossier FAKE MYU SARL ne publie pas
de balance MAD malgré ses 4317 écritures. Comportement attendu — l'orchestrator
post-sync utilise alors le fallback `aggregateEntriesToParsedFinancialData`
(cf. [`buildAnalysisFromSync.ts`](../../services/integrations/sync/buildAnalysisFromSync.ts#L73-L110)).

### Affichage front "Disponibilités 6 131 €"

L'analyse MyUnisoft persistée par le sync défaillant avait `dispo: null`. Le
dashboard affichait pourtant "6 131 €" — ce chiffre ne provient d'aucune
analyse listée pour le user (10 analyses inspectées, valeurs observées :
261 083 €, 318 000 €, jamais 6 131 €). Hypothèse la plus probable : widget
front avec source dédiée (connecteur Bridge actif, fixture ou sélecteur
multi-source) — hors scope backend MyUnisoft. Une fois le sync corrigé, le
dashboard devrait reprendre la valeur réelle 6 945 720 € depuis
`mappedData.dispo` de l'analyse MyUnisoft fraîche.

## Points d'attention

1. **Volume écritures** : `/mad/entries` a renvoyé 4317 items en ~12 s
   pour un exercice complet. Pour les cabinets actifs, prévoir d'itérer
   par mois si la latence dépasse 30 s.
2. **Balance par classe** : `/mad/balance` requiert `classAccount`. On
   itère sur les classes PCG 1-8 (la classe 9 = analytique, hors
   balance standard). 8 appels séquentiels par sync — ~2 s total
   observé sur le cabinet de test.
3. **Pagination** : aucun cursor retourné par les endpoints testés.
   La doc MAD ne mentionne pas de pagination — l'API retourne tout en
   une fois, par filtre de période/classe. Si MyUnisoft introduit une
   pagination plus tard, ajuster `nextCursor` dans les fetchers.
4. **Sandbox publique** : `https://sandbox.api.myunisoft.fr/api/v1`.
   Le cabinet de test "FAKE MYU SARL" est utilisé pour la prod
   (`https://api.myunisoft.fr/api/v1`) en validation interne.
