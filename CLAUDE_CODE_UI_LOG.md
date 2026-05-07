# Journal de bord UI — Vyzor (ex-Vyzor)

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

### [2026-04-23 15:54] TÂCHE 3 — Unification DownloadReportButton & suppression Exporter données
- Objectif : un composant React unique pour "Télécharger le rapport", suppression totale de "Exporter données".
- Fichiers créés :
  - `components/analysis/DownloadReportButton.tsx` — composant unifié avec state loading/erreur interne, variants `primary`/`secondary`, tailles `sm`/`md`, callbacks `onDownloadStart/Complete/Error`.
  - `components/analysis/DownloadReportButton.test.tsx` — 6 tests de rendu (disabled, label, variants, size, className).
- Fichiers modifiés :
  - `lib/synthese/downloadSyntheseReport.ts` — export du type `DownloadSyntheseReportInput` (ajout `export` devant le type).
  - `components/synthese/SyntheseDashboard.tsx` — suppression props `onDownloadReport` et `onExportData`, remplacement par `getDownloadInput?: () => DownloadSyntheseReportInput`. Bouton remplacé par `<DownloadReportButton />`. Import `Download` retiré.
  - `components/synthese/SyntheseView.tsx` — suppression des 2 callbacks passés à `SyntheseDashboard`, remplacés par `getDownloadInput`. Imports `downloadSyntheseReport` et `exportAnalysisDataAsJson` retirés.
  - `components/analysis/AnalysisDetailView.tsx` — 2 boutons `<button>` lignes 1206-1239 remplacés par `<DownloadReportButton />`. Imports `downloadSyntheseReport` et `exportAnalysisDataAsJson` retirés.
  - `components/synthese/SyntheseDashboard.test.tsx` — retrait de la prop `onDownloadReport` dans les 3 appels (plus obligatoire).
- Fichiers supprimés :
  - `lib/export/exportAnalysisData.ts` — plus aucune référence dans le code source après nettoyage (seulement dans `AUDIT_UI.md` et `CLAUDE_CODE_LOG.md` qui sont de la doc historique).
  - Dossier `lib/export/` supprimé (vide).
- Choix techniques non triviaux :
  - **API du composant** : le spec proposait `analysis: UserAnalysisRecord | null`, mais `downloadSyntheseReport()` attend un `DownloadSyntheseReportInput` complexe (companyName, greetingName, synthese construit via `buildSyntheseViewModel`, selectedYearLabel, etc.). Reconstruire ce payload dans le bouton aurait nécessité de propager 5+ props supplémentaires. Alternative choisie : `disabled?: boolean` + `getDownloadInput: () => DownloadSyntheseReportInput` (lazy, appelé uniquement au clic). L'appelant garde le contrôle du payload, et on évite un `buildSyntheseViewModel` à chaque render.
  - **Tooltip** : `title="Aucune analyse disponible"` natif HTML quand `disabled` (pas de lib tooltip dans le repo).
  - **Feedback d'erreur** : state local affiché en `<span>` rouge sous le bouton + callback `onDownloadError` optionnel (pas de `FeedbackToast` importé, qui est un toast global).
  - **Taille de test** : le repo utilise `renderToStaticMarkup` (env Vitest `node`, pas de jsdom). Les cas loading/erreur/clic ne sont pas couverts unitairement car ils nécessiteraient d'ajouter `@testing-library/react` + jsdom — hors-périmètre.
- Tests : `npm run test:unit` → **396 passed / 0 failed** (393 avant + 6 nouveaux = 399 ; 3 skipped inchangés).
- À valider côté humain :
  - Le bouton apparaît maintenant en style `secondary` (border blanc/15, neutre) partout. Avant, `/analysis` l'affichait en doré primaire. Valider que l'uniformisation secondaire est bien la ligne choisie (l'audit suggérait soit primaire soit secondaire — j'ai suivi le défaut `secondary` du spec).
  - Action recommandée : aller sur `/synthese` et `/analysis/[id]` en local et confirmer visuellement le rendu.

### [2026-04-23 16:05] TÂCHE 3b — Repositionnement DownloadReportButton
- Objectif : ancrer le bouton à la barre de tabs sur `/analysis` et dans l'en-tête du cockpit sur `/synthese` (plus de bouton isolé en haut). Rendre le variant `secondary` un peu plus visible.
- Fichiers modifiés :
  - `components/analysis/DownloadReportButton.tsx` — variant `secondary` : `border-white/15 bg-white/5 text-white/80 hover:bg-white/10` → `border-white/25 bg-white/5 text-white/90 hover:bg-white/15 hover:border-white/40 hover:text-white`.
  - `components/analysis/DownloadReportButton.test.tsx` — mise à jour du test du variant secondary (classes `border-white/25` + `text-white/90`).
  - `components/dashboard/navigation/DashboardFinancialTestMenu.tsx` — ajout prop `rightSlot?: ReactNode` insérée dans le wrapper interne qui avait déjà `xl:justify-between`. Aucun refactor de la structure.
  - `components/analysis/AnalysisDetailView.tsx` — suppression du `<div className="mb-3 flex items-center justify-between">` qui isolait le bouton en haut. Le bouton est désormais passé via `rightSlot={<DownloadReportButton .../>}` à `<DashboardFinancialTestMenu>`. Une seule instance sur la page.
  - `components/dashboard/DashboardLayout.tsx` — ajout prop `headerAction?: ReactNode` inséré comme 3e enfant de la colonne `flex-col items-end` droite du header (sous les 2 badges de statut, séparé par `mt-1`).
  - `components/synthese/SyntheseDashboard.tsx` — retrait du bouton du header precision-card ("Analyse du ..."). Simplification du header (plus de `md:flex-row`, une seule colonne d'info). Bouton passé via `headerAction={<DownloadReportButton .../>}` à `<DashboardLayout>`. Une seule instance sur la page.
- Option choisie sur `/synthese` : **Option B** (bouton sur une ligne séparée sous les badges).
  - Justification : les badges statut sont en `text-[11px] font-mono uppercase`, une hauteur visuelle très différente du bouton. Les aligner côte à côte aurait créé un mix visuel incohérent. La ligne séparée respecte la hiérarchie (statut d'analyse d'abord, action ensuite) et ne casse pas la responsive (la colonne `flex-col items-end` est déjà empilée verticalement).
- Rendu visuel final attendu :
  - `/analysis` : barre `DashboardFinancialTestMenu` avec les tabs à gauche et le bouton Télécharger le rapport à droite, même hauteur visuelle, dans la même `precision-card`. En-dessous de `xl` breakpoint, le bouton passe sous les tabs (wrapper existant `flex-col gap-2 xl:flex-row`).
  - `/synthese` : header `DashboardLayout` — titre "Cockpit financier" + sous-titre à gauche, badges + bouton à droite (bouton en 3e ligne dans la colonne droite). Le header precision-card au-dessus (Analyse du ... Parser V2) est conservé mais sans bouton.
- Tests : `npm run test:unit` → **396 passed / 0 failed** (2 runs nécessaires — premier run = 3 timeouts flakys non liés sur live-parser-debug + pdfPageExtractor + pdf-parser/route, 2e run OK).

### [2026-04-23 16:30] BUG-FIX — Écran noir au reload (AuthGate pattern)
- **Bug** : reload sur `/synthese` ou `/analysis` (user connecté) → écran complètement noir, aucun contenu. Contournement = repasser par `/` + "Se connecter".
- **Cause root** : chaque page authentifiée fait `firebaseAuthGateway.subscribe` + `router.replace(...)` dans le callback. Combiné au flag `isSessionExpired` qui peut forcer `listener(null)` (localStorage `sessionStartedAt` corrompu/cleared — notamment via `getCurrentUser()` qui clearait le localStorage destructivement quand `auth.currentUser` était encore null au premier render), on obtient un redirect prématuré pendant la restauration Firebase. La nav client-side unmount le composant → body dark visible = écran noir.

- **Fichiers créés** :
  - `components/auth/AuthGate.tsx` — wrapper client avec `useState<"loading"|"authenticated"|"unauthenticated">`, subscribe Firebase, redirect uniforme `/login?next=<pathname>`, fallback de chargement visible. Expose `useAuthenticatedUser()` via React Context. Throw si utilisé hors AuthGate.
  - `components/auth/AuthGate.test.tsx` — 3 tests (loading fallback par défaut, custom loadingFallback, throw hors context).

- **Fichiers modifiés** :
  - `services/auth.ts` — `getCurrentUser()` : suppression de `clearSessionLifetimeContext()` dans la branche `!auth.currentUser`. Le getter devient pur (plus d'effet de bord destructif). La logique de cleanup reste dans `handleAuthStateChange` et `forceSessionLogout`.
  - `app/synthese/page.tsx`, `app/analysis/page.tsx`, `app/analysis/[id]/page.tsx`, `app/account/page.tsx`, `app/documents/page.tsx`, `app/settings/page.tsx` — wrap du View dans `<AuthGate>`.
  - `components/synthese/SyntheseView.tsx` — suppression du `useEffect` subscribe + redirect + du `useState<AuthenticatedUser | null>(null)`. Remplacé par `const { user } = useAuthenticatedUser()`. L'effet de chargement de data garde `[user]` en deps.
  - `components/analysis/AnalysisDetailView.tsx` — suppression du `useEffect` subscribe + redirect + du state `loadingAuth` + des early returns "Chargement de la session"/"Session expirée" (lignes 791-812). Remplacé par `const { user } = useAuthenticatedUser()`.
  - `components/account/AccountView.tsx` — même nettoyage. Les `if (!user)` internes de handlers (garde-fous TypeScript) sont conservés, inoffensifs.
  - `components/documents/DocumentsView.tsx` — suppression du `useState(() => firebaseAuthGateway.getCurrentUser())`, du `useEffect` subscribe, et du placeholder "Connectez-vous pour accéder". Remplacé par `useAuthenticatedUser()`.
  - `components/LoginForm.tsx` — la détection de session active passe d'un `getCurrentUser()` sync (race condition au reload) à un `subscribe` async. État `isCheckingSession` reste initialement `true`, passe à `false` après premier callback Firebase avec user absent. Si user détecté → redirect vers `safePostLoginRedirect` (qui lit `?next=<path>`).

- **Pages volontairement NON wrappées dans AuthGate** :
  - `app/upload/page.tsx` et `app/upload/manual/page.tsx` — flow guest opérationnel (user `null` autorisé, redirect post-analysis vers `/register`). Continue d'utiliser `firebaseAuthGateway.getCurrentUser()` + `subscribe` local en pattern dual-mode.
  - `app/pricing/page.tsx` — publique.
  - `app/login/page.tsx`, `app/register/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx` — publiques.
  - Pages debug `/pdf-parser-test` et `/test-kpi` déjà protégées par `AdminGate`.
  - Pages d'erreur (`/401`, `/403`, `/500`, `/501`) — statiques.

- **Choix techniques non triviaux** :
  - **Redirect uniforme vers `/login?next=<pathname>`** pour toutes les pages wrappées (avant : mix de `/` et `/login`). Meilleur UX : retour automatique post-login sur la page demandée (le `LoginForm` lit déjà le param `next`, défaut `/synthese`).
  - **AuthContext minimal** : expose uniquement `{ user: AuthenticatedUser }`. Pas de `loading`/`unauthenticated` exposés, car AuthGate ne rend les children QUE quand `status === "authenticated"`. Hook `useAuthenticatedUser()` throw si hors context = garantie de non-null côté consommateur.
  - **`requireVerified: true` par défaut** sur AuthGate : emailVerified = true obligatoire, sinon auto-signout + redirect /login (pattern existant conservé).
  - **Fallback loading dark** : `<section className="precision-card">Chargement de la session…</section>` (thème sombre, couleurs cohérentes avec le reste de l'app). Customisable via prop `loadingFallback`.
  - **LoginForm garde son propre subscribe** (pas wrappé dans AuthGate car c'est une page publique + gestion spécifique de la redirection post-login). Mais sa logique async évite désormais la même race condition.

- **Tests** : `npm run test:unit` → **399 passed / 0 failed** ✅ (+3 nouveaux tests AuthGate).

- **Scénarios manuels à valider par l'humain** :
  - [ ] Reload sur `/synthese` connecté → loader "Chargement de la session…" bref puis contenu. Plus d'écran noir.
  - [ ] Reload sur `/analysis` connecté → idem.
  - [ ] Reload sur `/analysis/[id]` connecté → idem.
  - [ ] Accès `/synthese` en incognito → redirect `/login?next=%2Fsynthese` et après login, retour automatique sur `/synthese`.
  - [ ] Logout depuis `/documents` → redirect propre vers `/login`, pas d'écran noir.
  - [ ] Accès `/account` connecté → profil chargé normalement.
  - [ ] Accès `/settings` non connecté → redirect `/login?next=%2Fsettings`.
  - [ ] Flow guest upload PDF intact : `/upload` sans compte, analyse, redirect `/register` avec analyse persistée.

### [2026-04-23 16:42] BUG-FIX — LoginForm écran noir au mount
- **Symptôme** : accès `/login` non connecté → écran quasi-noir, formulaire absent. L'utilisateur voit seulement un petit texte "Vérification de session…" centré sur fond dark (ressemble à un écran noir).
- **Diagnostic précis** : la Partie 5 du fix AuthGate avait initialisé `isCheckingSession` à `true` + early return rendant un `<section>` avec `<p>Vérification de session…</p>` tant que le subscribe Firebase n'avait pas émis son premier callback. Dans certains cas (Firebase SDK déjà initialisé dans un autre onglet via IndexedDB partagé, HMR Turbopack qui garde l'instance, ou simple latence), le callback tarde → formulaire bloqué indéfiniment sur ce petit message. Le fond sombre + texte minuscule donne l'impression d'écran noir.
- **Fichier modifié** : `components/LoginForm.tsx`
  - Suppression du state `isCheckingSession` (devenu inutile avec l'approche A)
  - Suppression de l'early return lignes 330-336 (`if (isCheckingSession) return <section>Vérification...</section>`)
  - Le subscribe `firebaseAuthGateway.subscribe` reste en place pour rediriger si user déjà connecté au mount. Le setIsCheckingSession(false) obsolète est retiré du callback.
- **Approche retenue** : **A (minimale)** — le formulaire est affiché immédiatement dès le mount. Si le subscribe détecte ensuite un user déjà authentifié (session restaurée, navigation depuis une page connectée), redirect vers `safePostLoginRedirect` avec flash formulaire acceptable. Justification : zéro risque d'écran noir, flash rare (< 1s) et accepté par le spec.
- **Tests** : `npm run test:unit` → **399 passed / 0 failed** ✅.
- **Scénarios à valider manuellement** :
  - [ ] `/login` non connecté → formulaire visible immédiatement.
  - [ ] `/login?next=/synthese` → formulaire + submit → redirect `/synthese`.
  - [ ] Utilisateur déjà connecté qui visite `/login` → flash formulaire puis redirect auto vers `/synthese` (ou `?next=<path>`).
  - [ ] Non régression : reload `/synthese` connecté → toujours OK (AuthGate pattern).

<!-- Prochaines tâches : 4 (rebranding Vyzor) -->
