# Projet Quantis - Suivi Principal

## Vision du projet

Quantis est un copilote financier B2B pour PME.
Le produit convertit des donnees comptables (PDF/Excel) en decisions exploitables via langage naturel:
classification de la demande, extraction de parametres, analyse financiere, restitution claire (KPIs, projections, recommandations).

## Fonctionnalites implementees

- Socle Next.js App Router + TypeScript + Tailwind.
- Initialisation Firebase (`lib/firebase.ts`).
- Authentification Firebase email/password:
  - formulaire login `email` + `password`
  - connexion via `signInWithEmailAndPassword`
  - guard du dashboard base sur l'etat auth Firebase
  - deconnexion via `signOut`
- Separation des responsabilites:
  - UI: `components/`
  - logique metier auth: `lib/auth/login.ts`
  - service Firebase auth: `services/auth.ts`
- Tests unitaires metier (Vitest):
  - validation des credentials
  - flow login success/erreur
  - mapping des erreurs Firebase en messages utilisateur

## Fonctionnalites en cours

- Mise en place du premier pipeline metier de question/reponse Quantis:
  - classification
  - extraction de parametres
  - gap analysis
  - generation de sortie structuree

## Prochaines etapes

1. Ajouter l'API Route `POST /api/question` avec orchestration metier MVP.
2. Implementer un premier analyseur (recrutement) avec KPIs et projection simple.
3. Poser un schema de types commun pour la sortie analytique (PageConfig/sections KPI).
4. Ajouter les tests unitaires associes aux modules de classification/extraction/calcul.
5. Connecter le dashboard a des donnees metier reelles (widgets sante/alertes/argent dormant).

## Decisions techniques importantes

- Auth custom SIREN retiree au profit de Firebase Auth email/password pour un MVP evolutif.
- Logique de login extraite en use case testable (`lib/auth/login.ts`) pour eviter de coupler la regle metier au composant React.
- Gateway d'auth centralisee (`services/auth.ts`) pour preparer une evolution future (RBAC, claims, multi-tenant).
- Vitest choisi pour des tests unitaires rapides et isoles sur la logique metier.

## Notes techniques

- Dossiers cibles: `app/`, `components/`, `services/`, `lib/`, `types/`.
- Documentation fonctionnelle source:
  - `DOCUMENTATION_COMPLETE_PROJET.md`
  - `PRESENTATION_DEMO.md`
  - `PRESENTATION_EXECUTIVE_SUMMARY.md`
  - `Context et inspirations/context.md`
  - `Context et inspirations/design.md`
- Dataset de reference: `datasets/acme_corporation/`.
