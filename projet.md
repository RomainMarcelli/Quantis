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
  - calcul KPI (`services/kpiEngine.ts`)
  - stockage Firestore via SDK client authentifie (`services/analysisStore.ts`)
  - affichage dashboard + historique
- Historisation:
  - timestamp de creation
  - exercice fiscal (`fiscalYear`) exploitable pour filtrage
- Regles de securite Firestore:
  - fichier `firestore.rules`
  - isolation stricte par `userId`
  - suppression autorisee uniquement pour les documents du proprietaire

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
- Tests unitaires privilegies sur logique metier, pas sur rendu UI.

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
