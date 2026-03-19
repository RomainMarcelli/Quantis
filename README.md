# Quantis MVP

Reconstruction from scratch de Quantis a partir des fichiers Markdown du projet historique.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Firebase SDK:
  - Authentication (email/password)
  - Firestore (stockage des analyses)

## Installation

```bash
npm install
```

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
- Feedback UX:
  - toasts succes/erreur
  - messages inline de validation
  - tooltips sur champs sensibles
- Verification email obligatoire apres inscription (envoi automatique Firebase)
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
  - `users/{uid}` lisible/modifiable uniquement par l'utilisateur authentifie
  - lecture uniquement de ses propres documents
  - creation uniquement avec `userId == request.auth.uid`
  - pas de modification/suppression en MVP

## Email de confirmation

- L'envoi est gere par Firebase Auth (`sendEmailVerification`).
- Un template HTML DA Quantis est fourni pour integration future avec un provider mail transactionnel:
  - `lib/email/templates/verificationEmailTemplate.ts`
  - design premium + rappel explicite de verifier le dossier spam

## Pipeline data

Flux implemente:

`Upload -> Parsing -> Calcul KPI -> Stockage Firestore -> Affichage dashboard`

- Parsing Excel/PDF: `services/parsers/`
- Moteur KPI pur: `services/kpiEngine.ts`
- Stockage Firestore: `services/analysisStore.ts`
- Orchestration API parsing/kpi: `app/api/analyses/route.ts`

## Tests unitaires

```bash
npm run test:unit
```

Couvrent la logique metier (auth, parsing, KPI).

## Structure

- `app/`
- `components/`
- `services/`
- `lib/`
- `types/`

## Suivi projet

Le fichier `projet.md` est la source de verite de pilotage (vision, etat d'avancement, decisions techniques, roadmap).
