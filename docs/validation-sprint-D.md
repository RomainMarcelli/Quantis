# Checklist de validation — `feature/multi-tenant` (4 sprints)

> À compléter par Antoine après `npm run demo` sur http://localhost:3000.
> Romain merge dans `features` UNIQUEMENT une fois cette checklist signée.

## Préparation

- [ ] `git checkout feature/multi-tenant && git pull`
- [ ] `cp .env.demo.example .env.local` (ou fusion manuelle avec ton `.env` existant)
- [ ] Firebase emulator actif : `firebase emulators:start --only firestore,auth`
- [ ] `npm install` (au cas où)
- [ ] `npm run demo` (= seed + dev server)
- [ ] Ouverture http://localhost:3000

## Parcours `company_owner`

- [ ] Connexion avec `dirigeant@demo.vyzor.fr` (uid demo-owner-001) → dashboard s'affiche
- [ ] Cockpit charge des chiffres cohérents (CA 222K€, tréso 218K€)
- [ ] Simulateur fonctionne (au moins 1 scénario)
- [ ] Assistant IA répond (mode mock ou live selon ANTHROPIC_API_KEY)
- [ ] **Aucun sélecteur de Company visible** dans la sidebar/header
- [ ] `/cabinet/portefeuille` → redirect `/analysis` (403 silencieux du middleware)

## Parcours `firm_member`

- [ ] Connexion avec `cabinet@demo.vyzor.fr` (uid demo-firm-001) → `/cabinet/portefeuille` accessible
- [ ] Header "Portefeuille — Cabinet Dupont & Associés" affiché
- [ ] 3 dossiers visibles (Boulangerie Martin, SARL Dupuis Plomberie, Cabinet Médical Leroy)
- [ ] KPIs synthétiques sur chaque carte (ou "—" si non dispo)
- [ ] Badges de statut colorés (vert "Sync OK" sur les 3 dossiers seed)
- [ ] Clic sur un dossier → `/cabinet/dossier/[companyId]` → spinner → cockpit du dossier
- [ ] Breadcrumb "Portefeuille > [Nom]" visible et cliquable
- [ ] Sélecteur de Company en haut → switch vers un autre dossier → données rechargées
- [ ] "Retour au portefeuille" depuis le dropdown sélecteur fonctionne
- [ ] Bouton "Synchroniser tous" → spinner → rapport affiché (ou échec gracieux)

## Onboarding (déroulé sur compte neuf hors seed)

- [ ] Créer un user via Firebase Auth émulateur (n'importe quel email)
- [ ] `/onboarding` → choisir "Je gère un cabinet" → saisir nom → /cabinet/onboarding/connect
- [ ] Si OAuth Firm credentials absents : la page affiche le 503 explicite avec consigne
- [ ] (Mode démo) Si seed-demo lancé, le picker affiche les 3 dossiers seed
- [ ] Sélection de 2 dossiers sur 3 → "Activer" → redirect `/cabinet/portefeuille`
- [ ] Portefeuille affiche uniquement les 2 dossiers activés

## Mobile (redimensionner navigateur à 375px)

- [ ] Portefeuille : cartes en colonne, pas de débordement horizontal
- [ ] Picker : liste scrollable, bouton "Activer" accessible
- [ ] Sélecteur de Company : dropdown ne sort pas du viewport
- [ ] Cockpit dossier : KPIs lisibles sans zoom

## Technique

- [ ] `npm run test:unit` → ≥ 79 tests verts (cible brief : 90 — manque 11 selon priorisation pragmatique D3)
- [ ] `npm run build` → build réussi sans erreur
- [ ] Aucune erreur rouge dans la console navigateur
- [ ] Aucune erreur 500 dans les logs du terminal Next.js

## Retours Antoine

Espace libre pour noter les bugs ou ajustements UX à corriger avant merge :

```
[Item 1]
[Item 2]
```

---

Validé par Antoine le : ___________
Merge `feature/multi-tenant` → `features` autorisé par Romain le : ___________

## Pour Romain — commandes après validation

```bash
git checkout features
git pull origin features
git merge feature/multi-tenant --no-ff -m "feat: Phase 2 multi-tenant — mode cabinet complet (Sprints A+B+C+D)"
npm run test:unit && npm run build
# Si tout vert :
git push origin features
# main reste intact jusqu'à validation preview features
```
