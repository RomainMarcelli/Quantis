# Intégration Pennylane — OAuth 2.0 (Firm + Company)

> Doc technique de la couche d'authentification OAuth 2.0 de Vyzor pour
> Pennylane. Brief sprint 13/05/2026 — Firm API ouverte, Company en
> attente de validation Pennylane.

## Vue d'ensemble

Pennylane expose deux APIs OAuth distinctes :

- **Firm API** — pour les **cabinets comptables** (multi-dossiers clients).
  Un seul OAuth token donne accès à N dossiers via `GET /companies`.
  Crédentiels reçus le 13/05/2026, 11 scopes readonly validés.
- **Company API** — pour les **entreprises** (un seul dossier).
  En attente de validation Pennylane → désactivée par feature flag
  `PENNYLANE_COMPANY_ENABLED=false`.

Vyzor supporte aussi 2 modes de fallback historiques :

- **Company token** (copier-coller) — token API généré par l'utilisateur
  dans son compte Pennylane. Pas de refresh.
- **Firm token** (copier-coller) — équivalent pour cabinets. Pas de refresh.

## Architecture

```
┌────────────────────┐                                ┌──────────────────────┐
│   /documents       │  ① POST /connect {mode,kind}   │  app.pennylane.com   │
│   PennylaneStep    │ ─────────────────────────────▶ │  /oauth/authorize    │
│   (wizard)         │                                │                      │
└─────────┬──────────┘                                └──────────┬───────────┘
          │                                                      │
          │ ② window.location.href = authorizeUrl                │
          │                                                      │
          ▼                                                      │
┌────────────────────┐                                            │
│  User logs in /    │ ◀──────────────── redirect ───────────────┘
│  authorizes app    │
└─────────┬──────────┘
          │
          │ ③ GET /callback?code=...&state=...
          │
          ▼
┌────────────────────┐  ④ POST /oauth/token (grant=code)
│  /callback         │ ─────────────────▶ Pennylane
│                    │                    ◀─── {access_token, refresh_token}
│                    │
│                    │  ⑤ GET /companies (Firm only)
│                    │ ─────────────────▶ Pennylane
│                    │                    ◀─── [{id, name, siren}, ...]
│                    │
│                    │  ⑥ createConnection (Firestore + AES-256-GCM)
│                    │
│                    │  ⑦ 302 → /documents?pennylane_oauth=success&kind=firm
└────────────────────┘
```

## Variables d'environnement

| Variable | Requis | Description |
|---|---|---|
| `PENNYLANE_FIRM_CLIENT_ID` | ✓ | client_id de l'OAuth app Firm |
| `PENNYLANE_FIRM_CLIENT_SECRET` | ✓ | client_secret de l'OAuth app Firm |
| `PENNYLANE_FIRM_REDIRECT_URI` | ✓ | URL de callback enregistrée chez Pennylane |
| `PENNYLANE_FIRM_SCOPES` | ✓ | 11 scopes readonly espace-séparés |
| `PENNYLANE_COMPANY_CLIENT_ID` | optionnel | client_id Company (en attente Pennylane) |
| `PENNYLANE_COMPANY_CLIENT_SECRET` | optionnel | client_secret Company |
| `PENNYLANE_COMPANY_REDIRECT_URI` | optionnel | URL de callback Company |
| `PENNYLANE_COMPANY_SCOPES` | optionnel | scopes Company |
| `PENNYLANE_COMPANY_ENABLED` | optionnel | feature flag (`false` par défaut) |
| `CONNECTOR_ENCRYPTION_KEY` | ✓ | clé AES-256-GCM (32 octets hex/base64) |
| `PENNYLANE_OAUTH_AUTHORIZE_URL` | optionnel | override (défaut prod) |
| `PENNYLANE_OAUTH_TOKEN_URL` | optionnel | override (défaut prod) |
| `PENNYLANE_API_BASE_URL` | optionnel | override (défaut prod) |

**Rétrocompat** : si `PENNYLANE_FIRM_*` absents, fallback automatique sur
`PENNYLANE_OAUTH_*` (nomenclature Phase 1.5).

## URLs de redirection enregistrées chez Pennylane

| Environnement | URL |
|---|---|
| Prod | `https://app.vyzor.fr/api/integrations/pennylane/callback` |
| Dev local | Non enregistré — utiliser une preview Vercel |

**Important** : Pennylane refuse toute URL non enregistrée *à l'octet près*.
Pour tester le flow OAuth complet en dev :
1. Déployer une preview Vercel sur la branche.
2. Demander à Antoine d'ajouter temporairement l'URL preview dans le
   formulaire OAuth Pennylane.
3. Lancer le flow depuis l'URL preview, pas depuis `localhost`.

## Scopes Firm (11 readonly)

| Scope | Endpoint |
|---|---|
| `categories:readonly` | `/categories` |
| `customers:readonly` | `/customers` |
| `fiscal_years:readonly` | `/fiscal_years` |
| `journals:readonly` | `/journals` |
| `ledger_accounts:readonly` | `/ledger_accounts` |
| `ledger_entries:readonly` | `/ledger_entries` |
| `suppliers:readonly` | `/suppliers` |
| `transactions:readonly` | `/transactions` |
| `trial_balance:readonly` | `/trial_balance` |
| `companies:readonly` | `/companies` |
| `dms_files:readonly` | `/dms_files` |

Aucun scope d'écriture demandé — Vyzor est en lecture seule.

## Modèle ConnectionRecord

Stocké dans Firestore `connections/{id}`. Champs OAuth :

```ts
{
  id: string;
  userId: string;
  provider: "pennylane";
  providerSub: "pennylane_firm" | "pennylane_company";  // ← dérivé du kind
  status: "active" | "expired" | "error" | "revoked";
  authMode: "oauth2";
  encryptedAccessToken: string;       // AES-256-GCM via CONNECTOR_ENCRYPTION_KEY
  encryptedRefreshToken: string;      // ditto
  tokenPreview: string;               // "abcdef…wxyz" pour l'UI
  tokenExpiresAt: string;             // ISO (7j typiquement)
  scopes: string[];
  externalCompanyId: string;          // id du 1er dossier (Firm v2 = premier)
  externalFirmId: string | null;      // identifiant cabinet synthétique stable
  // ... champs sync
}
```

## Gestion des refresh

Les tokens Pennylane expirent **tous les 7 jours**. Vyzor refresh automatiquement :

1. **Refresh proactif** : avant chaque sync, `ensureFreshAuth()` vérifie
   `tokenExpiresAt - now < 60s` et refresh si oui.
2. **Refresh réactif** : si un appel API renvoie 401 en cours de sync,
   le client retente une fois après refresh (`client.ts`).
3. **Refresh échec** : si `refresh_token` invalide/révoqué, l'erreur
   remonte → `ConnectionRecord.status = "expired"` → l'UI affiche un
   bandeau "Reconnexion Pennylane nécessaire" (cf. wizard /documents).

## Codes d'erreur du flow OAuth

| `pennylane_oauth=error&error=...` | Cause |
|---|---|
| `user_denied` | L'utilisateur a refusé l'autorisation Pennylane |
| `missing_params` | code ou state absent dans le callback |
| `state_invalid` | state inconnu (jamais émis ou TTL > 10 min) |
| `state_expired` | state expiré (TTL 10 min écoulé) |
| `provider_mismatch` | state stocké pour un autre provider |
| `exchange_failed` | Pennylane a refusé l'échange code → token |

## Peuplement de la sandbox cabinet

Pennylane API v2 **n'autorise pas l'écriture programmatique**. Pour peupler
la sandbox `admin+1@vyzor.fr` avec des données de test cohérentes,
procéder **manuellement** via l'UI Pennylane :

### 1. Créer 3 dossiers clients

Dans le portail cabinet sandbox :

| Dossier | SIREN (factice) | Activité |
|---|---|---|
| Vyzor SAS (démo) | 902 144 027 | Conseil B2B |
| Atelier Beta | 851 308 715 | Restauration |
| Gamma Studio | 803 552 919 | Studio créatif |

### 2. Importer un plan de comptes 2033-SD standard

Utiliser l'import OFX/Excel de Pennylane. Le plan doit couvrir au minimum :
classes 1, 2, 4, 5, 6, 7. Vyzor mappe via les variables 2033-SD donc tous
les comptes PCG standards sont reconnus.

### 3. Saisir 100+ écritures par dossier sur 12 mois

Distribution réaliste :
- 30 % ventes (701, 706, 707)
- 20 % achats (601, 604, 607)
- 15 % salaires + charges sociales (641, 645)
- 10 % charges externes (606, 613, 622)
- 10 % TVA (4456, 4457)
- 10 % banque (512)
- 5 % divers

### 4. Soldes initiaux cibles

Pour que `seed-pennylane-sandbox.mts` valide ✅ :

| KPI | Cible | Tolérance |
|---|---|---|
| CA | 222 000 € | ±5 % |
| Disponibilités | 318 000 € | ±5 % |
| Emprunts | 100 000 € | ±5 % |
| Trésorerie nette | 218 000 € | ±5 % |
| Total actif | 653 000 € | ±5 % |
| Total passif | 618 000 € | ±5 % |

### 5. Valider via le script

```bash
npx tsx --env-file=.env.local scripts/seed-pennylane-sandbox.mts <uid-admin>
```

Pour le détail KPI par KPI :

```bash
npx tsx --env-file=.env.local scripts/audit-pennylane-sandbox.mts
```

## Tester le flow OAuth bout-en-bout

1. `npm run dev` (localhost ne marchera **pas** sans URL preview).
2. Si pas de preview Vercel : demander à Antoine d'ajouter
   `https://<preview>.vercel.app/api/integrations/pennylane/callback`
   dans le formulaire OAuth Pennylane.
3. Ouvrir `/documents` → tuile Pennylane → "Connecter mon cabinet
   Pennylane".
4. Le navigateur redirige vers `app.pennylane.com/oauth/authorize`.
5. Login `admin+1@vyzor.fr` + autoriser.
6. Pennylane redirige vers `/api/integrations/pennylane/callback?code=...`
   qui crée la connexion puis redirige vers
   `/documents?pennylane_oauth=success&kind=firm&companies_count=N`.
7. Le wizard détecte la connexion existante (`Vue 2`) et propose la
   synchronisation directe.

## Cycle complet : ce qui se passe au sync

1. `POST /api/integrations/pennylane/sync {connectionId}`.
2. `syncOrchestrator.runSync()` :
   - `adapter.authenticate(connection)` → `ensureFreshAuth()` refresh si
     `tokenExpiresAt - now < 60s`.
   - Pour chaque entité (journals, ledger_accounts, contacts, entries,
     invoices) : pagination cursor-based via `buildFilters()`.
   - Persistance via `upsertJournals()`, `upsertInvoices()`, etc.
   - `fetchTrialBalance()` → `buildAnalysisFromSync()` → calcul KPIs 2033-SD.
3. `updateSyncStatus(connectionId, "success")` + `lastSyncAt = now`.
4. L'UI rafraîchit `/api/integrations/connections` → wizard met à jour
   le badge `SyncStatusBadge`.

## Sélection multi-dossiers — état v1 / v2

**v1 (actuel, brief 13/05/2026)** : on stocke `externalCompanyId = id du 1er
dossier accessible`. Le sync itère sur tous les dossiers du cabinet via
le firm token (les fetchers passent `?company_id=` dynamiquement).

**v2 (futur)** : UI checkbox-picker post-OAuth pour que l'utilisateur
sélectionne explicitement les dossiers à synchroniser (RGPD). Stockage
prévu dans `ConnectionRecord.selectedCompanies: string[]`.

## Tests

| Fichier | Couverture |
|---|---|
| `services/integrations/adapters/pennylane/auth.test.ts` | OAuth Firm/Company, buildOAuthAuthorizeUrl, exchangeOAuthCode, refreshOAuthToken, ensureFreshAuth, feature flag |
| `services/integrations/adapters/pennylane/firmOAuth.test.ts` | fetchFirmCompaniesWithToken, deriveFirmIdFromCompanies |
| `services/integrations/adapters/pennylane/fetchers.test.ts` | (préexistant Phase 1.5) buildFilters |

```bash
npm run test:unit -- services/integrations/adapters/pennylane/
# 38 tests ✅
```

## Prochaines étapes

- [ ] Recevoir les credentials Company API → activer le flag.
- [ ] Inviter 2-3 cabinets bêta-testeurs sur la sandbox (Antoine 13/05/2026 + 1 semaine).
- [ ] Wizard /documents : afficher le nombre de dossiers détectés
      (`companies_count` déjà exposé par le callback).
- [ ] v2 sélection multi-dossiers (checkbox-picker).
- [ ] Révocation côté Pennylane lors du disconnect (si endpoint
      `revoke_token` disponible).
