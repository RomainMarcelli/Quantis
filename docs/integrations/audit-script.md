# `check-integration-audit.mts` — vérifier les logs d'API tierces

Script ops permettant de **lire la collection Firestore `integration_api_audit`**
sans ouvrir la Firebase Console. Utilise l'Admin SDK → bypass des règles
(la collection est verrouillée `read, write: if false` côté client).

Usage typique : valider qu'un sync MyUnisoft / Pennylane / Bridge a bien
journalisé ses appels API, ou diagnostiquer pourquoi un sync échoue
chez un bêta-testeur sans avoir accès à son compte.

## Prérequis

1. **Variables d'env Admin SDK** dans `.env` (cf. `.env.example`) :
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`

2. **Index Firestore composites** déployés (cf.
   [`firestore.indexes.json`](../../firestore.indexes.json)) :
   - `(provider ASC, createdAt DESC)` — pour les requêtes par provider
   - `(provider ASC, userId ASC, createdAt DESC)` — pour les filtres utilisateur

   Déploiement (à faire **une fois** par environnement) :
   ```bash
   firebase deploy --only firestore:indexes
   ```
   Ou via Console : Firestore → Indexes → suivre le lien d'erreur la 1ère
   fois que le script s'exécute.

## Usage

```bash
# Valeurs par défaut : provider=myunisoft, limit=20
npx tsx --env-file=.env scripts/check-integration-audit.mts

# Autre provider
npx tsx --env-file=.env scripts/check-integration-audit.mts --provider=pennylane --limit=50

# Filtre utilisateur précis (debug d'un bêta-testeur)
npx tsx --env-file=.env scripts/check-integration-audit.mts --userId=abc123 --limit=10

# Que les erreurs (status non-2xx ou network fail)
npx tsx --env-file=.env scripts/check-integration-audit.mts --only-errors --limit=50
```

## Options CLI

| Flag                | Défaut       | Description                                                              |
|---------------------|--------------|--------------------------------------------------------------------------|
| `--provider=<name>` | `myunisoft`  | `myunisoft` \| `pennylane` \| `bridge` \| `odoo` \| `fec`                |
| `--limit=<n>`       | `20`         | Nombre d'événements à afficher (1-200)                                   |
| `--userId=<uid>`    | (aucun)      | Filtre les événements d'un utilisateur précis                            |
| `--only-errors`     | `false`      | N'affiche que les events `ok=false` (status non-2xx ou network)          |

## Sortie attendue

```
▶ integration_api_audit · provider=myunisoft · limit=20
20 événement(s) · 19 OK · 1 ERR

timestamp           meth  stat  durée     endpoint                      userId                message
────────────────────────────────────────────────────────────────────────────────────────────────────
2026-05-07 22:16:42  GET    200    254 ms  /mad/balance                  Lp7…XYZ
2026-05-07 22:16:30  GET    200  12042 ms  /mad/entries                  Lp7…XYZ
2026-05-07 22:16:18  GET    200    942 ms  /mad/accounts                 Lp7…XYZ
2026-05-07 22:16:17  GET    200    198 ms  /mad/journals                 Lp7…XYZ
2026-05-07 22:16:16  GET    200    238 ms  /mad/exercices                Lp7…XYZ
2026-05-07 21:08:11  GET    401    180 ms  /mad/exercices                —                     Token expired
```

- **Vert** : appels OK (status 2xx).
- **Rouge** : status d'erreur HTTP (401, 404, 500, etc.).
- **Jaune** : erreurs réseau / timeout (status `-1`).

## Diagnostics types

| Symptôme                                        | Cause probable                                                          |
|-------------------------------------------------|--------------------------------------------------------------------------|
| `Aucun événement trouvé.`                       | Aucun sync n'a tourné, OU le code de logging n'est pas branché côté adapter, OU credentials Admin pointent sur le mauvais projet. |
| `9 FAILED_PRECONDITION: The query requires an index` | Index composite pas encore déployé — voir prérequis ci-dessus.            |
| `Variable d'env FIREBASE_* manquante.`          | `.env` non chargé (oublier `--env-file=.env`) ou clé absente du fichier. |
| Beaucoup d'erreurs `401` ou `403`               | JWT MyUnisoft / token Pennylane révoqué côté provider — refresh requis.  |
| Erreurs `429`                                   | Rate-limit du provider — le retry exponentiel devrait gérer, sinon ralentir le sync. |

## Implémentation

- Source : [`scripts/check-integration-audit.mts`](../../scripts/check-integration-audit.mts)
- Collection lue : `integration_api_audit` (cf. [`lib/server/integrationAudit.ts`](../../lib/server/integrationAudit.ts))
- Schéma documenté : [`docs/integrations/myunisoft-validation.md`](./myunisoft-validation.md#monitoring)
- Aucune écriture — script strictement read-only.
