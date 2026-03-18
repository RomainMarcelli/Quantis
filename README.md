# Quantis V2

Plateforme d'intelligence financière pour PME qui transforme les données comptables en analyses stratégiques via langage naturel.

## 🚀 Stack Technique

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (mapping + KPIs en mode démo, sans API externe)
- **Déploiement**: Vercel (un seul déploiement, pas de Render ni autre service)

## 📦 Installation

```bash
# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env

# Configurer OPENAI_API_KEY dans .env
```

## 🛠️ Développement

```bash
# Démarrer le serveur de développement
npm run dev

# Build pour production
npm run build

# Démarrer en mode production
npm start

# Linter
npm run lint
```

Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

## 🔧 Variables d'Environnement

| Variable | Description | Requis |
|----------|-------------|--------|
| `OPENAI_API_KEY` | Clé API OpenAI (optionnel, pour analyses avancées) | ❌ Non |

## 📁 Structure du Projet

```
├── app/                    # Pages et routes Next.js
│   ├── api/               # API Routes
│   └── page.tsx           # Page d'accueil
├── components/            # Composants React
│   ├── decision/         # Composants de décision
│   ├── dashboard/        # Dashboard KPI
│   └── ui/               # Composants UI réutilisables
├── lib/                   # Bibliothèques métier
│   ├── data-mapper/      # Mapping Excel/CSV → KPI (remplace l'API Python)
│   ├── analyzers/        # Analyseurs de décisions
│   ├── calculators/      # Calculateurs financiers
│   └── generators/       # Générateurs d'UI
├── types/                 # Types TypeScript
└── config/                # Configuration
```

## 🚢 Déploiement

Le projet est configuré pour Vercel. Voir `vercel.json` pour la configuration.

1. Connectez votre repository à Vercel
2. Configurez les variables d'environnement dans le dashboard Vercel
3. Le déploiement se fait automatiquement à chaque push

## 📝 Licence

Private - Tous droits réservés
