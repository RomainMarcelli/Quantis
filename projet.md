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
  - recuperation de mot de passe complete:
    - lien "Mot de passe oublie ?" depuis la page login
    - page `/forgot-password` (envoi lien de reset via Resend + lien Firebase Admin)
    - page `/reset-password` (validation lien + nouveau mot de passe)
    - messages generiques pour ne jamais exposer si un email existe
  - emails transactionnels custom en DA Quantis:
    - confirmation de compte
    - reinitialisation mot de passe
    - envoi via Resend avec endpoints serveur dedies
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
  - DA premium alignee sur `/analysis` (theme sombre, cartes precision, overlays)
  - affichage des informations utilisateur/entreprise
  - mise a jour du profil Firestore
  - suppression des donnees statistiques uniquement (analyses + dossiers), profil conserve
  - suppression complete du compte Firebase Auth + Firestore avec double confirmation
- Parametres `/settings` refondus:
   - suppression du toggle mode jour/nuit
   - DA premium identique a `/analysis`
   - preferences essentielles ajoutees:
     - exercice fiscal par defaut
     - format d'export prefere
     - affichage section debug
     - ouverture auto de l'analyse apres upload
     - confirmation des actions destructives
- Pipeline metier MVP:
  - upload de fichiers (Excel/PDF)
  - parsing serveur (`services/parsers/*`)
  - mapping financier 2033 (`services/mapping/financialDataMapper.ts`)
  - calcul KPI complet selon `Quantis_Mapping_2033SD.xlsx` (`services/kpiEngine.ts`)
    - extension KPI metier stockee: `disponibilites`, `ca`, `ebe`, `resultat_net`, `capacite_remboursement_annees`, `etat_materiel_indice`
  - stockage Firestore via SDK client authentifie (`services/analysisStore.ts`)
  - redirection post-upload vers `/analysis`
  - page `/dashboard` simplifiee en espace de depot (upload only)
  - refonte UI de `/dashboard` pour alignement complet avec la DA premium (`/analysis`):
    - fond premium dark + overlays (noise/spotlight)
    - cartes `precision-card` et contrastes renforces
    - zone d'upload modernisee (drag-and-drop, liste fichiers, CTA gold)
    - actions principales harmonisees (dashboard, test KPI, compte, deconnexion)
  - URL simplifiee pour le dashboard: `/analysis` (sans identifiant visible)
  - support des dossiers d'analyses:
    - creation d'un dossier au premier depot
    - association des analyses a `folderName`
    - affichage des fichiers sources par dossier dans la sidebar
    - ajout de nouveaux fichiers directement depuis la page dashboard
    - gestion dossier complete dans la sidebar `/analysis`:
      - creation rapide via bouton `+`
      - renommage de dossier (deplacement des analyses associees)
      - suppression de dossier (suppression des analyses associees)
      - actions dossier via modale integree (plus de popup navigateur `prompt/confirm`)
      - persistance Firestore des dossiers dans la collection `folders`
  - gestion des fichiers sources dans la sidebar `/analysis`:
    - libelle traduit en `Fichiers sources`
    - affichage filtre par dossier actif (uniquement les fichiers du dossier selectionne)
    - suppression d'un fichier source depuis la sidebar
    - confirmation avant suppression pour eviter les erreurs utilisateur
    - selection multiple de fichiers avec suppression groupee
    - suppression synchronisee de l'analyse associee avec rafraichissement immediat des donnees
  - nouvelle page `/synthese` (DA premium coherente avec `/analysis`):
    - item sidebar `Synthese` cliquable (remplace `Analyses`)
    - bloc principal `Quantis Score` (score /100 + statut de sante globale)
    - selecteur d'annee en haut a droite (option `Annee en cours` + annees historiques disponibles)
    - ligne KPI principale: chiffre d'affaires, EBE, cash disponible
    - indicateurs de tendance vs periode precedente (hausse/baisse/stable + couleurs)
    - bloc `Actions recommandees` + bloc `Alertes` base sur les KPI
    - donnees alimentees exclusivement depuis `kpis` (aucun recalcul metier en UI)
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
  - sous-menu horizontal dashboard (`/analysis`) ajoute sous le header:
    - onglets: `Creation de valeur`, `Investissement`, `Financement`, `Rentabilite`
    - interaction locale sans reload (state client)
    - switch dynamique du contenu principal selon l'onglet actif
    - selecteur de periode (annee) integre au menu pour filtrer la vue dashboard
    - comportement ajuste UX:
      - menu affiche au-dessus du bloc `Cockpit financier`
      - affichage initial conserve au chargement
      - affichage des graphes uniquement apres clic sur `Creation de valeur`
  - section `Investissement` implementee (UI + logique + tests):
    - bloc `Argent bloque (BFR)` + explication metier
    - graphique `Variation du BFR` (Recharts)
    - bloc `Jours a avancer (Rotation du BFR)` avec detail Stocks / DSO / DPO
    - bloc `Clients vs Fournisseurs` avec interpretation risque (DSO > DPO)
    - bloc `Etat du materiel` avec radial chart
    - composants dedies dans `components/dashboard/investment/*`
    - logique metier pure centralisee dans `lib/dashboard/investment/investmentViewModel.ts`
    - ajustements UX:
      - bloc `Jours a avancer` compacte (moins vertical, meilleur alignement des lignes)
      - bloc `Clients / Fournisseurs` reduit en hauteur
      - bloc `Etat du materiel` passe en pleine largeur
      - contraste renforce de `Usure estimee` pour une meilleure lisibilite
  - section `Financement` implementee (UI + logique + tests):
    - bloc `Capacite de remboursement` (annees) + interpretation risque
    - bloc `Securite` avec liquidite generale/reduite/immediate + badges visuels
    - bloc `Capacite d'autofinancement (CAF)`
    - bloc `Dependance bancaire (levier financier)` + interpretation
    - bloc pleine largeur `Cash genere (net)` + mini evolution Recharts
    - composants dedies dans `components/dashboard/financement/*`
    - logique metier pure centralisee dans `lib/dashboard/financement/financingViewModel.ts`
    - ajustements UX:
      - titres des cards reduits pour tenir proprement sur une seule ligne
  - section `Rentabilite` implementee (UI + logique + tests):
    - bloc `Gain sur mon capital (ROE)` + indicateur de tendance
    - graphique `ROE` (Recharts)
    - bloc `Performance de l'activite (ROCE)` + indicateur de tendance
    - graphique `ROCE` (Recharts)
    - bloc pleine largeur `Dependance bancaire (Levier financier)` + interpretation
    - composants dedies dans `components/dashboard/rentabilite/*`
    - logique metier pure centralisee dans `lib/dashboard/rentabilite/rentabilityViewModel.ts`
  - comportement dashboard ajuste:
    - quand un onglet metier est actif (`Creation de valeur`, `Investissement`, `Financement`, `Rentabilite`),
      le cockpit est masque pour afficher uniquement la section selectionnee
  - section `Creation de valeur` enrichie en data viz (Recharts):
    - CA + line chart mensuel
    - bloc TCAM explicatif
    - EBE + chart evolution
    - Resultat net + chart evolution
    - TMSCV + pie chart
    - graphique point mort XY (CA/couts/marge) + marker `Point mort`
    - zones pertes/bénéfices affichées sur le graphique point mort + légende complète
    - popups d'aide `i` ajoutés sur chaque bloc KPI (utilité, données, formule)
    - donut TMSCV enrichi (plusieurs segments) avec gestion visuelle des cas négatifs
  - refonte premium de la zone dashboard `/analysis`:
    - integration du design cockpit en composants React/Tailwind
    - composants dedies `DashboardLayout`, `HealthScore`, `KPIBlock`, `KPIWide`, `AIInsight`
    - mapping frontend pur des KPI vers contrat UI premium
    - animations React-friendly (cadran sante, compteurs, barre EBE)
    - eclairage au survol par bloc (cards) au lieu d'un glow global suiveur
    - panneau de simulation IA compact repositionne en haut a droite
    - espacements du bloc "Indice de sante" reajustes pour une lecture plus nette
    - mode dark force uniquement sur la vue analyse
    - conservation des blocs fonctionnels existants (dossiers, upload, debug)
    - creation multi-dossiers stabilisee via stockage local de dossiers connus
  - DA premium etendue globalement a l'application:
    - theme sombre par defaut (sauf preference light sauvegardee)
    - tokens/containers globaux aligns avec la signature visuelle `/analysis`
    - animation globale de reveal au scroll (fondu + translation legere) sur les surfaces premium
  - page de test KPI avant/apres: `/test-kpi`
    - charge les analyses reelles stockees en Firestore apres upload
    - visualisation des formules appliquees a `mappedData`
    - comparaison KPI stockes vs KPI recalcules
    - affichage debug complet: `rawData`, `mappedData`, `parsedData`, `kpis`
    - refonte DA premium alignee sur `/analysis` (cartes dark, tables et panels JSON harmonises)
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
  - nouveaux tests unitaires dashboard premium:
    - mapping KPI premium
    - logique score/couleur
    - calcul strokeDashoffset
    - bornage des animations
    - rendu composants KPI premium
  - nouveaux tests unitaires Synthese:
    - logique de tendance (up/down/na)
    - construction view-model (score, KPI, alertes, actions)
    - rendu composant (Quantis Score + KPI principaux)
  - nouveaux tests unitaires dashboard tabs:
    - logique de preparation des donnees graphiques (mensuel, TMSCV, point mort)
    - rendu des composants chart
    - rendu du sous-menu financier
  - nouveaux tests unitaires Financement:
    - interpretation metier (capacite, liquidite, levier)
    - rendu section Financement
    - affichage tab `Financement`
  - nouveaux tests unitaires Rentabilite:
    - normalisation/mapping des valeurs ROE/ROCE
    - logique de tendance (hausse/baisse)
    - rendu section Rentabilite
    - affichage tab `Rentabilite`

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

- Adoption de Firebase Admin cote serveur uniquement pour les emails transactionnels:
  - generation securisee des liens de verification/reset
  - envoi via Resend avec templates HTML custom
  - parsing + KPI restent en backend Next.js
  - persistance Firestore reste realisee depuis le client authentifie
- Logiques auth separees et testables:
  - `lib/auth/login.ts`
  - `lib/auth/register.ts`
  - `lib/auth/passwordReset.ts`
- Verification email envoyee automatiquement a l'inscription via endpoint Resend (fallback Firebase natif actif).
- Templates emails transactionnels actifs:
  - `lib/email/templates/verificationEmailTemplate.ts`
  - `lib/email/templates/passwordResetEmailTemplate.ts`
  - routes: `app/api/auth/send-verification-email/route.ts` et `app/api/auth/send-password-reset-email/route.ts`
- Moteur KPI pur et sans dependance UI pour testabilite.
- Couche `view-model` pure pour transformer `kpis` en UI dashboard sans recalcul frontend.
- Parametres utilisateur ajoutes:
  - page `settings` avec mode jour/nuit persistant (localStorage)
  - page `pricing` visuelle (3 offres) pour preparer l'evolution payante
  - refonte UI de `/pricing` alignee sur la DA premium (`/analysis`):
    - shell dark avec overlays premium
    - cartes d'offres `precision-card` avec contraste renforce
    - mise en avant du plan recommande (accent gold)
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


## Sécurité - Journal d'audit (mise à jour 2026-03-20)

<!--
Résumé sécurité ajouté pour tracer les évolutions techniques côté production.
-->

- Hardening v1.1 implémenté:
  - journal d'audit sécurité Firestore (`security_audit_logs`)
  - endpoint d'audit frontend -> backend (`/api/security/audit`)
  - logs structurés avec IP + userId + horodatage serveur
- Événements audités:
  - connexion (succès/échec)
  - réinitialisation mot de passe (demande/finalisation)
  - suppression de données statistiques
  - suppression complète de compte
  - uploads (validation/succès/échec)
  - erreurs de sécurité 401/403/429
- Pages d'erreur applicatives ajoutées:
  - `404` (`app/not-found.tsx`)
  - `403` (`app/403/page.tsx`)
  - `501` (`app/501/page.tsx`)

## Sécurité - Purge mensuelle des logs (mise à jour 2026-03-21)

<!--
Purge automatique mensuelle des logs sécurité pour maîtriser la volumétrie Firestore.
-->

- Endpoint cron sécurisé ajouté: `GET /api/cron/security-audit-cleanup`
- Authentification par `Authorization: Bearer <CRON_SECRET>`
- Suppression mensuelle de tous les logs `security_audit_logs`
- Planification Vercel ajoutée (`vercel.json`):
  - `0 3 1 * *` (1er de chaque mois à 03:00 UTC)
- Variable d’environnement documentée:
  - `CRON_SECRET` dans `.env.example`
