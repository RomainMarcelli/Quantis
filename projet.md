# Projet Quantis - Suivi Principal

## Vision du projet

Quantis est un copilote financier B2B pour PME.
Le produit convertit des donnees comptables (Excel/PDF) en decisions exploitables via un pipeline clair:
Upload -> Parsing -> Calcul KPI -> Stockage -> Affichage.

## Fonctionnalites implementees

- Base technique Next.js App Router + TypeScript + Tailwind.
- DA "premium fintech" appliquee sur login et dashboard:
  - fond clair, anthracite, accent or
  - cartes sobrement bordees
  - hierarchie visuelle type landing Quantis
  - logo de marque centralise dans `public/images/logo.png` et integre aux ecrans principaux
- Authentification Firebase complete:
  - login email/password
  - inscription complete:
    - nom
    - prenom
    - email
    - password
    - nom entreprise
    - SIREN
    - taille entreprise
    - secteur
  - messages d'erreur metier explicites
  - affichage/masquage du mot de passe (icone oeil)
  - checklist securite mot de passe dynamique (etat par critere)
  - version UI horizontale (chips) responsive
  - feedback UX via toasts + messages inline + tooltips
  - verification email obligatoire avant acces dashboard
  - profil entreprise stocke dans `users/{uid}`
- Gestion de compte utilisateur:
  - page `/account` creee
  - affichage des informations utilisateur/entreprise
  - mise a jour du profil Firestore
  - suppression des donnees (users + analyses)
  - suppression complete du compte Firebase Auth + Firestore avec double confirmation
- Pipeline metier MVP:
  - upload de fichiers (Excel/PDF)
  - parsing serveur (`services/parsers/*`)
  - mapping financier 2033 (`services/mapping/financialDataMapper.ts`)
  - calcul KPI complet selon `Quantis_Mapping_2033SD.xlsx` (`services/kpiEngine.ts`)
    - extension KPI metier stockee: `disponibilites`, `ca`, `ebe`, `resultat_net`, `capacite_remboursement_annees`, `etat_materiel_indice`
  - stockage Firestore via SDK client authentifie (`services/analysisStore.ts`)
  - redirection post-upload vers `/analysis`
  - page `/dashboard` simplifiee en espace de depot (upload only)
  - URL simplifiee pour le dashboard: `/analysis` (sans identifiant visible)
  - support des dossiers d'analyses:
    - creation d'un dossier au premier depot
    - association des analyses a `folderName`
    - affichage des fichiers sources par dossier dans la sidebar
    - ajout de nouveaux fichiers directement depuis la page dashboard
  - nouveau dashboard decisionnel sur `/analysis/[id]`:
    - header personnalise `Hello {firstname}`
    - top cards KPI (cash, sante, alertes, runway)
    - bloc suggestions (UI future-ready)
    - score global visuel (progress ring)
    - top header app (logo, nom entreprise, acces parametres/offres/compte)
    - sections metier A/B/C/D (creation de valeur, BFR, financement, rentabilite)
    - alertes basees sur seuils fixes (vert/orange/rouge)
    - design alertes renforce (codes visuels par severite)
    - debug repliable (`rawData`, `mappedData`, `kpis`)
    - sidebar (`Dashboard`, `Analyses`, `Documents`, `Compte`)
    - profil sidebar avec avatar initial + niveau Free
  - page de test KPI avant/apres: `/test-kpi`
    - charge les analyses reelles stockees en Firestore apres upload
    - visualisation des formules appliquees a `mappedData`
    - comparaison KPI stockes vs KPI recalcules
    - affichage debug complet: `rawData`, `mappedData`, `parsedData`, `kpis`
- Historisation:
  - timestamp de creation
  - exercice fiscal (`fiscalYear`) exploitable pour filtrage
- Regles de securite Firestore:
  - fichier `firestore.rules`
  - isolation stricte par `userId`
  - suppression autorisee uniquement pour les documents du proprietaire
- Qualite logicielle renforcee:
  - suite unitaire etendue (auth, compte, pipeline, parsing, stores, view-model dashboard)
  - lint ESLint v9 operationnel
  - typecheck TypeScript sans erreur (`tsc --noEmit`)

## Fonctionnalites en cours

- Robustification du parsing PDF (cas reels multi-pages / tableaux complexes).
- Enrichissement du schema des donnees extraites (granularite comptable plus fine).

## Prochaines etapes

1. Ajouter un filtre dashboard par annee d'exercice.
2. Brancher un parser PDF plus semantique (ratios + sections bilan/CR).
3. Ajouter snapshots mensuels pour KPI temporels.
4. Introduire un module d'alertes proactives (cash stress, argent dormant).
5. Isoler parsing et KPI engine en microservices (phase suivante).

## Decisions techniques importantes

- Suppression de la dependance runtime a Firebase Admin pour le MVP local:
  - parsing + KPI restent en backend Next.js
  - persistance Firestore est realisee depuis le client authentifie
  - evite le blocage "FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY" en local
- Logiques auth separees et testables:
  - `lib/auth/login.ts`
  - `lib/auth/register.ts`
- Verification email envoyee automatiquement a l'inscription via Firebase Auth.
- Template email design Quantis disponible pour futur envoi transactionnel:
  - `lib/email/templates/verificationEmailTemplate.ts`
  - version revue avec rappel spam et CTA d'activation
- Moteur KPI pur et sans dependance UI pour testabilite.
- Couche `view-model` pure pour transformer `kpis` en UI dashboard sans recalcul frontend.
- Parametres utilisateur ajoutes:
  - page `settings` avec mode jour/nuit persistant (localStorage)
  - page `pricing` visuelle (3 offres) pour preparer l'evolution payante
- Nouveau modele de donnees d'analyse stocke:
  - `rawData`
  - `mappedData`
  - `kpis`
  - `financialFacts` (compatibilite dashboard MVP)
- Tests unitaires privilegies sur logique metier, pas sur rendu UI.
- Migration lint finalisee pour ESLint v9 via `eslint.config.mjs`.

## Notes techniques

- Dossiers cibles: `app/`, `components/`, `services/`, `lib/`, `types/`.
- Regles Firestore a deployer: `firestore.rules`.
- Documentation source:
  - `DOCUMENTATION_COMPLETE_PROJET.md`
  - `PRESENTATION_DEMO.md`
  - `PRESENTATION_EXECUTIVE_SUMMARY.md`
  - `Context et inspirations/context.md`
  - `Context et inspirations/design.md`
- Dataset de reference: `datasets/acme_corporation/`.
