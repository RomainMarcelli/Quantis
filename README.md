# Quantis MVP

Reconstruction from scratch de Quantis a partir des fichiers Markdown du projet historique.

## Etat du projet (mise a jour 2026-04-01)

- Alignement front/back sur les nouvelles donnees Excel et la logique metier multi-annees.
- Historisation active des analyses par exercice fiscal avec corrections automatiques:
  - TCAM recalcule a partir de l'annee la plus ancienne disponible.
  - `delta_bfr` recalcule entre N et N-1.
  - cash reel (`fte`) aligne sur `caf - delta_bfr`.
- Graphique point mort refondu (formules 2033SD, intersection fiable, mode plein ecran, tooltip premium, zones pertes/benefices).
- Section Investissement amelioree (modélisation BFR plus lisible et responsive, ratio immo net/brut).
- Indicateurs de tendance (hausse/baisse/stable) affiches sur les KPI majeurs.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 3
- Recharts
- Firebase SDK:
  - Authentication (email/password)
  - Firestore (stockage des analyses)

## Installation

```bash
npm install
```

## Variables d'environnement

Copier `.env.example` vers `.env.local`, puis renseigner les valeurs Firebase:

```bash
cp .env.example .env.local
```

Variables requises:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (optionnelle)

Variables serveur requises pour les emails transactionnels:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (recommande: domaine verifie)
- `APP_BASE_URL` (optionnelle, sinon origin de la requete)

Pour l'envoi d'emails transactionnels custom, des variables serveur Firebase Admin + Resend sont necessaires (voir `.env.example`).

## Lancer le projet

```bash
npm run dev
```

Puis ouvrir `http://localhost:3000`.

## Authentification

- Ecran de connexion + lien vers inscription
- Inscription MVP:
  - `nom`
  - `prenom`
  - `email`
  - `password`
  - `nom entreprise`
  - `SIREN`
  - `taille entreprise` (select)
  - `secteur` (select)
- Affichage/masquage du mot de passe (icone oeil)
- Checklist de securite mot de passe dynamique (rouge -> vert critere par critere)
  - layout horizontal en badges/chips responsive
- Feedback UX:
  - toasts succes/erreur
  - messages inline de validation
  - tooltips sur champs sensibles
- Verification email obligatoire apres inscription (email transactionnel Resend + lien Firebase Admin)
- Messages d'erreurs explicites:
  - format email invalide
  - mot de passe trop faible / non conforme
  - email deja utilise
  - email non verifie
  - credentials invalides

## Regles de securite appliquees

- Validation forte du mot de passe a l'inscription:
  - 8 caracteres minimum
  - 1 majuscule
  - 1 minuscule
  - 1 chiffre
  - 1 caractere special
- Regles Firestore dans `firestore.rules`:
  - `users/{uid}` lisible/modifiable/supprimable uniquement par l'utilisateur authentifie
  - `analyses` lisibles/supprimables uniquement par leur proprietaire
  - creation uniquement avec `userId == request.auth.uid`
  - update `analyses` desactive

## Email de confirmation

- Envoi gere via Resend (design DA Quantis) avec liens securises Firebase Admin.
- Templates utilises:
  - `lib/email/templates/verificationEmailTemplate.ts`
  - `lib/email/templates/passwordResetEmailTemplate.ts`
- Endpoints serveur:
  - `app/api/auth/send-verification-email/route.ts`
  - `app/api/auth/send-password-reset-email/route.ts`
- Fallback automatique Firebase natif conserve si le service transactionnel est indisponible.

## Pipeline data

Flux implemente:

`Upload -> Parsing -> Mapping -> Calcul KPI -> Stockage Firestore -> Affichage dashboard`

- Parsing Excel/PDF: `services/parsers/`
- Mapping 2033: `services/mapping/financialDataMapper.ts`
- Moteur KPI complet (formules Quantis Mapping): `services/kpiEngine.ts`
- Corrections historiques multi-annees a la lecture:
  - `services/analysisHistory.ts`
  - `services/kpiHistoryEngine.ts`
- Stockage Firestore: `services/analysisStore.ts`
- Orchestration API parsing/kpi: `app/api/analyses/route.ts`
- Chaque analyse stocke:
  - `rawData`
  - `mappedData`
  - `kpis`
  - (et champs legacy dashboard: `financialFacts`, `parsedData`)

Formules metier alignees:
- `bfr = (total_stocks + creances) - fournisseurs`
- `ratio_immo = total_actif_immo_net / total_actif_immo_brut`
- `cash_reel (fte) = caf - delta_bfr`
- `TCAM = ((ca_n / ca_start)^(1/n) - 1) * 100` avec tri par exercice fiscal

## Inspection d'une analyse

- Page detail: `/analysis/[id]`
- Dashboard decisionnel (SaaS):
  - header personnalise
  - top KPI cards
  - score global + alertes
  - sections metier (creation de valeur, BFR, financement, rentabilite)
  - debug repliable (`rawData`, `mappedData`, `kpis`)

## Page de test KPI (avant / apres)

- Route: `/test-kpi`
- Permet de:
  - charger les analyses reelles stockees en Firestore
  - comparer KPI stockes vs KPI recalcules
  - verifier les donnees brutes/mappees/resultats en JSON

## Gestion de compte

- Page compte: `/account`
- Consultation des infos:
  - email
  - nom/prenom
  - SIREN
  - entreprise, taille, secteur
- Mise a jour du profil (Firestore)
- Suppression des donnees (profil + analyses)
- Suppression complete du compte (donnees + Firebase Auth) avec double confirmation

## Tests unitaires

```bash
npm run test:unit
```

Couvrent la logique metier (auth, parsing, KPI).

Autres commandes qualite:

```bash
npm run lint
npm run build
npm run test:e2e
```

## Structure

- `app/`
- `components/`
- `services/`
- `lib/`
- `types/`

## Suivi projet

Le fichier `projet.md` est la source de verite de pilotage (vision, etat d'avancement, decisions techniques, roadmap)

