# FAQ — Mode Cabinet Vyzor

## Connexion et dossiers

### Comment connecter mon cabinet à Vyzor ?

Lors de votre inscription, choisissez **« Je gère un cabinet comptable »** sur l'écran d'orientation. Vous saisissez le nom de votre cabinet, puis vous êtes redirigé vers Pennylane pour autoriser l'accès (11 scopes lecture seule). Au retour, Vyzor vous propose la liste de vos dossiers clients — vous cochez ceux à activer.

### Combien de dossiers puis-je connecter ?

Tous les dossiers accessibles via votre compte cabinet Pennylane sont importés automatiquement. Vous décidez ensuite lesquels activer dans Vyzor (vous pouvez en garder 5 ou 50 — pas de limite imposée). Les dossiers non activés restent disponibles : vous pouvez les activer plus tard sans repasser par l'OAuth.

### Que se passe-t-il si un dossier n'est pas synchronisé ?

Sur votre portefeuille, chaque dossier affiche un badge :
- 🟢 **Sync OK** — données à jour
- 🟡 **Partiel** — sync incomplet, certaines entités manquent
- 🔴 **Erreur** — la dernière synchro a échoué
- ⚪ **Jamais syncé** — connexion établie, sync pas encore déclenché

Cliquez sur **« Synchroniser tous les dossiers »** en haut du portefeuille pour rejouer la synchronisation. Les sync échouent rarement — si ça persiste, vérifiez côté Pennylane que le token n'a pas été révoqué.

### Comment ajouter un nouveau dossier client après la connexion initiale ?

Bouton **« Ajouter un dossier »** en haut du portefeuille. Vous repassez par le picker qui liste tous les dossiers Pennylane accessibles (y compris ceux ajoutés à votre cabinet depuis votre dernière sync). Cochez-le et activez.

### Comment désactiver un dossier sans le supprimer ?

Depuis le picker (bouton « Ajouter un dossier » → vous revoyez la liste complète) : décochez le dossier et validez. Le mapping passe à `isActive=false`. Aucune donnée n'est perdue — les analyses, écritures et rapports historiques restent en base. Si vous le réactivez plus tard, vous retrouvez l'historique intact.

## Données et synchronisation

### À quelle fréquence les données sont-elles mises à jour ?

Synchronisation manuelle uniquement à ce stade. Cliquez sur **« Synchroniser tous »** dans le portefeuille pour rafraîchir tous vos dossiers en parallèle. Une synchronisation automatique quotidienne sera ajoutée dans une prochaine version.

### Les données de mes clients sont-elles isolées les unes des autres ?

Oui. Chaque dossier client est une **Company** distincte en base. Le sélecteur de dossier en haut de l'app charge les données du dossier sélectionné uniquement. L'assistant IA, le simulateur, les rapports sont tous scopés au dossier actif. Aucune fuite croisée possible — les Firestore rules vérifient l'appartenance à chaque requête.

### Que contient le rapport de synchronisation ?

Après un clic sur « Synchroniser tous », Vyzor affiche un récapitulatif par dossier :
- Nombre d'écritures importées
- Nombre de factures synchronisées
- Statut final (succès / partiel / échec)
- Durée

Si un dossier échoue, les autres continuent. Le bouton **« Réessayer »** ne porte que sur les dossiers en erreur.

## Compte et accès

### La connexion cabinet est-elle différente d'un compte dirigeant ?

Oui. Le mode **cabinet** (`accountType: "firm_member"`) débloque le portefeuille multi-dossiers, le sélecteur de Company, et l'OAuth Firm Pennylane. Le mode **dirigeant** (`accountType: "company_owner"`) reste le mode historique mono-dossier. Le choix se fait à l'inscription via l'écran d'orientation `/onboarding`.

### Puis-je avoir plusieurs membres dans mon cabinet ?

**Pas encore.** Cette fonctionnalité (invitations, gestion des rôles, audit des accès) est prévue pour Q3 2026. Pour l'instant, chaque cabinet a un seul utilisateur — l'`ownerUserId` qui a créé la Firm.

### Comment révoquer l'accès Pennylane ?

Deux options :
1. **Depuis Vyzor** : `/documents` → Connections → bouton « Déconnecter » sur votre Connection Pennylane Firm. Tous les mappings du cabinet passent à `isActive=false`. Les données historiques restent consultables.
2. **Depuis Pennylane** : Paramètres → Applications connectées → Révoquer l'accès Vyzor. À votre prochain sync, l'erreur est détectée et la Connection passe en statut `expired`.

Pour reconnecter, repassez par `/cabinet/onboarding/connect`. Les Companies existantes sont automatiquement réutilisées via les mappings sauvegardés (pas de doublons).
