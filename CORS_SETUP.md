# Configuration CORS pour l'API Python Vyzor

> Statut au 2026-04-01: guide valide et inchangé côté implémentation applicative Vyzor.
> Adapter uniquement la liste `allow_origins` selon les domaines réellement déployés.

## Problème

Erreur dans le navigateur :
```
Access to fetch at 'https://quantis-data-mapping.onrender.com/' from origin 'https://quantis-two.vercel.app' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

## Solution : Ajouter CORS dans votre API Python

### Si vous utilisez FastAPI

Dans votre fichier `api.py` (ou le fichier principal de votre API), ajoutez :

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# ⚠️ AJOUTEZ CE BLOC AVANT TOUTES VOS ROUTES
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://quantis-two.vercel.app",  # Votre domaine Vercel principal
        "https://*.vercel.app",  # Tous les previews Vercel (préfixe wildcard)
        "http://localhost:3000",  # Pour développement local
        "http://localhost:3001",  # Si vous utilisez un autre port
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Vos routes après...
@app.post("/map")
async def map_files(...):
    ...
```

### Si vous utilisez Flask

```python
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)

# ⚠️ AJOUTEZ CE BLOC
CORS(app, 
     origins=[
         "https://quantis-two.vercel.app",
         "https://*.vercel.app",
         "http://localhost:3000",
     ],
     supports_credentials=True)

# Vos routes après...
@app.route("/map", methods=["POST"])
def map_files():
    ...
```

### Si vous utilisez uvicorn directement avec FastAPI

Assurez-vous que le middleware CORS est ajouté **avant** de démarrer le serveur :

```python
# api.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://quantis-two.vercel.app",
        "https://*.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/map")
async def map_files(...):
    ...

# Dans votre main ou __main__
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

## Vérification

### 1. Testez CORS avec curl

```bash
curl -X OPTIONS https://quantis-data-mapping.onrender.com/map \
  -H "Origin: https://quantis-two.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

Vous devriez voir dans la réponse :
```
< HTTP/1.1 200 OK
< Access-Control-Allow-Origin: https://quantis-two.vercel.app
< Access-Control-Allow-Methods: POST, GET, OPTIONS
```

### 2. Testez depuis le navigateur

1. Ouvrez la console du navigateur (F12)
2. Dans la console, tapez :
```javascript
fetch('https://quantis-data-mapping.onrender.com/map', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
}).then(r => console.log('CORS OK:', r.status))
  .catch(e => console.error('CORS Error:', e))
```

Si vous voyez "CORS OK", c'est bon. Si vous voyez "CORS Error", CORS n'est pas encore configuré.

## Déploiement sur Render

Après avoir ajouté CORS dans votre code :

1. **Commit et push** vos changements
2. Render redéploiera automatiquement
3. Attendez que le déploiement soit terminé
4. Testez à nouveau depuis Vercel

## Configuration Alternative : CORS Permissif (Développement uniquement)

⚠️ **Ne pas utiliser en production** - seulement pour tester rapidement :

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ⚠️ Autorise tous les domaines
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Dépannage

### CORS fonctionne en local mais pas sur Render

- Vérifiez que le code avec CORS est bien déployé sur Render
- Vérifiez les logs Render pour voir si l'API démarre correctement
- Assurez-vous que le middleware CORS est ajouté **avant** les routes

### Erreur "No 'Access-Control-Allow-Origin' header"

- Vérifiez que le middleware CORS est bien ajouté
- Vérifiez que votre domaine Vercel est dans `allow_origins`
- Redéployez l'API Python après avoir ajouté CORS

### Erreur 405 Method Not Allowed

- Vérifiez que l'URL appelée est bien `/map` et pas `/`
- Vérifiez que la route `/map` existe dans votre API Python
- Vérifiez que la méthode HTTP est `POST`
