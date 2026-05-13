# Audit sécurité Vyzor — Mai 2026

**Date :** 12 mai 2026
**Auteur :** Romain Marcelli, CTO
**Périmètre :** Application Vyzor (production + branches actives)
**Contexte :** Audit préparatoire à l'évaluation Prodiges du 13 mai 2026
**Branche d'audit :** `feature/audit-prodiges-mai-2026`

---

## Résumé exécutif

Vyzor traite des données comptables sensibles de TPE/PME françaises distribuées via les experts-comptables. La sécurité et la conformité RGPD sont structurantes pour la confiance client et la conformité réglementaire.

Cet audit vérifie les 5 fondamentaux : isolation des données utilisateurs, gestion des secrets, chiffrement des tokens tiers, conformité RGPD, et sécurité réseau de base.

**Verdict global : VERT (avec correctifs appliqués pendant l'audit).**

**Risques critiques identifiés :** 0 en production.

**Actions correctives appliquées pendant l'audit :** 2 (sur branche dédiée `feature/audit-prodiges-mai-2026`).

1. **P1 #2** — `firestore.rules` (code) ré-aligné avec les rules effectivement déployées en production. Sans ce correctif, un futur déploiement aurait régressé les rules de 3 sous-collections (`users/{uid}/settings`, `users/{uid}/kpiAlerts`, `users/{uid}/kpiObjectives`).

2. **P1 #4** — Route `/api/account/delete` étendue pour purger l'intégralité des données utilisateur (10 collections + sous-collections de `users/{uid}`) afin de respecter strictement le droit à l'effacement RGPD (art. 17). Avant le correctif, seules `analyses`, `folders` et `users/{uid}` (sans cascade) étaient supprimés ; les `connections` (tokens chiffrés Pennylane/MyUnisoft/Bridge) et les 7 collections comptables restaient en BDD.

Aucun correctif n'a été appliqué directement sur la production hors audit.

---

## 1. Isolation des données utilisateurs (Firestore)

### État

Toutes les collections sensibles sont scopées par `request.auth.uid` (sous-collections de `users/{uid}`) ou par un champ `userId` qui doit matcher `request.auth.uid` (collections root-level).

**Collections protégées par RLS Firestore :**

- `users/{uid}` + sous-collections (`dashboards`, `settings`, `kpiAlerts`, `kpiObjectives`)
- `analyses/{id}` (scoped par champ `userId`, `update` interdit → docs immutables après création)
- `folders/{id}`
- `connections/{id}` (tokens chiffrés des connecteurs tiers ; rule exige `encryptedAccessToken is string` au moment du `create`)
- 7 collections comptables : `accounting_entries`, `invoices`, `ledger_accounts`, `contacts`, `journals`, `bank_accounts`, `bank_transactions`

Les collections internes (`security_audit_logs`) sont gérées exclusivement côté serveur via le SDK Admin (qui bypass les rules) et ne nécessitent pas de policy client-side.

### Vérifications effectuées

- Lecture des rules effectivement déployées en console Firebase production (collées par le CTO).
- Diff vs `firestore.rules` du code → écart identifié (3 sous-collections présentes en prod mais absentes du code).
- Validation des invariants : tous les `read`/`write` exigent `request.auth != null` et un check d'identité.
- Documents immutables (`allow update: if false` sur `analyses`) : OK.
- **Test isolation cross-user via Firebase Rules Playground (13 mai 2026)** — cf. § ci-dessous.

#### Test isolation cross-user — 13 mai 2026

Trois simulations exécutées dans le **Rules Playground** de la console Firebase prod, avec un UID d'attaquant fictif (`attacker-uid-test-123`) tentant de lire des documents appartenant à d'autres utilisateurs :

| # | Simulation | Location | Auth UID | Résultat |
|---|---|---|---|---|
| 1 | `get` doc analyse d'un autre user | `/analyses/7QKGkdbdFomzI9xn2Y6d` | `attacker-uid-test-123` | **Simulated read denied** ✓ |
| 2 | `get` document `users/{UID}` d'un autre user | `/users/<UID existant ≠ attaquant>` | `attacker-uid-test-123` | **Simulated read denied** ✓ |
| 3 | `get` doc `connections/{id}` (tokens chiffrés Pennylane/MyUnisoft/Bridge) | `/connections/<id existant>` | `attacker-uid-test-123` | **Simulated read denied** ✓ |

**Conclusion** : la Row-Level Security Firestore est opérationnelle. Un attaquant qui connaîtrait un docID valide (par fuite d'URL, scraping, etc.) ne peut **pas** accéder aux données s'il n'est pas le propriétaire identifié dans `resource.data.userId` ou dans le path `/users/{uid}/…`. Le test critique sur `/connections` confirme que les tokens chiffrés des connecteurs comptables tiers sont protégés.

### Verdict

**OK** après correctif. Les rules en production sont strictes, l'isolation cross-user est validée empiriquement par 3 simulations du Rules Playground.

### Actions

- `firestore.rules` mis à jour pour ajouter les 3 sous-collections manquantes (`settings`, `kpiAlerts`, `kpiObjectives`).
- Test cross-user effectué (3 simulations Rules Playground, toutes `denied`).
- Déploiement des rules à effectuer juste avant l'audit : `firebase deploy --only firestore:rules` (commande tracée dans le runbook).

---

## 2. Gestion des secrets et credentials

### État

Aucun secret n'est hardcodé dans le code.

### Vérifications effectuées

- **Grep code** sur les motifs `SECRET|API_KEY|TOKEN|BEARER|PASSWORD|PRIVATE_KEY` suivis d'une chaîne longue : aucun match.
- **Audit historique git complet** sur les fichiers sensibles :

  ```
  git log --all --full-history -- ".env" ".env.local" ".env.production" "document-ai-key.json"
  ```

  Aucun de ces fichiers n'a jamais été commité dans l'historique.

- **`.gitignore` vérifié** : `.env`, `.env.local`, `.env.development.local`, `.env.test.local`, `.env.production.local`, `document-ai-key.json` sont tous exclus.

- **Logging des tokens** : grep sur `console.log.*token`, `logger.*token`, `accessToken`/`refreshToken` autour des `console.*` : aucun token loggé en clair. Seul un script de dry-run (`scripts/test-v2-dry-run.mjs`) log des estimations de **comptage de tokens LLM** (≠ tokens d'auth) — pas de fuite.

- **Variables d'env de production** : stockées dans Firebase Functions (côté serveur) et Vercel (côté Next.js). Jamais exposées au bundle client (toutes préfixées sans `NEXT_PUBLIC_` sauf pour la config Firebase Auth, qui est publique par design).

### Verdict

**OK**. Aucun secret en clair dans le code ou l'historique git.

### Actions

- Aucune correction nécessaire.
- Nettoyage cosmétique recommandé : supprimer le fichier `document-ai-key.json` à la racine s'il n'est plus utilisé (gitignoré donc local-only, mais qui traîne sans usage référencé dans le code).

---

## 3. Chiffrement des tokens tiers (Pennylane, MyUnisoft, Bridge, Odoo)

### État

Tous les tokens d'accès et de refresh des connecteurs comptables / bancaires sont chiffrés en **AES-256-GCM** avant écriture en Firestore. Implémentation dans [`lib/server/tokenCrypto.ts`](../../lib/server/tokenCrypto.ts).

### Vérifications effectuées

- **Algorithme** : `aes-256-gcm` (AEAD authentifié, recommandé NIST).
- **IV** : 12 octets aléatoires (`randomBytes(12)`) générés à chaque chiffrement → pas de réutilisation d'IV avec une même clé.
- **Auth tag** : extrait du cipher GCM et stocké, vérifié au déchiffrement → toute altération du ciphertext fait échouer le `decryptToken`.
- **Format de stockage** : `<iv_b64>.<authTag_b64>.<ciphertext_b64>` auto-suffisant. Permet une rotation de clé future via versionnage du préfixe sans cassure des tokens existants.
- **Clé maître** : lue depuis `process.env.CONNECTOR_ENCRYPTION_KEY` (gérée par Firebase Functions / Vercel). Validation au démarrage : doit décoder à exactement 32 octets (256 bits). Cache local en mémoire pour les perfs (réinitialisable pour les tests).
- **Rule Firestore** : la création d'un document `connections/{id}` exige `encryptedAccessToken is string` → impossible d'écrire un token en clair via le SDK client.
- **Tests unitaires** : `lib/server/tokenCrypto.test.ts` (6 tests, passent).
- **Audit des logs** : aucun `console.log` ni `logger.*` n'imprime un token d'auth.

### Verdict

**OK**.

### Actions

- Aucune correction nécessaire.

---

## 4. Conformité RGPD

### État

#### 4.1 Politique de confidentialité

Publique sur [`/privacy`](../../app/privacy/page.tsx) (242 lignes, refonte mars 2026). Mentionne explicitement :

- **Hébergement EU** : Firebase configuré sur régions europe-west, mention au § 6 (sous-traitants).
- **Zero Data Retention IA** : engagement formel sur Anthropic Claude et OpenAI en inférence avec ZDR activé, § 5.
- **Pas d'entraînement LLM** sur les données clients : « Aucune donnée financière (FEC, bilans, liasses) importée par l'Utilisateur n'est, ni ne sera, utilisée pour entraîner des modèles de langages publics ou partagés avec des tiers. »
- **Droits utilisateurs** : accès, rectification, effacement (droit à l'oubli), limitation, portabilité, opposition (§ 7).
- Liste exhaustive des sous-traitants : Firebase (UE), Vercel (CCT pour transferts), Anthropic/OpenAI (API ZDR), Qonto.

#### 4.2 Droit à l'effacement (art. 17 RGPD) — **CORRIGÉ PENDANT L'AUDIT**

##### Avant correctif (état initial sur `main`)

La route [`POST /api/account/delete`](../../app/api/account/delete/route.ts) ne supprimait que :

- Documents de `analyses` où `userId == uid`
- Documents de `folders` où `userId == uid`
- Document `users/{uid}` (sans cascade Firestore sur les sous-collections)
- Compte Firebase Auth

**Données orphelines en Firestore après suppression** :

- `connections/*` (tokens AES-256-GCM des connecteurs tiers — bien chiffrés mais conservés)
- `accounting_entries/*`, `invoices/*`, `ledger_accounts/*`, `contacts/*`, `journals/*`, `bank_accounts/*`, `bank_transactions/*` (entités comptables synchronisées)
- Sous-collections `users/{uid}/dashboards`, `users/{uid}/settings`, `users/{uid}/kpiAlerts`, `users/{uid}/kpiObjectives`

##### Après correctif

La route purge désormais en parallèle :

- Les **10 collections root-level** scopées par `userId` (tableau `USER_SCOPED_ROOT_COLLECTIONS` du code) en batches Firestore de 400 docs.
- `users/{uid}` **avec ses sous-collections** via `firestore.recursiveDelete()` (méthode du SDK Admin Firebase qui cascade proprement).
- Le compte Firebase Auth.

La réponse expose un `deletionCounts` détaillé par collection + un compteur agrégé pour audit. Les anciens champs `deletedAnalysesCount` / `deletedFoldersCount` sont conservés pour compatibilité avec les consommateurs existants (`AccountView`, `accountDeletionApi`, `lib/account/account`).

##### Limites résiduelles

- **Révocation OAuth tiers** : les tokens encore valides côté Pennylane, MyUnisoft, Bridge ne sont pas explicitement révoqués (les `connections` Firestore sont supprimées mais le provider conserve le token jusqu'à sa rotation/expiration naturelle). Action planifiée en backlog post-13 mai (cf. Annexe C).

- **`security_audit_logs`** : conservés (par design — logs d'audit sécurité). Purge mensuelle automatique en place via cron (`/api/cron/security-audit-cleanup`, schedule `0 3 1 * *`). La conservation des logs à des fins de sécurité est licite au titre de l'intérêt légitime et de la traçabilité des incidents (RGPD recital 49).

#### 4.3 Audit log RGPD

Les évènements de suppression (`account_deleted_everywhere`, `account_delete_failed`, `account_delete_unauthorized_missing_token`) sont tracés dans `security_audit_logs` avec horodatage serveur, IP, métadonnées de comptage. Permet de prouver la suppression effective en cas de demande CNIL.

#### 4.4 Test manuel bout en bout — 13 mai 2026

Validation manuelle complémentaire aux 30 tests unitaires, exécutée sur l'environnement local connecté à Firebase prod (compte test jetable).

- **Compte test** : UID `oancGWE79RWNKSLe3fFaGZmjcCc2`.
- **État avant suppression** (query Firestore filtrée par `userId == <UID>`) :
  - `analyses` : 1 doc
  - 9 autres collections root (`folders`, `connections`, `accounting_entries`, `invoices`, `ledger_accounts`, `contacts`, `journals`, `bank_accounts`, `bank_transactions`) : 0 doc chacune
  - `users/{UID}` : présent avec sous-collection `dashboards`
  - Firebase Authentication : user présent
- **Action utilisateur** : bouton « Supprimer mon compte » depuis `/account`.
- **Réponse `/api/account/delete`** : HTTP 200, payload de retour cohérent.
- **Log d'audit** écrit dans `security_audit_logs` (timestamp `2026-05-13 12:19:41 UTC+2`) :

  ```json
  {
    "eventType": "account_deleted_everywhere",
    "method": "POST",
    "path": "/api/account/delete",
    "status": 200,
    "message": "Suppression complète confirmée (Firestore + Auth).",
    "userId": "oancGWE79RWNKSLe3fFaGZmjcCc2",
    "metadata": {
      "totalRootDocsDeleted": 1,
      "deletionCounts": {
        "analyses": 1, "folders": 0, "connections": 0,
        "invoices": 0, "contacts": 0, "journals": 0,
        "ledger_accounts": 0, "accounting_entries": 0,
        "bank_accounts": 0, "bank_transactions": 0
      }
    }
  }
  ```

- **Vérification post-suppression** :
  - Query `analyses` filtrée par UID test : 0 résultat (écart attendu -1).
  - `users/{UID}` + sous-collections : entièrement purgés via `firestore.recursiveDelete`.
  - Firebase Authentication : user supprimé de la liste.
- **Conclusion** : le droit à l'effacement RGPD (art. 17) est opérationnel de bout en bout. Le log auditable permet de produire la preuve de la suppression à toute autorité de contrôle.

### Verdict

**OK** après correctif, validé par tests unitaires (30/30) + test manuel bout en bout du 13 mai 2026.

### Actions

- `/api/account/delete` étendu (cf. § 4.2 ci-dessus).
- Tests existants (30 tests sécurité passants) : aucune régression. Le contrat de réponse est rétro-compatible.
- Test manuel exécuté et tracé (cf. § 4.4 ci-dessus).

---

## 5. Sécurité réseau

### État

Headers de sécurité globaux appliqués via [`proxy.ts`](../../proxy.ts) (Next.js middleware, matcher exclut `/_next/static`, `/_next/image`, `favicon.ico` pour limiter le coût d'éxécution).

### Headers actifs

| Header | Valeur | Risque traité |
|---|---|---|
| `Content-Security-Policy` | self + sources Firebase/Google API + Vercel feedback (CSP v1 pragmatique avec `unsafe-inline`/`unsafe-eval` pour compat MVP) | XSS, injection de script tiers |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (production uniquement) | MITM, downgrade HTTP |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME-sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Fuite de referrer |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | API navigateur non utilisées |

### Rate limiting

Implémenté dans [`lib/server/rateLimit.ts`](../../lib/server/rateLimit.ts) sur les routes sensibles :

| Route | Limite | Fenêtre |
|---|---|---|
| `/api/analyses` | 12 req | 60 s |
| `/api/auth/send-password-reset-email` | 5 req | 15 min |
| `/api/auth/send-verification-email` | 8 req | 15 min |
| `/api/account/delete` | 10 req | 60 s |

Headers de réponse normalisés (`Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`). Blocage `HTTP 429` + log automatique dans `security_audit_logs`. Limite : compteur **en mémoire process** — non partagé entre instances serverless. Backlog : migrer vers Redis/KV partagé pour la mise à l'échelle.

### Session

Expiration automatique à **24 heures** (`AUTH_SESSION_MAX_AGE_MS` dans [`lib/auth/sessionLifetime.ts`](../../lib/auth/sessionLifetime.ts)). Déconnexion forcée à l'échéance avec garde anti-écran-noir sur `/analysis` et `/dashboard`.

### HTTPS

Vercel et Firebase forcent HTTPS par défaut. Aucun override en production. HSTS confirme côté navigateur après le 1er accès.

### Verdict

**OK**.

### Actions

- Aucune correction nécessaire.

---

## Annexes

### A. Stack et hébergement

- **Frontend** : Next.js 16 (App Router) sur Vercel, région EU
- **Backend** : Firebase Functions (région `europe-west`)
- **Base de données** : Cloud Firestore (région EU)
- **Authentification** : Firebase Auth (email/password + reset)
- **LLM** : Anthropic Claude (Zero Data Retention activé) + OpenAI GPT en option (idem ZDR)
- **Connecteurs comptables** : Pennylane (OAuth), MyUnisoft (X-Third-Party + JWT), Odoo (login/password serveur), Bridge (Open Banking OAuth)
- **OCR** : Google Document AI (clé service-account locale uniquement, non commitée)
- **Données société** : API Pappers (clé API serveur)
- **Banque société** : Qonto

### B. Liste des secrets gérés

| Secret | Stockage | Rotation | Accès |
|---|---|---|---|
| `MYUNISOFT_THIRD_PARTY_SECRET` | Vercel env vars | Sur demande | Fondateurs |
| `PENNYLANE_CLIENT_SECRET` | Vercel env vars | Sur demande | Fondateurs |
| `BRIDGE_CLIENT_SECRET` | Vercel env vars | Sur demande | Fondateurs |
| `ODOO_*` (host/user/pwd) | Vercel env vars | Sur demande | Fondateurs |
| `CONNECTOR_ENCRYPTION_KEY` (clé maître AES-256-GCM) | Vercel env vars | Annuelle (rotation à planifier post-audit) | Fondateurs |
| `ANTHROPIC_API_KEY` | Vercel env vars | Trimestrielle | Fondateurs |
| `OPENAI_API_KEY` | Vercel env vars | Trimestrielle | Fondateurs |
| `PAPPERS_API_KEY` | Vercel env vars | Sur demande | Fondateurs |
| `CRON_SECRET` (cron purge audit) | Vercel env vars | Sur demande | Fondateurs |
| Service account Firebase Admin | Vercel env var encodée base64 | Sur demande | Fondateurs |
| Service account Google Document AI | Local dev uniquement (`document-ai-key.json` gitignoré) | Sur demande | Fondateurs |

### C. Backlog des améliorations identifiées

| Action | Priorité | Effort | Date cible |
|---|---|---|---|
| Migrer le rate limit en mémoire vers Redis/KV (Upstash Vercel KV) pour scaler les instances serverless | Important | 1 j | M+1 |
| Révocation OAuth explicite côté Pennylane / MyUnisoft / Bridge lors d'une suppression de compte | Important | 1 j | M+1 |
| `npm audit fix` complet (24 vulnérabilités résiduelles : 2 critiques, 6 high, 8 moderate, 8 low) — voir annexe D | Important | 0,5 j + tests de non-régression | M+1 |
| Remplacer `xlsx` (high severity, pas de fix amont) par `exceljs` | Important | 1-2 j | M+1 |
| Rotation programmée `CONNECTOR_ENCRYPTION_KEY` + support multi-clés via préfixe versionné dans le format token | Important | 2 j | M+3 |
| Renforcer la CSP : passer en nonce/hash, retirer `unsafe-inline` et `unsafe-eval` progressivement | Modéré | 3-5 j | M+3 |
| MFA / TOTP pour les comptes admin | Modéré | 3 j | M+3 |
| Pen-test externe (boîte noire) | Important | Prestataire externe | M+6 |
| Intégration Claude Code Security d'Anthropic dans le pipeline CI | Modéré | Dépendant de l'accès Anthropic | À planifier post-waitlist |
| Suppression du fichier obsolète `document-ai-key.json` à la racine (gitignoré mais sans usage référencé) | Très bas | 5 min | Immédiat |

### D. Audit des dépendances NPM

`npm audit --audit-level=high` exécuté le 12 mai 2026 :

- **2 critiques** : `protobufjs` (multiples CVE — exécution de code arbitraire, prototype pollution, DoS). Transitive via `firebase-admin@13.7.0` → patchable par mise à jour de transitive.
- **6 high** : `vite` (chemins traversaux, lecture arbitraire via WebSocket dev — n'affecte pas la prod, vitest uniquement) ; `xlsx` (Prototype Pollution + ReDoS, **pas de fix amont disponible** — usage à auditer et à remplacer par `exceljs`).
- **8 moderate** : `@anthropic-ai/sdk` (permissions fichier MemoryTool — pas utilisé), `postcss` (XSS via stringify, transitive Next.js), `@protobufjs/utf8` (overlong UTF-8), `uuid` (bounds-check), `yaml` (stack overflow sur YAML très profonds).
- **8 low** : transitives Google Cloud SDK + `@tootallnate/once` (control flow scoping dans une dep de dev).

Évaluation du risque opérationnel :

- Les vulnérabilités `vite` et `@anthropic-ai/sdk MemoryTool` n'affectent pas le binaire de production (dev/tests uniquement).
- `xlsx` est utilisé pour le parsing FEC : à isoler côté serveur derrière une validation stricte de l'entrée (taille, format) et à remplacer en M+1.
- Les transitives `protobufjs` / `@google-cloud/*` se résolvent par un `npm audit fix` ciblé + bump de `firebase-admin`. À planifier avec un cycle de tests complet pour éviter une régression sur les Functions.

Aucune action de remédiation n'a été appliquée pendant cette fenêtre d'audit (5 jours) pour éviter d'introduire une régression dans la veille du jour J. Plan détaillé en backlog (annexe C).

### E. Plan de remédiation continue

Vyzor s'engage sur un audit sécurité complet tous les 6 mois (prochain : **novembre 2026**). Une intégration **Claude Code Security** d'Anthropic est prévue dès l'obtention de l'accès (waitlist active depuis mai 2026), avec branchement dans le pipeline CI pour analyse automatique des PRs.

Le journal sécurité interne ([`securiter.md`](../../securiter.md)) est tenu à jour à chaque évolution. Les évènements de sécurité (`login_failed`, `429`, `account_deleted_*`, `401`, `403`) sont tracés dans Firestore `security_audit_logs` avec purge mensuelle automatique.

### F. Synthèse des fichiers modifiés sur la branche `feature/audit-prodiges-mai-2026`

- `firestore.rules` — ajout des 3 sous-collections `users/{uid}/settings`, `users/{uid}/kpiAlerts`, `users/{uid}/kpiObjectives` pour aligner avec la production.
- `app/api/account/delete/route.ts` — purge complète des 10 collections root-level scopées par `userId` + `recursiveDelete` sur `users/{uid}` (cascade sous-collections). Réponse rétro-compatible.
- `docs/security/audit-mai-2026-prodiges.md` — ce rapport.

Aucun autre fichier touché. Les tests existants (30 tests sécurité) passent sans régression.
