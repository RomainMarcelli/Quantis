# Sécurité Quantis

<!--
Ce document est la source de vérité sécurité.
À chaque évolution sécurité, ajouter une entrée datée avec:
- risque traité
- fichiers touchés
- impact attendu
- limites connues
-->

## Journal des changements

### 2026-03-20 — Hardening v1 (headers + rate limiting)

#### 1) Headers HTTP de sécurité globaux

- **Fichier ajouté**: `middleware.ts`
- **Mesures appliquées**:
  - `Content-Security-Policy` (politique restrictive compatible MVP)
  - `Strict-Transport-Security` (production uniquement)
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` (camera/microphone/geolocation/payment/usb désactivés)
- **Risque traité**:
  - réduction des surfaces XSS, clickjacking, mime-sniffing et fuite de referrer.

#### 2) Rate limiting des routes sensibles

- **Fichier ajouté**: `lib/server/rateLimit.ts`
- **Principe**: fixed window en mémoire process.
- **Routes protégées**:
  - `app/api/analyses/route.ts` -> `12 requêtes / 60s / client`
  - `app/api/auth/send-password-reset-email/route.ts` -> `5 requêtes / 15 min / client`
  - `app/api/auth/send-verification-email/route.ts` -> `8 requêtes / 15 min / client`
- **Comportement**:
  - blocage `HTTP 429` au dépassement
  - headers `Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

#### 3) Tests unitaires sécurité

- **Fichier ajouté**: `lib/server/rateLimit.test.ts`
- **Cas couverts**:
  - autorisation sous la limite
  - blocage au dépassement
  - réinitialisation après expiration de fenêtre

### 2026-03-20 — Hardening v1.1 (journal d’audit + pages d’erreur)

#### 1) Journal d’audit sécurité (Firestore)

- **Fichiers ajoutés**:
  - `lib/server/securityAudit.ts`
  - `app/api/security/audit/route.ts`
  - `services/securityAuditClient.ts`
- **Fichiers modifiés**:
  - `lib/server/firebaseAdmin.ts` (exposition Firestore Admin)
  - `lib/server/rateLimit.ts` (log automatique des 429)
  - `app/api/analyses/route.ts` (logs upload succès/échec/validation)
  - `app/api/auth/send-password-reset-email/route.ts` (logs reset)
  - `app/api/auth/send-verification-email/route.ts` (logs vérification + 401)
  - `components/LoginForm.tsx` (logs connexion succès/échec)
  - `components/auth/ResetPasswordForm.tsx` (logs reset finalisé/échec)
  - `components/account/AccountView.tsx` (logs suppression données/compte)
- **Événements tracés**:
  - connexion (`login_success`, `login_failed`)
  - reset mot de passe (demande + finalisation)
  - suppressions de données (stats et compte)
  - uploads (validation, succès, échec)
  - erreurs sécurité (`401`, `403`, `429`)
- **Champs enregistrés**:
  - `ipAddress`
  - `userId`
  - `createdAt` (timestamp serveur)
  - `statusCode`, `route`, `method`, `message`, `metadata`

#### 2) Pages d’erreur applicatives

- **Fichiers ajoutés**:
  - `components/ui/ErrorStatusPage.tsx`
  - `app/not-found.tsx` (404)
  - `app/403/page.tsx`
  - `app/501/page.tsx`
- **Objectif**:
  - proposer des écrans d’erreur lisibles et cohérents avec la DA premium.

#### 3) Tests unitaires audit

- **Fichier ajouté**: `lib/server/securityAudit.test.ts`
- **Cas couverts**:
  - extraction IP (`x-forwarded-for`, `x-real-ip`)
  - sanitation metadata (taille/profondeur)

### 2026-03-21 — Hardening v1.2 (purge mensuelle automatique des logs)

#### 1) Purge Firestore des logs de sécurité

- **Fichiers modifiés/ajoutés**:
  - `lib/server/securityAudit.ts` (fonction `deleteAllSecurityAuditLogs`)
  - `app/api/cron/security-audit-cleanup/route.ts` (endpoint cron sécurisé)
- **Comportement**:
  - suppression de **tous** les documents de `security_audit_logs`
  - suppression en lots (`batch`) pour respecter les limites Firestore
  - réponse avec `deletedCount` et `batchCount`

#### 2) Planification mensuelle

- **Fichier ajouté**: `vercel.json`
- **Cron configuré**:
  - `path`: `/api/cron/security-audit-cleanup`
  - `schedule`: `0 3 1 * *` (le 1er de chaque mois à 03:00 UTC)
- **Sécurisation**:
  - authentification `Authorization: Bearer <CRON_SECRET>`
  - refus `401` si secret absent/invalide

#### 3) Configuration requise

- **Fichier modifié**: `.env.example`
- **Variable ajoutée**:
  - `CRON_SECRET=replace_with_a_long_random_secret`
- **Action à faire**:
  - renseigner `CRON_SECRET` en local et sur Vercel (Environment Variables)

## Limites connues (MVP)

- Le rate limit est **en mémoire locale**:
  - non partagé entre plusieurs instances serverless.
  - en production multi-instance, migrer vers Redis/KV partagé.
- La CSP reste pragmatique (`unsafe-inline` / `unsafe-eval`) pour compatibilité MVP.
  - objectif v2: CSP avec nonce/hash et suppression progressive des directives permissives.
- Le logging frontend est **fail-open**:
  - une panne d’audit ne bloque jamais les parcours utilisateur.
