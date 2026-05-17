# Audit Sprint C — Mode cabinet UX (multi-tenant Phase 2)

> Audit court pour cadrer les ambiguïtés du brief Sprint C avant code.
> Décisions par défaut prises pour ne pas bloquer — Antoine peut
> intervenir en cours de route, j'adapte.
>
> Date : 18 mai 2026.
> Branche : `feature/multi-tenant-C` (créée depuis `feature/multi-tenant-B`).

## 🚨 Divergences brief vs état actuel

### D1 — Schéma `connection_companies`

**Brief Sprint C** dit que cette collection a les champs :
```ts
connectionId, companyId, externalCompanyId, externalCompanyName, provider,
status: "active" | "inactive", createdAt, updatedAt
```

**Mon implémentation Sprint B** (déjà livrée + tests verts) :
```ts
userId, connectionId, companyId, externalCompanyId, externalCompanyName?,
isActive: boolean, createdAt, updatedAt
```

**Différences** :
- `provider` n'existe pas dans Sprint B (déductible via `Connection` parente — pas de redondance).
- `userId` existe dans Sprint B (clé d'isolation pour les rules Firestore — sans elle on ne peut pas valider l'ownership en lecture).
- `isActive: boolean` au lieu de `status: "active"|"inactive"`.

**Décision** : je garde le schéma Sprint B existant. Le picker manipulera `isActive: boolean`. La route PATCH met `isActive=true` pour les sélectionnés, `false` pour les autres. Pas de migration de schéma (47 tests verts à préserver).

### D2 — Routes `/cabinet/*` vs routes existantes

Le brief crée `/cabinet/portefeuille`, `/cabinet/dossier/[companyId]`, `/cabinet/onboarding/*`. Le projet a déjà `/analysis`, `/synthese`, `/documents` qui servent le mode `company_owner`.

**Décision** : je crée les nouvelles routes `/cabinet/*` séparément. Pas de refactor des routes existantes. La route `/cabinet/dossier/[companyId]` peut être un simple wrapper qui définit `activeCompanyId` puis redirige vers `/analysis` ou `/synthese` selon ce qui fait sens.

**Simplification** : `/cabinet/dossier/[companyId]` = page qui setActiveCompanyId(id) puis redirect vers `/analysis`. Pas de duplication du layout dashboard.

### D3 — Sélection par défaut du picker

Le brief dit "Permettre la sélection multiple (checkbox ou toggle par carte)". Mais pas explicite sur l'état initial.

**Contexte Sprint B** : `createMappingsForFirmCallback` crée TOUS les mappings avec `isActive=true` (import auto). Le picker en Sprint C permet de **désélectionner** ceux qu'on ne veut pas garder.

**Décision** : état initial = tous les mappings cochés (état post-import auto). User décoche pour désactiver. Le bouton "Activer les dossiers sélectionnés" passe les non-sélectionnés à `isActive=false`.

## 🟡 Questions à valider en cours de Sprint (non bloquantes)

### Q1 — `accountType` exclusif ou cumulatif ?

Brief : `accountType?: "company_owner" | "firm_member"`. Un user qui possède ET un cabinet ET une entreprise perso (cas marginal — un expert-comptable qui a aussi sa propre boîte) ?

**Défaut pris** : exclusif. Si tu confirmes que c'est OK pour MVP, je n'ouvre pas la boîte de Pandore "user multi-rôle".

### Q2 — Stack state global pour `activeCompanyStore`

Brief : "Zustand ou Context". Le repo n'a actuellement ni zustand (vérifié dans package.json), juste React Context.

**Défaut pris** : React Context + `useReducer` + `localStorage` pour persistance (cohérent avec le pattern existant `useSidebarCollapsedPreference`). Pas d'ajout de dépendance npm.

### Q3 — Credentials OAuth Firm Pennylane dispo ?

Brief : "version minimale" + "même avec des mocks si credentials pas encore reçus".

**Défaut pris** : je code en mode "credentials optionnels". Si `PENNYLANE_FIRM_CLIENT_ID` est défini → flow OAuth réel (testable preview Vercel). Sinon → flow OAuth en mode mock (utilise les helpers Sprint B `createMappingsForFirmCallback` avec une liste mockée pour le picker, permet de dérouler la suite du parcours en dev/test).

## 📋 Récap décisions par défaut

| # | Sujet | Décision |
|---|---|---|
| D1 | Schéma `connection_companies` | Garde Sprint B (`isActive: boolean`, pas de `provider` redondant) |
| D2 | Routes `/cabinet/*` | Crée séparément, `/cabinet/dossier/[id]` = wrapper redirect vers `/analysis` |
| D3 | Picker initial | Tout coché par défaut (import auto Sprint B), user décoche |
| Q1 | `accountType` exclusif | Oui, MVP — pas de multi-rôle |
| Q2 | State global | React Context (pas de zustand) |
| Q3 | OAuth Firm credentials | Flow OAuth dégradable en mock si env vars absentes |

## 📦 Périmètre Sprint C — checklist

- [ ] C1 : Firm model + accountType + firmStore + 4 tests + rules
- [ ] C2 : OnboardingSelector (2 cartes) + flow cabinet + flow company_owner intact
- [ ] C3 : OAuth Firm callback minimal + page `/cabinet/onboarding/connect`
- [ ] C4 : Picker `/cabinet/onboarding/picker` + PATCH mappings
- [ ] C5 : Portefeuille `/cabinet/portefeuille` + KPIs synthétiques
- [ ] C6 : `activeCompanyStore` (Context) + `CompanySelector` + `/cabinet/dossier/[id]`
- [ ] C7 : tests (≥ 20 nouveaux) + docs architecture Sprint C + rollback

Cible globale : **≥ 70 tests verts** (47 actuels + 20+ Sprint C).
