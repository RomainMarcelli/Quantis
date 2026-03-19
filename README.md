# Quantis MVP

Reconstruction from scratch de Quantis a partir des fichiers Markdown du projet historique.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Firebase SDK (Auth email/password)

## Installation

```bash
npm install
```

## Variables d'environnement

Le projet fonctionne sans variable obligatoire pour l'auth MVP (config Firebase dans `lib/firebase.ts`).

## Lancer le projet

```bash
npm run dev
```

Puis ouvrir `http://localhost:3000`.

## Authentification MVP

- Connexion Firebase par `email` + `password`
- Login d'un utilisateur deja cree dans Firebase Authentication
- Redirection vers `/dashboard` apres authentification
- Deconnexion depuis le dashboard

## Tests unitaires

```bash
npm run test:unit
```

Les tests couvrent la logique metier de login (validation credentials + gestion des erreurs d'auth).

## Structure

- `app/`
- `components/`
- `services/`
- `lib/`
- `types/`

## Suivi projet

Le fichier `projet.md` est la source de verite de pilotage (vision, etat d'avancement, decisions techniques, prochaines etapes).
