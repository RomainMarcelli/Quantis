# Journal de bord UI — Vyzor (ex-Quantis)

Ce fichier trace les avancées du chantier UI/UX mené depuis l'audit `AUDIT_UI.md`.
Append-only : les entrées sont ajoutées, jamais modifiées.

## Contexte chantier
- Branche : `feature/ui-cleanup`
- Stratégie : B (voir AUDIT_UI.md § Synthèse globale)
- Ordre d'exécution des tâches : 1 → 1b → 2 → 3 → 4

## Entrées

### [2026-04-23 09:04] TÂCHE 1 — Garde UI admin (déjà réalisée, référence)
- Fichiers créés : `lib/auth/isAdmin.ts`, `components/admin/AdminGate.tsx`
- Fichiers modifiés : `app/test-kpi/page.tsx`, `app/pdf-parser-test/page.tsx`, `.env.example`
- Choix : garde client-side uniquement (pattern `SyntheseView`), redirect `/login?next=...` si non connecté, redirect `/403` si non-admin
- Point ouvert : protection serveur des APIs debug → tâche 1b

<!-- Ajouter les nouvelles entrées en-dessous -->

### [2026-04-23 11:30] TÂCHE 1b — Protection serveur des APIs debug
- Objectif : empêcher tout utilisateur non-admin d'appeler directement `/api/pdf-parser`, `/api/pdf-parser/reduced-pdf`, `/api/vision-logs` via HTTP.
- Fichiers créés :
  - `lib/auth/isAdminServer.ts` — lit `process.env.ADMIN_EMAILS` (CSV, case-insensitive), logique identique à `isAdmin.ts` côté client
  - `lib/auth/requireAdmin.ts` — classe `AuthError extends Error { status: number }` + `requireAdmin(request)` qui vérifie le bearer token via `getFirebaseAdminAuth().verifyIdToken`, récupère l'email du token décodé, vérifie `isAdminServer(email)`. Throw `AuthError(401)` si pas de token/invalide, `AuthError(403)` si non-admin.
- Fichiers modifiés :
  - `app/api/vision-logs/route.ts` — ajout `try { await requireAdmin(request) } catch { ... }` en tête de GET et DELETE
  - `app/api/pdf-parser/reduced-pdf/route.ts` — idem sur GET
  - `app/api/pdf-parser/route.ts` — ajout en tête de GET et POST, AVANT `resolveAuthenticatedUserId` existant (laissé en place)
  - `.env.example` — ajout `ADMIN_EMAILS=` (commenté)
- Tests adaptés :
  - `app/api/pdf-parser/route.test.ts` — ajout `requireAdminMock` hoisted, `vi.mock("@/lib/auth/requireAdmin", ...)`, resolved value `{ uid: "user-1", email: "admin@test.fr" }` dans les 2 `beforeEach`. Raison : sans mock, tous les tests existants qui envoyaient un bearer token fake (`Bearer token-123`) échoueraient à la vraie vérification Firebase Admin.
  - `app/api/pdf-parser/reduced-pdf/route.test.ts` — même mock ajouté (ce fichier n'avait pas de mock auth car la route n'exigeait pas d'auth auparavant). Sans ce mock, les 3 tests du fichier auraient renvoyé 401 au lieu de 400/404/200.
- Choix technique :
  - `requireAdmin` placé **avant** `resolveAuthenticatedUserId` dans `pdf-parser/route.ts` : compatible avec l'existant (le `userId` reste utilisé plus loin pour filtrer les progress records). Deux couches empilées, mais requireAdmin court-circuite l'autre si non-admin.
  - Les messages d'erreur gardent la forme "Non autorise." / "Acces interdit." sans accent pour rester cohérents avec les tests existants qui utilisent `.toContain("Non autorise")`.
- Tests : `npm run test:unit` → **390 passed / 0 failed**.
- À valider côté infra : ajouter `ADMIN_EMAILS=admin@vyzor.fr,...` dans `.env.local` et dans les env vars Vercel (Production + Preview + Development).

### [2026-04-23 11:35] TÂCHE 2 — Boutons /pricing fonctionnels
- Objectif : rendre les 3 CTAs d'offre (Free, Pro, Enterprise) fonctionnels, sans logique de paiement.
- Fichiers modifiés :
  - `components/pricing/PricingView.tsx` — ajout d'un state `user` (subscribe à `firebaseAuthGateway`), d'un state `toast`, d'un handler `handleChooseOffer(offerName)` attaché aux 3 boutons.
- Comportements implémentés :
  - **Free** : si user non connecté → `router.push("/register")` ; si connecté → toast info "Vous êtes déjà sur l'offre Free."
  - **Pro** : toast info "Paiement bientôt disponible — contactez-nous à contact@vyzor.fr pour démarrer un essai Pro."
  - **Enterprise** : `window.location.href = "mailto:contact@vyzor.fr?subject=Demande offre Enterprise Vyzor"`
- Choix techniques :
  - Pattern `firebaseAuthGateway.subscribe` identique aux autres pages (ManualKpiEntryView, SyntheseView).
  - Pattern toast identique à `AccountView` (state `ToastState` + `useEffect` + `setTimeout` 3500ms auto-dismiss).
  - Pas de constante email centralisée dans le repo → ajout d'une const locale `CONTACT_EMAIL = "contact@vyzor.fr"` dans `PricingView.tsx` (candidate à remonter dans une config globale lors de la tâche rebranding 4).
  - Pas de refactor plus large de `PricingView.tsx` : seuls le wrapper `<section>`, l'useEffect, le handler et les 3 onClick sont ajoutés/touchés.
- Tests : `npm run test:unit` → **390 passed / 0 failed**.

<!-- Prochaines tâches : 3 (bouton Télécharger unifié) puis 4 (rebranding Vyzor) -->
