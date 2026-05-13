# Audit UI/UX — Vyzor (ex-Vyzor)

**Date** : 2026-04-20
**Branche** : main
**Périmètre** : toutes les pages dans `app/` hors routes API (21 pages + 1 layout racine)

---

## Layout racine

- **Fichier** : `app/layout.tsx`
- **Rôle** : bootstrap HTML (polices Inter + JetBrains Mono), providers globaux, métadonnées.
- **Providers/Contexts globaux** :
  - `ThemeProvider` : dark/light avec persistance localStorage + sync profil
  - `ProductTourProvider` : onboarding pas-à-pas, événements custom
  - `ScrollRevealInitializer` : animations d'apparition au scroll
- **Métadonnées** : title = "Vyzor" (pas Vyzor), description "Vyzor — Plateforme d'intelligence financière", favicon `/images/LogoV3.png`.
- **Configuration HTML** : `lang="fr"`, `class="dark"`, `data-theme="dark"`, body class `premium-app-shell`.
- **Observations** :
  - Marque rebrandée Vyzor mais **title / description / favicon / provider names restent "Vyzor"** — inconsistance à traiter lors d'une passe branding globale.

---

# 1. Pages publiques

## Page : Accueil public
- **Route** : `/`
- **Fichier** : `app/page.tsx`
- **Rôle** : Landing page publique avec proposition de valeur et CTAs d'évaluation.
- **Composants principaux utilisés** :
  - Icônes lucide : `ArrowRight`, `BarChart3`, `FileSpreadsheet`, `Sparkles`
  - `next/image`, `next/link`
- **Boutons / actions principaux présents** :
  - "Se connecter" → `/login` (header, lien)
  - "Créer un compte" → `/register` (header, lien)
  - "Évaluer votre santé financière" → `/upload` (CTA doré principal)
  - "Saisie manuelle" → `/upload/manual` (lien secondaire)
- **Données affichées** : logo + titre "Évaluez votre santé financière en quelques minutes", description (mentionne Excel uniquement), parcours en 3 étapes, overlays noise/spotlight.
- **Dépendances** : aucune API, aucun hook — page statique.
- **Observations** :
  - Description ne mentionne que "fichier Excel" alors que l'app accepte aussi PDF (cible principale).
  - Aucun élément marketing (fonctionnalités, FAQ, tarifs) hors CTA → volontaire pour MVP mais à clarifier.
  - Aucun lien vers `/pricing` depuis l'accueil.

## Page : Connexion
- **Route** : `/login`
- **Fichier** : `app/login/page.tsx` + `components/LoginForm.tsx`
- **Rôle** : Authentification avec bascule possible vers inscription, gestion du redirect post-login.
- **Composants principaux utilisés** : `LoginForm` (dual login/register), `VyzorLogo`, `VyzorSelect`, `FeedbackToast`.
- **Boutons / actions principaux présents** :
  - "Retour" → `/` (flèche header)
  - Tabs "Connexion" / "Inscription"
  - "Se connecter" (submit) → `loginWithEmailPassword()`
  - "Mot de passe oublié ?" → `/forgot-password`
  - "S'inscrire" → bascule mode register
- **Données affichées** : email, mot de passe (avec show/hide), erreurs inline, toast, message post-inscription.
- **Dépendances** : `firebaseAuthGateway`, `useProductTour`, `saveUserProfile`, `markUserEmailAsVerified`, `logClientSecurityEvent`. URL param `next` (défaut `/synthese`).
- **Observations** :
  - Composant dual (login + register) **~180 lignes complexes** — difficile à tester isolément.
  - Formulaire register long sur mobile (companyName, SIREN, companySize, sector, usageObjectives).
  - Message succès avec **accents manquants** ("Compte cree", "verification", "revenez vous connecter").

## Page : Inscription
- **Route** : `/register`
- **Fichier** : `app/register/page.tsx` + `LoginForm` (mode register)
- **Rôle** : Page d'enregistrement avec pré-remplissage depuis URL params.
- **Composants principaux utilisés** : `LoginForm` en mode register, validators `isCompanySizeValue`, `isSectorValue`.
- **Boutons / actions principaux présents** : identiques à `/login` mode register.
- **Données affichées** : pré-remplissage possible via URL params (`companySize`, `sector`, `next`).
- **Dépendances** : `searchParams` async (RSC), validation côté serveur.
- **Observations** :
  - Logique de validation dupliquée entre la page serveur (RSC) et `LoginForm` client.
  - Redirect défaut post-register : `/synthese`.

## Page : Mot de passe oublié
- **Route** : `/forgot-password`
- **Fichier** : `app/forgot-password/page.tsx` + `components/auth/ForgotPasswordForm.tsx`
- **Rôle** : Demande email de réinitialisation de mot de passe.
- **Composants principaux utilisés** : `ForgotPasswordForm`, `VyzorLogo`, `FeedbackToast`.
- **Boutons / actions principaux présents** :
  - "Envoyer un lien de réinitialisation" (submit) → `requestPasswordReset()`
  - "Retour à la connexion" → `/`
- **Données affichées** : champ email, message succès après envoi, toast.
- **Dépendances** : `firebaseAuthGateway`, `requestPasswordReset`, `validateForgotPasswordInput`.
- **Observations** :
  - Design `quantis-panel` + `mesh-gradient` **claire**, incohérent avec le dark theme global de `/login` et `/`.
  - Pas d'énumération email (bon pour sécurité mais UX aveugle si email inexistant).

## Page : Réinitialisation mot de passe
- **Route** : `/reset-password`
- **Fichier** : `app/reset-password/page.tsx` + `components/auth/ResetPasswordForm.tsx`
- **Rôle** : Finalisation du reset avec vérification du token Firebase `oobCode`.
- **Composants principaux utilisés** : `ResetPasswordForm`, `VyzorLogo`, `FeedbackToast`, icônes `CheckCircle2/Circle/Eye/EyeOff/Info`.
- **Boutons / actions principaux présents** :
  - "Mettre à jour le mot de passe" (submit) → `confirmPasswordResetFlow()`
  - "Demander un nouveau lien" → `/forgot-password` (si lien invalide)
  - "Retour à la connexion" → `/`
- **Données affichées** : 3 états (vérification / invalide / valide), règles mot de passe en chips (6+ chars, 1 maj, 1 min, 1 chiffre, 1 spécial, match), toast.
- **Dépendances** : `verifyPasswordResetLink`, `confirmPasswordResetFlow`, `validateResetPasswordInput`, `getPasswordRuleChecks`, `logClientSecurityEvent`.
- **Observations** :
  - Design `quantis-panel` clair, **même incohérence** que `/forgot-password`.
  - Après succès, pas de redirection auto vers login → utilisateur doit cliquer lien manuel.
  - Grille règles en 3 colonnes peu lisible sur mobile.

## Page : Tarification
- **Route** : `/pricing`
- **Fichier** : `app/pricing/page.tsx` + `components/pricing/PricingView.tsx`
- **Rôle** : Présentation des 3 offres (Free, Pro recommandé, Enterprise).
- **Composants principaux utilisés** : `PricingView`, lucide `ArrowRight`/`Check`/`ShieldCheck`/`Sparkles`, `VyzorLogo`.
- **Boutons / actions principaux présents** :
  - "Retour à l'analyse" → `/analysis` (header)
  - "Choisir Free" → **aucune action attachée**
  - "Plan recommandé" (Pro) → **aucune action attachée**
  - "Choisir Entreprise" → **aucune action attachée**
- **Données affichées** : alerte "Paiement non actif (mode démonstration)", 3 cartes offres (0/49/sur devis).
- **Dépendances** : `useRouter`, data statique en const `OFFERS`.
- **Observations** :
  - **Boutons CTA inertes** : les 3 boutons d'offre n'ont pas de `onClick` → clic = rien ne se passe (confusion UX).
  - Le lien "Retour à l'analyse" suppose que l'utilisateur est authentifié → pas de garde d'auth mais pas de CTA inscription non plus.
  - Pricing hardcodé (pas scalable).

---

# 2. Pages core authentifiées

## Page : Dashboard (redirection)
- **Route** : `/dashboard`
- **Fichier** : `app/dashboard/page.tsx`
- **Rôle** : Redirection héritée vers `/synthese`.
- **Composants principaux utilisés** : aucun (`next/navigation.redirect`).
- **Boutons / actions principaux présents** : aucun.
- **Données affichées** : N/A.
- **Dépendances** : `redirect` Next.js.
- **Observations** : Route héritée. À nettoyer si aucun lien externe ne pointe dessus.

## Page : Upload
- **Route** : `/upload`
- **Fichier** : `app/upload/page.tsx` + `components/upload/UploadPageView.tsx`
- **Rôle** : Import de PDF/Excel/CSV avec saisie contexte entreprise et lancement du pipeline Claude Vision.
- **Composants principaux utilisés** : `UploadPageView`, `UploadProcessingOverlay`, `VyzorSelect`, `VyzorLogo`, `StepCard`, `InlineError`.
- **Boutons / actions principaux présents** :
  - "Accueil" → `/`
  - "Synthèse" → `/synthese` (si connecté)
  - Dropzone cliquable + drag-n-drop
  - "Vider" (si fichiers sélectionnés) → reset
  - **"Lancer l'analyse"** (gold premium) → `onSubmit()` avec upload Firebase Storage puis `POST /api/analyses`
  - "Saisie manuelle" → `/upload/manual`
  - "Recommencer" → `resetUploadForm()`
- **Données affichées** : 3 étapes, dropzone (PDF/Excel/CSV, max 20 Mo), fichiers sélectionnés, formulaire contexte optionnel (taille + secteur), overlay de traitement.
- **Dépendances** : `firebaseAuthGateway`, `firebaseStorage.ref().uploadBytes()`, `POST /api/analyses` (JSON ou FormData), events onboarding.
- **Observations** :
  - Pas de bouton export/téléchargement (normal à ce stade).
  - Flow guest (`guest-${Date.now()}`) → localStorage `pendingAnalysis` → redirect `/register` après analyse.
  - Validation uniquement après submit (pas live).

## Page : Upload manuel
- **Route** : `/upload/manual`
- **Fichier** : `app/upload/manual/page.tsx` + `components/upload/ManualKpiEntryView.tsx`
- **Rôle** : Saisie manuelle des KPI quand l'utilisateur n'a pas de PDF.
- **Composants principaux utilisés** : `ManualKpiEntryView`, `VyzorLogo`, `FormBlock`, `InputField`.
- **Boutons / actions principaux présents** :
  - "Retour" → `history.back()` ou `/upload`
  - **"Calculer et enregistrer"** (gold premium) → `onSubmit()`
  - "Retour à l'upload" → `/upload`
  - `<details>` "D. Optionnel (avancé)"
- **Données affichées** : 4 blocs de formulaire (A. Activité, B. Rentabilité, C. Trésorerie & BFR, D. Optionnel), champs avec tooltips, errors inline.
- **Dépendances** : `buildCompleteKpis`, `calculateVyzorScore`, `createEmptyMappedFinancialData`, `saveAnalysisDraft`, redirect `/register?next=/upload/manual` si non connecté.
- **Observations** :
  - Pas de sauvegarde brouillon (perte si fermeture).
  - Validation métier stricte (DSO/DPO ≥0, immo_net ≤ immo_brut, CA > 0).

## Page : Synthèse
- **Route** : `/synthese`
- **Fichier** : `app/synthese/page.tsx` + `components/synthese/SyntheseView.tsx` + `SyntheseDashboard.tsx`
- **Rôle** : Lecture executive (Vyzor Score, KPI clés, alertes, plan d'action) + navigation inter-analyses.
- **Composants principaux utilisés** : `SyntheseView`, `SyntheseDashboard`, `GlobalSearchBar`, `VyzorLogo`, `NavRow`, `FeedbackToast`.
- **Boutons / actions principaux présents** :
  - **Header (precision-card)** : icônes Settings → `/settings`, Lock → `/pricing`, UserCircle2 → `/account?from=analysis`, LogOut → `onLogout()`
  - **Sidebar** : Synthèse (actif), Tableau de bord → `/analysis`, Documents → `/documents`, sélecteur d'année, bloc Compte
  - **Header cockpit (SyntheseDashboard)** :
    - **"Télécharger le rapport"** (lucide `Download`, border blanc/15 secondaire) → `onDownloadReport()` → `downloadSyntheseReport()`
    - **"Exporter données"** (conditionnel si `onExportData` défini, border blanc/10 tertiaire très discret) → `exportAnalysisDataAsJson()`
  - "Importer un nouveau fichier" / "Saisie manuelle" (si pas de données)
- **Données affichées** : nom entreprise, Vyzor Score, KPI clés (CA, Cash, EBE), scorePiliers, alertes, plan d'action, date d'analyse, badge parserVersion (v1/v2).
- **Dépendances** : `listUserAnalyses`, `getUserProfile`, `persistPendingAnalysisForUser`, `downloadSyntheseReport`, `exportAnalysisDataAsJson`, `SEARCH_NAVIGATE_EVENT`, localStorage `sidebarCollapsedPreference`.
- **Observations** :
  - Boutons export implémentés **dans le composant enfant** `SyntheseDashboard`, pas dans `SyntheseView`.
  - Pas de barre sticky / flottante.

## Page : Tableau de bord (Analyses)
- **Route** : `/analysis`
- **Fichier** : `app/analysis/page.tsx` + `components/analysis/AnalysisDetailView.tsx`
- **Rôle** : Vue dashboard multi-onglets avec KPI détaillés, comparaison N-1, gestion des fichiers sources et des dossiers.
- **Composants principaux utilisés** : `AnalysisDetailView` (~1500 lignes), `GlobalSearchBar`, `DashboardFinancialTestMenu`, `DashboardFinancialTestContent`.
- **Boutons / actions principaux présents** :
  - Nav sidebar : Tableau de bord (actif) / Synthèse / Documents
  - Header icônes : Settings / Lock / UserCircle / LogOut
  - **Barre actions (lignes 1206-1239 AnalysisDetailView)** :
    - **"Télécharger le rapport"** (lucide `FileText`, **border quantis-gold/30**, style **primaire doré**) → `downloadSyntheseReport()` inline
    - **"Exporter données"** (sans icône, border blanc/10 tertiaire) → `exportAnalysisDataAsJson()` inline
  - "Actualiser l'analyse"
  - Dropzone upload (glisser-déposer / parcourir)
  - "Saisie manuelle des données" → `/upload/manual`
  - Sur fichiers sources : "Tout sélectionner" / "Tout désélectionner" / "Supprimer la sélection"
  - Sur dossiers : "Renommer" / "Supprimer" / "Nouveau dossier" (Plus icon)
- **Données affichées** : dashboard avec onglets (Création de valeur, Solvabilité, Rentabilité, Liquidité, Trésorerie, Croissance), KPI comparés N/N-1, fichiers sources, dossiers.
- **Dépendances** : `listUserAnalyses`, `getUserAnalysisById`, `deleteUserAnalysisById`, `saveAnalysisDraft`, `renameUserFolder`, `deleteUserFolderAnalyses`, `listUserFolders`, `createUserFolder`, `findPreviousAnalysisByFiscalYear`, `downloadSyntheseReport`, `exportAnalysisDataAsJson`.
- **Observations** :
  - **Composant géant (~1500 lignes)** — candidat à extraction (nav, actions, upload zone, liste fichiers, gestion dossiers).
  - **Style "Télécharger le rapport" DIVERGENT** de `/synthese` : ici doré/primaire, là gris/secondaire. → **sujet central de la tâche 2**.
  - Icône divergente aussi : `FileText` ici vs `Download` sur `/synthese`.

## Page : Détail analyse
- **Route** : `/analysis/[id]`
- **Fichier** : `app/analysis/[id]/page.tsx`
- **Rôle** : Wrapper serveur qui passe l'`id` à `AnalysisDetailView` en mode analysis spécifique.
- **Composants principaux utilisés** : `AnalysisDetailView` avec `analysisId={id}`, `viewMode="analysis"`.
- **Boutons / actions principaux présents** : identiques à `/analysis` (même composant).
- **Données affichées** : identiques à `/analysis` mais filtrée sur l'ID.
- **Dépendances** : `params: Promise<{ id: string }>`.
- **Observations** :
  - Pas de 404 explicite si ID invalide → affiche "Aucune analyse disponible".
  - Duplication de route en réalité gérée par le même composant → la page est un simple wrapper.

## Page : Documents
- **Route** : `/documents`
- **Fichier** : `app/documents/page.tsx` + `components/documents/DocumentsView.tsx`
- **Rôle** : Gestion des analyses sous forme de galerie organisée par dossiers (tabs).
- **Composants principaux utilisés** : `DocumentsView`, `FolderTabs`, `AnalysisCardGrid`, `EmptyFolderState`, `FolderDialog`, `ConfirmDialog`.
- **Boutons / actions principaux présents** :
  - **"Nouvelle analyse"** (header droite, bouton doré) → `/upload`
  - Nav sidebar : Tableau de bord / Synthèse / Documents (actif) / Réglages / Compte / Déconnexion
  - Sur chaque dossier (tabs) : Renommer / Supprimer
  - Sur chaque analysis card : Déplacer / Supprimer
  - **Aucun bouton "Télécharger le rapport" ni "Exporter données"** sur cette page (vérifié dans le code)
- **Données affichées** : dossiers en tabs, grille de cartes d'analyses, date de dernière MAJ, compteur par dossier, message vide.
- **Dépendances** : `listUserAnalyses`, `listUserFolders`, `deleteUserAnalysisById`, `moveAnalysisToFolder`, `deleteUserFolderAnalyses`, `renameUserFolder`, `createUserFolder`.
- **Observations** :
  - **Contradiction avec l'énoncé initial** : la tâche mentionnait un bouton "Télécharger le rapport" sur `/documents` avec un style différent — **il n'existe pas dans le code actuel**. Possible qu'il ait été envisagé, ou qu'on veuille l'y ajouter.
  - Sidebar dupliquée avec celle de `/analysis` (code à factoriser).
  - UX déplacement d'analyse pas claire depuis la card.

## Page : Compte
- **Route** : `/account`
- **Fichier** : `app/account/page.tsx` + `components/account/AccountView.tsx`
- **Rôle** : Gestion profil (personnel + entreprise), suppression données ou compte.
- **Composants principaux utilisés** : `AccountView`, `VyzorLogo`, `VyzorSelect`, `FeedbackToast`, modales de confirmation.
- **Boutons / actions principaux présents** :
  - Header : "Retour à l'analyse" ou "Aller à l'upload" (gold premium) / "Se déconnecter" (rose danger)
  - Section profil : "Mettre à jour le profil" (gold premium)
  - Section sensible : "Supprimer mes statistiques" / "Supprimer mon compte" (rose danger)
  - Modales : "Annuler" / "Confirmer la suppression des statistiques" / "Supprimer mon compte" (après saisie "SUPPRIMER MON COMPTE")
- **Données affichées** : email (lecture seule), SIREN, prénom, nom, entreprise, taille, secteur.
- **Dépendances** : `loadAccountProfile`, `saveAccountProfile`, `purgeAnalysisData`, `deleteAccountEverywhere`, `logClientSecurityEvent`.
- **Observations** :
  - Toast auto-dismiss **3.5s**.
  - Deux flows de suppression distincts avec confirmations différentes (texte pour compte).
  - Pas d'export RGPD des données avant suppression.

## Page : Paramètres
- **Route** : `/settings`
- **Fichier** : `app/settings/page.tsx` + `components/settings/SettingsView.tsx`
- **Rôle** : Préférences métier + session + relance du guide.
- **Composants principaux utilisés** : `SettingsView`, `VyzorLogo`, `FeedbackToast`, `ToggleRow`.
- **Boutons / actions principaux présents** :
  - Header : "Retour à l'analyse" → `/analysis`
  - Préférences métier : input "Exercice fiscal par défaut" (2000-2100), select "Format d'export préféré" (xlsx/csv/pdf), 3 toggles (debug, auto-open, confirmation destructive)
  - Sécurité & session : toggle "Mode sombre / Mode clair", "Revoir le guide" (gold premium)
  - Actions : "Réinitialiser" / "Enregistrer" (gold premium)
- **Données affichées** : préférences sauvées dans localStorage clé `appPreferences`.
- **Dépendances** : `loadAppPreferences`, `saveAppPreferences`, `resetAppPreferences`, `useTheme`, `useProductTour`.
- **Observations** :
  - Toast auto-dismiss **2.6s** ≠ celui de `/account` (3.5s) — **incohérence de timing**.
  - Le select "Format d'export préféré" (xlsx/csv/pdf) **n'est pas consommé** par `/synthese` ni `/analysis` (qui appellent `downloadSyntheseReport` et `exportAnalysisDataAsJson` sans passer le format).
  - Toggle switch rendu en JSX custom — pas de composant réutilisable dédié.
  - "Revoir le guide" → pas de toast de retour visuel.
  - Message "Astuce : la suppression complète du compte reste disponible dans l'onglet Compte" → il n'y a pas d'onglet, c'est une page.

---

# 3. Pages debug/test

## Page : Test du parser PDF
- **Route** : `/pdf-parser-test`
- **Fichier** : `app/pdf-parser-test/page.tsx`
- **Rôle** : Page de debug pour valider le parser PDF (progression, résultats bruts, export diagnostic).
- **Composants principaux utilisés** : `ProcessingLoader`, `AnalysisResultPanel`.
- **Boutons / actions principaux présents** :
  - "Tester /api/pdf-parser" (gold principal, submit du form)
  - "Charger historique PDF" (gris secondaire)
  - "📥 Exporter diagnostic complet" (gold, si succès, download JSON client-side)
  - "📋 Logs Vision LLM" (xs, dev only) / "🗑️ Vider les logs" (xs, dev only)
  - Input file `accept=".pdf"`
- **Données affichées** : progression temps réel, parserVersion, confidenceScore, warnings, quantisData, mappedData, kpis, pdfExtraction, historique.
- **Dépendances** : `POST /api/pdf-parser`, polling `fetchProgressSnapshot`, `fetchParserHistory`, `/api/vision-logs` (GET/DELETE dev only), `useProcessingMetrics`.
- **Observations** :
  - **Page de debug accessible en production** sans guard admin → risque d'exposition (diagnostic JSON, vision logs).
  - Polling artisanal avec flags `shouldStopPolling`, `isPollingRequestInFlight` — candidat à un hook dédié.
  - Émojis dans labels → peu cohérent avec le reste de l'app.

## Page : Test KPI
- **Route** : `/test-kpi`
- **Fichier** : `app/test-kpi/page.tsx`
- **Rôle** : Wrapper serveur pour `KpiBeforeAfterView` (comparaison KPI stockés vs recalculés).
- **Composants principaux utilisés** : `KpiBeforeAfterView`.
- **Boutons / actions principaux présents** :
  - Sélecteur d'analyse (dropdown)
  - "Rafraichir"
  - "Ouvrir la page détail" (gold) → `/analysis`
- **Données affichées** : MappedData/RawData bruts, table KPI avec formules, comparaison stocké/recalculé (OK/Écart), JSON brut.
- **Dépendances** : `listUserAnalyses`, `computeKpis`, `resolveAnalysisFiscalYear`, `compareStoredAndRecalculatedKpis`, `KPI_FORMULA_CATALOG`.
- **Observations** :
  - **Page de debug en production** sans garde admin.
  - "Écart" affiché sans seuil numérique → masque potentiellement des rounding errors.

---

# 4. Pages d'erreur

## Page : 401 Non autorisé
- **Route** : `/401` • **Fichier** : `app/401/page.tsx`
- **Rôle** : Erreur 401 (session absente/expirée).
- **Composant** : `ErrorStatusPage`. **Bouton** : "Retour à la connexion" → `/`.
- **Observations** : Page simple, conforme.

## Page : 403 Accès interdit
- **Route** : `/403` • **Fichier** : `app/403/page.tsx`
- **Rôle** : Erreur 403 (droits insuffisants).
- **Composant** : `ErrorStatusPage`. **Bouton** : "Retour à l'accueil" → `/`.
- **Observations** : Libellés FR clairs.

## Page : 500 Erreur serveur
- **Route** : `/500` • **Fichier** : `app/500/page.tsx`
- **Rôle** : Erreur 500 (défaillance serveur).
- **Composant** : `ErrorStatusPage`. **Bouton** : "Retour à l'accueil" → `/`.
- **Observations** : Simple et approprié.

## Page : 501 Non implémentée
- **Route** : `/501` • **Fichier** : `app/501/page.tsx`
- **Rôle** : Erreur 501 (fonctionnalité en préparation).
- **Composant** : `ErrorStatusPage`. **Bouton** : "Retour à l'accueil" → `/`.
- **Observations** : Page appropriée.

---

# Synthèse globale

## Incohérences UI/UX entre pages

### Boutons "Télécharger le rapport" — 2 implémentations divergentes
| | `/synthese` (SyntheseDashboard l.61) | `/analysis` + `/analysis/[id]` (AnalysisDetailView l.1206-1229) |
|---|---|---|
| Label | "Télécharger le rapport" | "Télécharger le rapport" |
| Icône | lucide `Download` | lucide `FileText` |
| Style border | `border-white/15` neutre | `border-quantis-gold/30` doré |
| Style fond | `bg-white/5` | `bg-quantis-gold/10` |
| Style texte | `text-xs text-white/80` | `text-xs font-medium text-quantis-gold` |
| Padding | `py-1.5` | `py-2` |
| Coins | `rounded-lg` | `rounded-xl` |
| Hiérarchie | Secondaire | Primaire |
| Appel | `onDownloadReport` prop | `downloadSyntheseReport()` inline |

→ **2 pages, 2 styles différents pour la même action**. `/documents` **ne l'expose pas du tout**.

### Boutons "Exporter données" — 2 implémentations ~identiques
| | `/synthese` (SyntheseDashboard l.63-71) | `/analysis` + `/analysis/[id]` (AnalysisDetailView l.1230-1239) |
|---|---|---|
| Label | "Exporter données" | "Exporter données" |
| Icône | aucune | aucune |
| Style | `border-white/10 text-white/50` | `border-white/10 text-white/50` |
| Coins | `rounded-lg` | `rounded-xl` |
| Rendu | conditionnel `{onExportData ? … : null}` | toujours rendu |
| Appel | `onExportData` prop | `exportAnalysisDataAsJson()` inline |

→ Très discret (`text-white/50`) sur les 2 pages. Action "Exporter données" retourne un JSON brut (`quantis-data-…json`) peu utile pour un utilisateur métier — candidat **à supprimer** comme demandé.

### Inconsistances transversales

1. **Navigation** : la sidebar de `/analysis` et `/documents` est dupliquée (pas factorisée dans un composant unique).
2. **Thème auth clair vs dark app** : `/forgot-password` et `/reset-password` utilisent `quantis-panel` clair alors que `/login`, `/register`, `/` sont sombres.
3. **Timing des toasts** : 2.6s sur `/settings`, 3.5s sur `/account`, 3.5s sur `/login`.
4. **Format d'export préféré** dans `/settings` : la valeur sauvée n'est **jamais lue** par `downloadSyntheseReport` ou `exportAnalysisDataAsJson` (code mort fonctionnel).
5. **Marque Vyzor vs Vyzor** : layout root, title, meta, favicon, `VyzorLogo`, classes CSS (`quantis-panel`, `btn-gold-premium`, `quantis-gold`…) — **aucune trace de rebranding**.
6. **Pages debug en prod** : `/pdf-parser-test` et `/test-kpi` accessibles sans garde admin → risque de fuite de données techniques.
7. **Styles boutons dorés** variables : `btn-gold-premium`, `border-quantis-gold/30 bg-quantis-gold/10`, `bg-quantis-gold text-black` → au moins 3 variantes de "bouton primaire".
8. **Coins arrondis** : `rounded-lg` (Synthèse), `rounded-xl` (Analysis, Documents), `rounded-2xl` (précisions cards) — grammaire visuelle non normée.
9. **Icônes d'actions identiques utilisent des symboles différents** : "Télécharger" = `Download` vs `FileText` ; "Analyse / Synthèse" parfois `Sparkles`, parfois `LayoutDashboard`.
10. **Accents manquants** ponctuellement dans les messages ("Compte cree", "verification", "revenez vous connecter") — qualité rédactionnelle à harmoniser.
11. **Bouton Tarification inertes** : les 3 CTAs d'offre sur `/pricing` n'ont **aucun `onClick`**.

## Suggestions d'amélioration prioritaires (classées par impact)

| # | Priorité | Suggestion | Impact |
|---|---|---|---|
| 1 | Haute | **Unifier "Télécharger le rapport"** dans un composant `<DownloadReportButton>` unique (style, icône, props), utilisé sur `/synthese`, `/analysis`, `/analysis/[id]` et à ajouter sur `/documents`. | Cohérence UX + maintenance |
| 2 | Haute | **Supprimer "Exporter données"** (peu utile pour l'utilisateur final — JSON brut) + supprimer `lib/export/exportAnalysisData.ts` et les appels. | Réduction surface + clarté |
| 3 | Haute | **Rebrand complet Vyzor → Vyzor** (title, meta, logo, classes CSS, composants, fichiers). Passe dédiée. | Marque |
| 4 | Haute | **Protéger `/pdf-parser-test` et `/test-kpi`** derrière un feature flag ou une garde admin (env var, email whitelist). | Sécurité |
| 5 | Moyenne | **Factoriser la sidebar** de `/analysis` et `/documents` dans un composant `<AppSidebar>` commun. | Maintenance |
| 6 | Moyenne | **Repositionner "Télécharger le rapport"** dans un emplacement cohérent et global (ex : header d'app, barre d'action sticky, ou menu latéral — à discuter en tâche 2). | UX |
| 7 | Moyenne | **Uniformiser le thème** des pages auth (`forgot-password`, `reset-password`) avec le dark theme de `/login` et `/`. | Cohérence visuelle |
| 8 | Moyenne | **Harmoniser les toasts** : durée unique (ex: 3s), composant unique, position unique. | Qualité UX |
| 9 | Moyenne | **Attacher onClick aux CTAs de `/pricing`** (même si mode démo : toast "Paiement bientôt disponible" ou route `/501`). | UX (éviter boutons morts) |
| 10 | Basse | **Décomposer `AnalysisDetailView`** (~1500 lignes) en sous-composants dédiés (nav, dashboard, fichiers, dossiers). | Maintenance long terme |

## Code mort ou sous-utilisé identifié (à ne PAS supprimer sans validation)

- `app/dashboard/page.tsx` : redirection héritée vers `/synthese`. Utile si des liens externes pointent encore dessus.
- `lib/export/exportAnalysisData.ts` : appelé uniquement depuis les 2 boutons "Exporter données" — si on les supprime (tâche 2), le module devient candidat à suppression.
- `preferredExportFormat` dans `/settings` : sauvegardé mais jamais lu par le code d'export → soit brancher, soit retirer du formulaire.
- Pages `/pdf-parser-test` et `/test-kpi` : utiles en dev, mais exposées en prod sans garde.
- Dans `LoginForm` : refs multiples `hasDispatchedRegisterSwitchStepRef`, etc. — ok pour product tour mais pattern fragile.

---

**Fin de l'audit — en attente de validation avant d'attaquer la tâche 2.**
