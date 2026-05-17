# FAQ — Mode Dirigeant Vyzor

### Mon expert-comptable utilise Vyzor — qu'est-ce que ça change pour moi ?

Rien dans l'immédiat. Votre cabinet voit vos chiffres dans son propre espace Vyzor (mode cabinet), mais vous gardez votre propre accès dirigeant avec votre propre dashboard. Les deux comptes sont indépendants — le cabinet ne voit pas votre simulateur, vos questions à l'assistant IA, ou vos notes personnelles. Vous ne voyez pas les commentaires du cabinet.

Si vous voulez partager vos chiffres avec votre cabinet de manière plus profonde (échange de rapports, commentaires partagés), c'est une feature prévue Q4 2026.

### Mes données financières sont-elles accessibles à d'autres cabinets ?

**Non.** Vos données sont strictement scopées à votre `userId` Firebase. Chaque requête API serveur valide que vous êtes le propriétaire de la Company avant de retourner quoi que ce soit. Aucun cabinet, aucun autre utilisateur Vyzor ne peut lire vos chiffres — même pas Antoine ou Romain en production. Les Firestore rules sont la dernière ligne de défense côté client SDK.

### Comment connecter mes propres données si mon cabinet ne les a pas encore importées ?

Le mode dirigeant Vyzor reste indépendant : vous pouvez connecter votre propre compte Pennylane (token API manuel), MyU, ou uploader vos FEC depuis `/documents` sans dépendre de votre cabinet. Vos données ne se mélangent pas avec celles de votre cabinet — ce sont deux flux distincts dans la même base.

### L'assistant IA a accès à quelles données ?

L'assistant IA n'accède qu'à **la Company que vous consultez actuellement**. Concrètement :
- Vos KPIs financiers (CA, EBE, BFR, trésorerie, ratios)
- Votre score Vyzor
- Vos questions précédentes dans la conversation en cours
- Le contexte de votre dossier (taille d'entreprise, secteur, exercice)

L'assistant n'accède **jamais** :
- Aux données d'autres utilisateurs
- À vos emails, contacts, calendrier
- À votre comptabilité brute (écritures détaillées) — il lit uniquement les agrégats
- À l'historique de vos questions sur d'autres dossiers (cas marginal multi-dossier futur)

Toutes les requêtes IA passent par notre backend qui filtre par `userId` avant tout appel au modèle.
