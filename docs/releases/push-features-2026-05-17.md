# Push `features` — 2026-05-17

> Push de `feature/multi-tenant` + `feature/maj-connecteurs` sur `origin/features`.
> Branche pré-validée pour merge ultérieur dans `main` (à faire par Romain
> après preview features en environnement staging).

## Résumé exécutif

| | Avant | Après |
|---|---|---|
| `origin/features` HEAD | `8b8b31c` | `d77dc8d` |
| Commits ajoutés | — | 52 |
| Branches mergées | — | 2 (`feature/multi-tenant`, `feature/maj-connecteurs`) |
| Conflits résolus manuellement | — | 0 (auto-merge sur les 2 fichiers à risque) |
| Build | — | ✅ `npm run build` — 75 routes compilées |
| Tests | — | ✅ **1022 passed**, 19 failed (baseline pré-existante), 3 skipped |
| Pushé par | — | Antoine Cayer (`antoinecayer@gmail.com`) |

## Contenu mergé

### Sprint multi-tenant (38 commits, 68 fichiers)

Phase 2 multi-tenant complet (Sprints A → D) :

- **Sprint A — Fondations Company** : `companyStore`, `requireCompanyAccess`,
  migration `users → companies`, rules + index Firestore.
- **Sprint B — Découplage Connection ↔ Company** : table de jointure
  `connection_companies/{id}`, mappings N:N, sync multi-company, idempotence
  via `findMappingByExternalRef`.
- **Sprint C — Mode cabinet UX** : `firmStore`, `accountType` sur `users`,
  OAuth Firm Pennylane (Tâche C3), picker dossiers, page portefeuille, route
  `/cabinet/dossier/[companyId]`, `activeCompanyStore` + `CompanySelector`.
- **Sprint D — Validation** : tests E2E multi-tenant, FAQs, `seed-demo.mts`,
  procédures de rollback, checklist `docs/validation-sprint-D.md`.
- **Post-D (ce push)** :
  - mount du `<CompanySelector />` dans `AppHeader.tsx` ligne 1
    (auto-hidden si pas `firm_member`)
  - portal du dropdown `CompanySelector` dans `document.body` avec
    `position: fixed` + `z-index: 9999` → fix le clipping par
    `overflow-hidden` du card header et le passage sous la ligne 2
    (boutons Simuler/Exporter)
  - scripts dev : `mock-firm-dossiers.mts` (seed 3 dossiers mock pour
    visualiser le portefeuille sans OAuth) et `promote-to-firm-member.mts`
    (bascule un user prod en firm_member, idempotent + `--revert`)
  - `.gitignore` : `**/__pycache__/`

### Sprint maj-connecteurs (11 commits, 23 fichiers)

- Visibilité connecteurs scoped pour MVP Phase 1 (env-flag) :
  `services/integrations/connectorVisibility.ts` + hook
  `lib/hooks/useConnectorVisibility.ts` + route
  `/api/integrations/connectors/visibility`.
- Tile Firm OAuth masquée en prod tant que la refacto multi-tenant n'est pas
  livrée (`components/documents/DocumentsView.tsx`,
  `components/integrations/AccountingConnectionWizard.tsx`).
- Pennylane : refonte `auth.ts` + `client.ts` + nouveau `firmOAuth.ts`
  (couverture certification sandbox), tests d'unité ajoutés.
- MyU : adapter `services/integrations/adapters/myunisoft/client.ts`.
- Docs : `pennylane-certification.md`, `audit-pre-merge.md`,
  `pennylane.md` (architecture OAuth Firm + checklist).
- Scripts : `probe-myunisoft.mts`, `seed-pennylane-sandbox.mts`.

## Conflits attendus vs réels

Fichiers en intersection entre les 2 branches :

- `services/integrations/adapters/pennylane/client.ts`
- `services/integrations/storage/connectionStore.ts`

**Aucun conflit textuel** — git a auto-mergé les hunks (modifications dans
des zones disjointes des fichiers). Aucune résolution manuelle nécessaire.

## Vérifications T3

### `npm run build`

```
✓ Compiled successfully in 8.6s
✓ Generating static pages using 7 workers (75/75) in 515.5ms
```

Routes `/cabinet/onboarding/connect`, `/cabinet/onboarding/picker`,
`/cabinet/portefeuille` présentes (static) ; `/cabinet/dossier/[companyId]`
dynamique (`ƒ`). 75 routes au total.

### `npx tsc --noEmit`

Erreurs uniquement dans des fichiers `.test.ts` (fixtures à mettre à jour
après évolution des types `MappedFinancialData`, `AnalysisRecord`,
`SyntheseViewModel`). **Aucune erreur dans le code production.** Pré-existant,
hors scope de ce push.

Fichiers concernés (8) :
- `components/analysis/DownloadReportButton.test.tsx`
- `lib/server/dataSources.test.ts`
- `lib/source/resolveSourceAnalyses.test.ts`
- `lib/temporality/availableRange.test.ts`
- `services/financialMapping.test.ts`
- `services/mapping/parsedFinancialDataBridge.test.ts`
- `services/pdf-analysis/*-diagnostic.test.ts` (×3)
- `services/pdfAnalysisStore.test.ts`

### `npm run test:unit`

```
Test Files  12 failed | 124 passed | 3 skipped (139)
     Tests  19 failed | 1022 passed | 3 skipped (1044)
   Duration 5.09s
```

Les 19 échecs sont **tous** sur la même cause : `Firebase Admin env missing.
Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.` —
les tests des routes API qui touchent Firestore ne reçoivent pas ces vars en
env de test. Pré-existant, documenté dans `docs/audit-sprint-D.md` ("19
échecs hors scope multi-tenant").

Baseline accepté pour ce push : **79+ tests multi-tenant verts** sur les
1022 — confirmé.

## Identité git utilisée pour les 3 commits

- `b837541 feat(cabinet): mount CompanySelector header + portal dropdown + dev scripts`
- `b923198 chore: merge feature/multi-tenant — Phase 2 multi-tenant complet`
- `d77dc8d chore: merge feature/maj-connecteurs — mise à jour connecteurs MVP Phase 1`

Author + Committer : `Antoine Cayer <antoinecayer@gmail.com>` (autorisation
explicite donnée pour ce push uniquement).

## Variables d'environnement requises côté serveur

Pour que les routes multi-tenant fonctionnent en prod / staging :

- Toutes les vars Firebase Admin existantes restent obligatoires.
- **Nouvelles** (Sprint C — OAuth Firm Pennylane) :
  - `PENNYLANE_FIRM_CLIENT_ID`
  - `PENNYLANE_FIRM_CLIENT_SECRET`
  - `PENNYLANE_FIRM_REDIRECT_URI`
- Sans ces 3 vars, `/api/integrations/pennylane/firm/callback` retourne 503
  avec un message explicite. Pas de fallback silencieux.

## Validation Sprint D — état réel

⚠️ La checklist `docs/validation-sprint-D.md` **n'a pas été cochée** avant
ce push. Antoine a validé manuellement :

- ✅ `/cabinet/portefeuille` charge et affiche les 3 dossiers (seed mock)
- ✅ `CompanySelector` dropdown fonctionne (post-fix portal)
- ⏳ Switch dossier → cockpit `/analysis` du client : non testé end-to-end
- ⏳ Parcours `firm_member` complet (mobile, sync tous, etc.) : non testé
- ❌ Onboarding firm en local : bloqué par OAuth Pennylane Firm (creds absents
  + callback redirect prod-only vers `app.vyzor.fr`)

**Décision** : push autorisé malgré la checklist incomplète, validation
restante à faire sur la preview features en environnement staging.

## Rollback d'urgence

Si quelque chose pète en preview/staging :

```bash
# 1. Revert local
git checkout features
git reset --hard 8b8b31c
git push --force-with-lease origin features
```

**ATTENTION** : `--force-with-lease` est destructif et impacte Romain.
Coordonner avant.

Alternative non destructive (recommandée) :

```bash
git checkout features
git revert -m 1 d77dc8d   # revert merge maj-connecteurs
git revert -m 1 b923198   # revert merge multi-tenant
git push origin features
```

Garde l'historique propre, ajoute 2 commits de revert.

Rollback ciblé d'un seul sprint : voir
`docs/rollback-multi-tenant-{A,B,C,D}.md` pour les procédures pas-à-pas par
Sprint (drop des collections Firestore concernées, etc.).

## Non bloquants restants

À traiter ultérieurement (hors scope de ce push) :

1. Pre-auth onboarding picker — `/onboarding` actuellement sous `AuthGate`,
   le picker company/firm arrive APRÈS signup. Refacto à prévoir pour
   inverser : visiteur landing → choix rôle → `/register?accountType=...`.
   Tracé dans la mémoire `project_pre_auth_picker_todo.md`.
2. Mock callback OAuth Firm Pennylane en mode démo (~30 min) pour permettre
   le test E2E du flow `firm_member` sans creds Pennylane.
3. 11 tests UI supplémentaires (cible brief 90 → 79 livrés) — nécessite
   `@testing-library/react`, décision pragmatique D3.
4. Fixer les 19 tests qui requièrent `FIREBASE_PROJECT_ID` en env de test
   (setup vitest globalSetup ou mock du module `firebaseAdmin`).

## Notification à Romain

Texte à envoyer (Slack / mail) :

> `features` mis à jour : merge `feature/multi-tenant` + `feature/maj-connecteurs`.
> 52 commits, build vert, 1022 tests verts (19 rouges pré-existants =
> Firebase env de test). Push direct `8b8b31c..d77dc8d`. Détails et rollback
> dans `docs/releases/push-features-2026-05-17.md`. Tu peux préparer le merge
> `features → main` quand staging valide la preview.
