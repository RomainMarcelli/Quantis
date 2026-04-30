# Couche IA — Architecture

> Document de cadrage. Décrit **comment** l'IA s'intègre dans Vyzor, **pas
> encore implémenté** (sauf la couche 1 statique). À lire après
> [ARCHITECTURE.md](./ARCHITECTURE.md).
>
> Modèle cible : **Claude Sonnet 4.6** par défaut, **Haiku 4.5** en repli pour
> les requêtes à très faible latence (tooltip enrichi à la volée).

## Principes

1. **Pas d'IA pour ce qui est déterministe.** Les explications de KPI, les
   formules, les seuils sont déjà dans le `kpiRegistry`. Aucun appel API n'est
   nécessaire pour afficher un tooltip.
2. **L'IA enrichit, ne remplace jamais le calcul.** Elle ne calcule pas un
   KPI — elle commente une valeur déjà calculée.
3. **Périmètre fermé.** L'IA n'invente pas de chiffres. Le system prompt
   contient la totalité des données qu'elle est autorisée à citer ; elle
   refuse les questions hors périmètre (juridique, fiscal, conseil patrimonial).
4. **Traçabilité.** Toute conversation est stockée en Firestore avec le
   contexte complet (KPIs au moment du chat, version du modèle, prompt système).

## Trois niveaux

### Niveau 1 — Tooltip déterministe (livré dans la fondation)

| Quoi | "Comment lire ce KPI ?" + "Que faire ?" |
|---|---|
| Source | `kpiRegistry[kpiId].tooltip` + `.suggestedQuestions` |
| Appel API | **0** |
| Latence | < 16 ms (rendu local) |
| Coût | nul |
| Personnalisation | Aucune |

Implémenté côté front via `KpiCard` qui lit le registre. Aucune décision IA —
c'est de la doc statique projetée.

**Quand l'utiliser** : sur 100% des KPIs, en survol ou clic sur l'icône info.

### Niveau 2 — Question suggérée (1 appel)

| Quoi | "Pourquoi mon DSO est passé de 45 à 78 jours ?" → réponse contextualisée |
|---|---|
| Source | Claude Sonnet 4.6, 1 appel `messages.create` (non-streaming) |
| Appel API | 1 |
| Latence cible | < 3 s |
| Personnalisation | Système prompt contient les données réelles de l'entreprise |

L'utilisateur clique sur une `suggestedQuestions.whenGood` ou `.whenBad` (selon
le seuil franchi par la valeur courante). On envoie un message unique :

```
system: <SYSTEM_PROMPT — voir §"Format du system prompt">
user: <la question suggérée littérale>
```

Réponse en clair, 4-8 phrases, ton coach financier. Pas de markdown structuré
côté API (le front le formate s'il veut).

**Garde-fou** : longueur de réponse capée (`max_tokens: 600`). Au-delà, on
tronque + bouton "Continuer dans le chat" (= passe au niveau 3).

### Niveau 3 — Chat libre multi-tour

| Quoi | Conversation libre, contexte KPI préservé entre tours |
|---|---|
| Source | Claude Sonnet 4.6, streaming, multi-tour |
| Appel API | N (1 par tour utilisateur) |
| Latence cible | TTFT < 1 s, total < 8 s par réponse |
| Personnalisation | System prompt fixe pour la session + historique des messages |

**Ouverture** : depuis n'importe quel KPI ("Approfondir") OU depuis le menu
global ("Discuter avec l'analyste IA"). Si ouvert depuis un KPI, le `kpiId`
courant est injecté dans le system prompt comme "focus initial" — l'IA en
parle en premier puis suit la conversation.

**Stockage** : chaque message persisté en Firestore (cf. §"Stockage des
conversations").

**Limites de session** : 50 tours max par conversation (au-delà, force la
création d'une nouvelle conversation pour éviter la dérive de contexte).
Window de contexte effective ~50k tokens (largement sous la limite Claude).

## Format du system prompt

Construit côté serveur (route `/api/ai/chat`), jamais côté client. Sa structure :

```
<role>
Tu es Vyzor, l'analyste financier de poche d'un dirigeant de PME française.
Tu commentes des chiffres, tu n'en inventes pas. Tu vulgarises sans simplifier
abusivement. Ton ton : factuel, direct, sans jargon inutile, en français.
</role>

<entreprise>
Nom : {{companyName}}
Secteur : {{sector}}
Taille : {{employees}} salariés
Exercice analysé : {{fiscalYear}}
Période sélectionnée par l'utilisateur : {{periodStart}} → {{periodEnd}}
Source des données : {{sourceProvider}} (sync il y a {{syncAge}})
</entreprise>

<donnees_kpi>
{{ Pour chaque KPI catégorie 'creation_valeur', 'investissement', etc. : }}
{{ - id, label, valeur formatée, comparaison vs N-1 si dispo, statut vs threshold }}

Exemple :
- ca : 222 262 € (vs 195 000 € en N-1, +14%)
- ebitda : -159 298 € (zone rouge — seuil = 0)
- bfr : -215 298 € (anormalement négatif — alerte affichée)
- dso : 376 j (zone rouge — seuil danger = 120 j)
...
</donnees_kpi>

<contexte_focus>
{{ Si chat ouvert depuis un KPI }} :
L'utilisateur a cliqué depuis le KPI "{{kpiId}}" ({{label}}).
Sa valeur actuelle : {{valeurFormatée}}.
Sa formule : {{formula}}.
Tooltip de référence : {{tooltip.explanation}}.
</contexte_focus>

<garde_fous>
- Ne donne JAMAIS de conseil juridique, fiscal ou patrimonial. Renvoie vers un
  expert-comptable ou un avocat si la question l'exige.
- Ne propose JAMAIS de chiffres que tu n'as pas dans <donnees_kpi>.
- Si l'utilisateur demande une projection chiffrée, propose plutôt d'utiliser
  l'outil de simulation (Embauche, Hausse de prix, etc.) en citant le scénario.
- Si la question sort du périmètre financier (RH, marketing, légal pur),
  réponds-lui que ce n'est pas ton domaine et redirige.
</garde_fous>

<format_reponse>
- 4 à 10 phrases en mode "question suggérée" (niveau 2).
- Pas de bullet points sauf si l'utilisateur demande explicitement une liste.
- Cite TOUJOURS les valeurs en €/% précises depuis <donnees_kpi>.
- Si tu identifies une cause, propose 1 ou 2 actions concrètes.
</format_reponse>
```

**Total cible** : ~3 000 à 5 000 tokens injectés en system prompt selon la
densité des KPIs disponibles. Reste sous la limite Claude (200k input window)
avec marge confortable même sur des comparaisons multi-exercices.

**Mise en cache** : utiliser le **prompt caching Anthropic** sur le bloc
`<role>` + `<garde_fous>` (statiques) + `<entreprise>` + `<donnees_kpi>`
(stable sur la durée d'une session). Cache hit = 90 % de réduction du coût
input sur les tours suivants d'un même chat.

## Stockage des conversations

Collection Firestore : **`chats`** avec sous-collection messages.

```
chats/{userId}/conversations/{conversationId}
  ├── createdAt: Timestamp
  ├── lastMessageAt: Timestamp
  ├── analysisId: string         (analyse de référence au moment de l'ouverture)
  ├── focusKpiId: string | null  (si ouvert depuis un KPI)
  ├── modelVersion: string       ("claude-sonnet-4-6")
  ├── systemPromptHash: string   (sha256 du system prompt — pour audit)
  ├── messageCount: number
  └── messages/{messageId}
       ├── role: "user" | "assistant"
       ├── content: string
       ├── createdAt: Timestamp
       ├── tokensInput?: number
       ├── tokensOutput?: number
       └── feedbackRating?: -1 | 0 | 1   (👎 / neutre / 👍 — ajouté en MT)
```

Une conversation est immuable côté ancien message — on append uniquement.
Suppression possible à la demande RGPD : `deleteChat(userId, conversationId)`
qui efface le doc + la sous-collection en batch.

## Routes API prévues

| Route | Méthode | Description |
|---|---|---|
| `/api/ai/suggested` | POST | Niveau 2. Body : `{ analysisId, kpiId, mode: "good" \| "bad" }`. Retourne `{ answer, conversationId }` (ouvre une conversation au cas où l'utilisateur enchaîne). |
| `/api/ai/chat` | POST | Niveau 3 (envoi d'un tour). Body : `{ conversationId, content }`. Streaming SSE en sortie. |
| `/api/ai/chat/list` | GET | Liste des conversations de l'utilisateur. |
| `/api/ai/chat/:id` | GET | Récupère une conversation entière (messages). |
| `/api/ai/chat/:id` | DELETE | Supprime une conversation. |

Toutes auth-gated (`requireAuthenticatedUser`). Rate-limit serré sur les routes
"chat" (coût API) — typiquement 30 messages / min / utilisateur.

## Observabilité

- Chaque appel logue : `{userId, conversationId, modelVersion, tokensInput,
  tokensOutput, latencyMs, cacheHitRate}` dans une collection `ai_telemetry/`.
- Dashboard interne (Grafana / Looker, MT) pour suivre :
  coût total $/jour, latence p50/p95, taux de cache hit, ratio
  niveau-2 vs niveau-3.
- **Évaluation qualitative** (LT) : sample de 50 conversations / mois
  scorées par un humain pour détecter dérives (hallucinations, conseils
  hors périmètre).

## Sécurité et conformité

1. **Pas de PII dans le system prompt.** Le contexte entreprise se limite à
   ce qui est déjà dans Firestore (nom de société, secteur, KPIs). Pas de noms
   de salariés, pas d'IBAN, pas de SIREN si non nécessaire.
2. **Tokens API Anthropic** stockés en variable d'env (`ANTHROPIC_API_KEY`),
   jamais commités ni envoyés côté client.
3. **RGPD** : possibilité d'export des conversations + suppression sur demande.
   Conservation par défaut 24 mois (alignée sur la durée de stockage des
   analyses).
4. **Mention IA** : chaque réponse niveau 2/3 est précédée côté UI d'une
   icône "réponse générée par IA" + tooltip "L'analyste IA peut se tromper —
   vérifie les chiffres si tu les utilises pour une décision".

## Roadmap d'implémentation

| Étape | Statut | Détail |
|---|---|---|
| Niveau 1 (tooltip statique) | ✅ Fondation livrée | `kpiRegistry.tooltip.*` et `suggestedQuestions.*` peuplés. Le rendu UI est à câbler dans `KpiCard`. |
| Niveau 2 (question suggérée) | 🔜 MT | Route `/api/ai/suggested` + intégration `KpiCard` (bouton "Pourquoi ?"). |
| Niveau 3 (chat) | 🔜 MT | `AiChatPanel` (slide-over latéral) + route `/api/ai/chat` streaming + persistance Firestore. |
| Cache prompt + telemetry | MT | Activer dès la mise en prod du niveau 2. |
| Évaluation qualitative | LT | Process humain mensuel + tableau de bord interne. |
