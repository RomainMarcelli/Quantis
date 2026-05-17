# Checklist certification Pennylane

> Documents et captures à fournir à Pennylane pour la validation finale
> de l'app Vyzor (Firm API + Company API). Brief sprint 13/05/2026.

## Identité technique

- **Nom de l'app** : Vyzor
- **Contact technique** : admin@vyzor.fr
- **App confidentielle** : true (client_secret stocké côté serveur, jamais exposé front)
- **Bypass OAuth Plan Restriction** : false (l'app respecte les plans utilisateur)
- **URL de retour d'appel** : `https://app.vyzor.fr/api/integrations/pennylane/callback`

## Type d'API

- **Firm API** : validée 13/05/2026 ✅
- **Company API** : en attente de validation

## Scopes demandés (Firm — 11 readonly)

| Scope | Justification |
|---|---|
| `categories:readonly` | Catégorisation des écritures pour les agrégateurs Vyzor |
| `customers:readonly` | Stats clients (CA, DSO, concentration) |
| `fiscal_years:readonly` | Détection automatique de la période d'exercice |
| `journals:readonly` | Décomposition des écritures par type de journal |
| `ledger_accounts:readonly` | Mapping PCG → variables 2033-SD |
| `ledger_entries:readonly` | Source principale du compte de résultat + bilan |
| `suppliers:readonly` | Stats fournisseurs (DPO, concentration achats) |
| `transactions:readonly` | Lecture des mouvements bancaires rapprochés |
| `trial_balance:readonly` | Balance générale (P&L + bilan en 1 requête) |
| `companies:readonly` | Liste des dossiers accessibles au cabinet |
| `dms_files:readonly` | (Phase ultérieure) lecture des pièces justificatives |

**Aucun scope d'écriture demandé** — Vyzor est exclusivement en lecture
seule. Le pipeline interne calcule des KPIs et un score Vyzor sans
jamais modifier de données côté Pennylane.

## Parcours utilisateur OAuth (captures à fournir)

1. **`/documents` — tuile Pennylane**
   - Capture : 3 boutons "Connecter mon cabinet", "Connecter mon
     entreprise" (si Company actif), "J'ai déjà un token API".
2. **`/oauth/authorize` Pennylane**
   - Capture : page d'autorisation Pennylane avec les 11 scopes listés.
3. **`/oauth/authorize` Pennylane — consentement**
   - Capture : utilisateur accepte les scopes demandés.
4. **`/api/integrations/pennylane/callback` (transparent)**
   - Capture : redirection vers `/documents?pennylane_oauth=success&kind=firm`.
5. **`/documents` — état Connecté**
   - Capture : carte Pennylane affichant "Connexion active" + nombre
     de dossiers détectés + bouton "Déconnecter".
6. **`/synthese` ou `/analysis`** (post-sync)
   - Capture : dashboard rempli avec les KPIs calculés depuis la sandbox.

## Démo asynchrone à produire

Screencast ~3 min couvrant les 6 étapes ci-dessus + un cycle complet :

1. Login Vyzor.
2. Naviguer vers `/documents`.
3. Clic sur "Connecter mon cabinet Pennylane".
4. Redirection vers Pennylane.
5. Login sandbox `admin+1@vyzor.fr` + autorisation.
6. Retour sur `/documents` + détection de N dossiers.
7. Sync en cours → KPIs apparaissent dans `/synthese`.
8. Demo refresh : forcer une expiration token → reconnexion automatique.

## Endpoints consommés (read-only)

Liste exhaustive des appels HTTP Pennylane que Vyzor effectue :

| Méthode | Endpoint | Fréquence | Quand |
|---|---|---|---|
| `POST` | `/oauth/authorize` | 1× / cabinet | Première connexion |
| `POST` | `/oauth/token` (grant=code) | 1× / cabinet | Callback OAuth |
| `POST` | `/oauth/token` (grant=refresh_token) | ~1× / 7 jours | Refresh proactif/réactif |
| `GET` | `/companies` | 1× / connexion | Post-callback, liste dossiers |
| `GET` | `/journals` | 1× / sync | Référentiel journaux |
| `GET` | `/ledger_accounts` | 1× / sync | Plan comptable |
| `GET` | `/customers` | 1× / sync | Référentiel clients |
| `GET` | `/suppliers` | 1× / sync | Référentiel fournisseurs |
| `GET` | `/ledger_entries` | N pages / sync | Écritures comptables |
| `GET` | `/trial_balance` | 1× / sync | Balance pour KPIs 2033-SD |
| `GET` | `/transactions` | N pages / sync | Rapprochement bancaire (futur) |

**Aucun POST/PATCH/DELETE** sur les ressources Pennylane.

## Sécurité

- **Chiffrement des tokens** : AES-256-GCM avec clé maître
  `CONNECTOR_ENCRYPTION_KEY` (32 octets) côté Firestore.
- **Tokens jamais loggés en clair** : seuls les `tokenPreview`
  ("abcdef…wxyz") apparaissent dans les logs.
- **Isolation par userId** : chaque `ConnectionRecord` est lié à un
  `userId` Firebase ; les routes vérifient `requireAuthenticatedUser`
  avant toute opération.
- **State CSRF** : 24 octets random base64url + TTL 10 min en Firestore
  (collection `oauth_states`).
- **HTTPS only** en prod (`app.vyzor.fr`).
- **No client_secret côté front** : tous les échanges OAuth se font
  serveur ↔ Pennylane.

## Rate limiting

- **Retry exponentiel** sur 429 et 5xx (4 tentatives max, backoff 500 ms
  → 4 s, ou `Retry-After` si fourni par Pennylane).
- **Pagination cursor-based** : Vyzor ne fait pas de requêtes massives,
  une page à la fois (typiquement 100 items / page).
- **Sync incrémental** : Vyzor ne refetch que les écritures modifiées
  depuis `lastSyncAt` (cursors stockés par entité dans `ConnectionRecord.syncCursors`).

## Données conservées par Vyzor

| Données | Lieu | Chiffrement |
|---|---|---|
| Access token | Firestore `connections/{id}.encryptedAccessToken` | AES-256-GCM |
| Refresh token | Firestore `connections/{id}.encryptedRefreshToken` | AES-256-GCM |
| Écritures comptables | Firestore `accounting_entries/{id}` | (champs non-sensibles en clair) |
| Trial balance | Firestore `analyses/{id}.balanceSheetSnapshot` | (calculs internes) |
| KPIs calculés | Firestore `analyses/{id}.kpis` | (calculs internes) |

L'utilisateur peut **déconnecter** à tout moment via `/documents` :
`POST /api/integrations/pennylane/disconnect` supprime la `ConnectionRecord`
côté Vyzor. Si Pennylane expose un endpoint `revoke_token`, Vyzor
l'appellera également (suivi de la doc Pennylane).

## Conformité RGPD

- Données collectées : strictement nécessaires au calcul des KPIs
  financiers (P&L + bilan + flux de trésorerie).
- Aucune donnée nominative client/fournisseur n'est exposée
  au-delà du dashboard authentifié de l'utilisateur Vyzor.
- Aucun partage tiers (no analytics, no tracking).
- Suppression sur demande utilisateur : `POST /api/account/delete` purge
  toutes les `connections`, `accounting_entries`, `analyses` du userId.

## Points de contact

- **Support Pennylane** : à compléter par Antoine.
- **Référent technique Vyzor** : admin@vyzor.fr (Antoine Cayer).
- **Documentation OAuth interne** : `docs/integrations/pennylane.md`.
- **Tests** : `services/integrations/adapters/pennylane/*.test.ts` (38 ✅).

## Suivi de validation

- [ ] Captures du parcours OAuth produites.
- [ ] Screencast 3 min uploadé.
- [ ] Sandbox cabinet peuplée (cf. `docs/integrations/pennylane.md`
      section "Peuplement de la sandbox cabinet").
- [ ] KPIs validés vs valeurs de référence (CA 222K€, dispo 318K€…)
      via `scripts/seed-pennylane-sandbox.mts`.
- [ ] Validation Company API reçue.
