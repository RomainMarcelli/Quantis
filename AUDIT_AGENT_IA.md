# Audit factuel — Agent IA conversationnel Vyzor

Branche auditée : `feature/boat-claude`. Audit en lecture seule (aucun fichier modifié hors ce rapport).

---

## Section 1 — Inventaire des fichiers

### Pages (`app/assistant-ia/**`)

| Fichier | Lignes | Rôle |
|---|---|---|
| `app/assistant-ia/page.tsx` | 9 | Server component racine — monte `AssistantConversationsView`. |
| `app/assistant-ia/chat/page.tsx` | 20 | Wrapper server `force-dynamic` autour de `ChatClient`. |
| `app/assistant-ia/chat/ChatClient.tsx` | 62 | Client component qui lit les query params et instancie `AiChatFullPage`. |

### UI (`components/ai/**`, `components/assistant/**`)

| Fichier | Lignes | Rôle |
|---|---|---|
| `components/ai/AiChatFullPage.tsx` | 515 | Vue plein écran style ChatGPT/Claude — gère messages, input, quota, niveau, appel API. |
| `components/ai/AiMessageBubble.tsx` | 62 | Rendu d'un message (user à droite, assistant via `AiResponseCard`). |
| `components/ai/AiResponseCard.tsx` | 404 | Rendu des blocs structurés A-F (diagnostic, explication, data, comparaison, actions, follow-up). |
| `components/ai/AiDataCard.tsx` | 132 | Micro-card pour un chiffre clé dans la réponse structurée. |
| `components/ai/AiSparkline.tsx` | 87 | Sparkline inline pour data points. |
| `components/ai/AiSpinner.tsx` | 55 | Indicateur de chargement (typing dots). |
| `components/ai/MarkdownLite.tsx` | 159 | Renderer markdown minimal (gras, italique, listes). |
| `components/ai/UserLevelPicker.tsx` | 67 | Picker beginner/intermediate/expert. |
| `components/assistant/AssistantConversationsView.tsx` | 546 | Page d'accueil Assistant — hero, input, suggestions 2×2, historique compact. |
| `components/assistant/AssistantPlaceholder.tsx` | 187 | Composant placeholder (à vérifier avec Romain : usage réel dans le routing actuel). |

### Routes API (`app/api/ai/**`)

| Fichier | Lignes | Rôle |
|---|---|---|
| `app/api/ai/ask/route.ts` | 263 | POST — endpoint unique question → réponse (auth, quota, contexte analyse, persistance). |
| `app/api/ai/conversations/route.ts` | 34 | GET — liste les conversations + quota. |
| `app/api/ai/conversations/[conversationId]/route.ts` | 32 | GET — récupère une conversation entière avec messages. |

### Services / lib (`lib/ai/**`)

| Fichier | Lignes | Rôle |
|---|---|---|
| `lib/ai/aiService.ts` | 191 | Interface `AiService` + `MockAiService` + `ClaudeAiService` + factory `getAiService()`. |
| `lib/ai/promptBuilder.ts` | 258 | Construit le system prompt pseudo-XML (role, entreprise, donnees_kpi, contexte_focus, garde_fous, format_reponse). |
| `lib/ai/chatStore.ts` | 213 | Persistance Firestore des conversations (`chats/{userId}/conversations/{id}`). |
| `lib/ai/rateLimit.ts` | 95 | Quota 20 questions/jour/user en Firestore (`ai_usage/{userId}/daily/{YYYY-MM-DD}`). |
| `lib/ai/structuredResponse.ts` | 263 | Conversion markdown → `AiStructuredResponse` (blocs A-F). |
| `lib/ai/mockResponses.ts` | 261 | Réponses mock pré-générées par KPI/diagnostic. |
| `lib/ai/types.ts` | 159 | Types partagés (`UserLevel`, `ChatMessage`, `Conversation`, `AiResponse`, etc.). |
| `lib/ai/userLevel.ts` | 94 | Helper localStorage `quantis.userLevel`. |

### Tests

| Fichier | Lignes |
|---|---|
| `app/api/ai/ask/route.test.ts` | 207 |
| `lib/ai/aiService.test.ts` | 170 |
| `lib/ai/chatStore.test.ts` | 277 |
| `lib/ai/promptBuilder.test.ts` | 269 |
| `lib/ai/rateLimit.test.ts` | 122 |
| `components/ai/AiDataCard.test.tsx` | 64 |
| `components/ai/AiMessageBubble.test.tsx` | 60 |
| `components/ai/AiSparkline.test.tsx` | 49 |
| `components/ai/AiSpinner.test.tsx` | 33 |

Aucun fichier trouvé sous `services/ai*.ts`, `hooks/useAi*.ts`, `types/ai*.ts` — la couche IA vit entièrement sous `lib/ai/`.

---

## Section 2 — Architecture technique

- **Modèle IA** : Claude uniquement. Constante `CLAUDE_MODEL_ID = "claude-sonnet-4-6"` (`lib/ai/aiService.ts:35`), volontairement hardcodée (commentaire ligne 32-34 : "Volontairement non lu depuis l'env : on veut que la version soit traçable dans la conversation Firestore").
- **SDK** : `@anthropic-ai/sdk ^0.89.0` (`package.json:20`). Importé via `import Anthropic from "@anthropic-ai/sdk"` (`lib/ai/aiService.ts:24`).
- **Routing modèles** : un seul modèle pour le chat assistant. (Note : `services/pdf-analysis/` utilise `claude-haiku-4-5-20251001` et `claude-sonnet-4-6` pour le parser PDF, hors périmètre agent conversationnel.)
- **Streaming** : non. Appel bloquant `client.messages.create(...)` sans paramètre `stream`. Commentaire ligne 43-45 de `aiService.ts` : "pas de streaming pour la première version — on l'ajoutera quand le niveau 3 multi-tour sera priorisé".
- **Function calling / tools** : non. Aucun champ `tools` dans `messages.create`. Pas de tool_use dans le code. Les KPIs sont injectés directement dans le system prompt.
- **Persistance** : Firestore via admin SDK.
  - Conversations : `chats/{userId}/conversations/{conversationId}` (messages embedded dans le doc, append-only via `FieldValue.arrayUnion`, plafond 100 messages — `chatStore.ts:36, 162-180`).
  - Quota : `ai_usage/{userId}/daily/{YYYY-MM-DD}` avec `{ count, lastUsedAt }` (`rateLimit.ts:34-41`).
  - `localStorage` côté client uniquement pour `quantis.userLevel` (`userLevel.ts:17`).
- **Authentification** : route protégée par `requireAuthenticatedUser(request)` (`route.ts:63`) qui attend `Authorization: Bearer <Firebase ID token>`. Pas de `requireAdmin`. Ownership de l'analyse vérifié séparément (`fetchAnalysisOwnedBy`, ligne 202-218) et ownership conversation implicite via le chemin Firestore (`chats/{userId}/...`, `chatStore.ts:202-213`).
- **Garde-fous** :
  - Burst limiter IP/process 60 req/min via `enforceRouteRateLimit` (`route.ts:54-58`).
  - Quota quotidien 20 questions/user (`DAILY_AI_QUOTA = 20`, `rateLimit.ts:20`).
  - Plafond question 2000 caractères (`route.ts:85`).
  - `max_tokens = 600` sur la réponse Claude (`CLAUDE_MAX_TOKENS`, `aiService.ts:38`).
  - Fallback automatique sur `MockAiService` si l'API key Anthropic est absente (`aiService.ts:159-168`) ou si l'appel Claude jette (`aiService.ts:131-137`).

---

## Section 3 — Flow utilisateur actuel

### Étape 1 — Arrivée sur `/assistant-ia`

- URL : `/assistant-ia`
- Composant rendu : `app/assistant-ia/page.tsx` (server) → `<AssistantConversationsView>` (`components/assistant/AssistantConversationsView.tsx`).
- Effet au mount : `refresh()` appelle `GET /api/ai/conversations` avec `Authorization: Bearer <idToken>` (`AssistantConversationsView.tsx:103-114`).
- L'API charge `listConversations(userId)` (50 max, triés `lastMessageAt desc`) et `readRemainingQuota(userId)` en parallèle (`conversations/route.ts:25-28`).
- Affichage : hero "Que voulez-vous analyser ?", input large, compteur `{remaining} questions restantes aujourd'hui`, 4 suggestions, 3 conversations récentes + bouton "Tout voir (N)".

### Étape 2 — User tape "Quelle est ma santé financière ?" et soumet

- L'input est local (`draftQuestion`, ligne 71). Au submit (`handleSubmitDraft`, ligne 150) → `navigateToChat({ initialQuestion: trimmed })` qui fait `router.push("/assistant-ia/chat?q=Quelle...")` (ligne 137-148).
- Page `/assistant-ia/chat` (`force-dynamic`) monte `ChatClient` qui lit les query params (`kpiId`, `q`, `kpiValue`, `analysisId`, `conversationId`) puis instancie `<AiChatFullPage initialQuestion={...} />`.
- Dans `AiChatFullPage`, l'effet ligne 76-79 met `autoSendQuestion = initialQuestion`. Si `userLevel` est déjà choisi (sinon le `UserLevelPicker` s'affiche d'abord, ligne 278-280), l'effet ligne 173-179 appelle `sendQuestion(q)`.

### Étape 3 — Appel API

`sendQuestion` (ligne 105-170) :

1. Optimistic UI : ajoute le message user dans `messages` (ligne 114-117).
2. Récupère idToken via `firebaseAuthGateway.getIdToken()` (ligne 121-125).
3. `POST /api/ai/ask` avec body :
   ```json
   { question, kpiId, kpiValue, analysisId, conversationId, userLevel }
   ```
4. Attend la réponse JSON `{ answer, structured, conversationId, remainingQuota, mode, error }` (bloquant, pas de streaming).
5. Push le message assistant dans `messages` avec `structured` (du serveur OU dérivé via `buildStructuredFromMarkdown(answer, kpiId, kpiValue)`, ligne 152-158).
6. Met à jour `conversationId` et `remainingQuota`.

### Étape 4 — Côté serveur (`app/api/ai/ask/route.ts`)

1. Burst rate limit (60/min/IP) — ligne 54-59.
2. `requireAuthenticatedUser` — ligne 63.
3. Validation body : `question` non vide, ≤ 2000 chars — ligne 78-90.
4. `consumeDailyQuota(userId)` — refuse 429 si > 20/jour — ligne 108-117.
5. **Chargement analyse contextuelle** :
   - Si `analysisId` fourni → `fetchAnalysisOwnedBy` (vérif ownership) — ligne 130-136.
   - Sinon → `fetchLatestAnalysisForUser` charge la dernière analyse du user comme contexte par défaut (filtre `userId` puis tri en mémoire pour éviter index composite) — ligne 138, 235-263.
6. Si `conversationId` fourni → `getConversation` charge l'historique — ligne 142-152.
7. `getAiService().ask({ question, kpiId, kpiValue, analysis, userLevel, history })` — ligne 158-166.
8. **Persistance** : `addMessage` si conversation existante, sinon `createConversation` — ligne 169-186.
9. Réponse : `{ answer, structured, conversationId, remainingQuota, mode }`.

### Étape 5 — Construction du system prompt (`lib/ai/promptBuilder.ts:53-75`)

Format pseudo-XML, sections concaténées par `\n\n` :

- `<role>` : phrase par `userLevel` (beginner / intermediate / expert), avec vouvoiement et persona "Vyzor, CFO digital".
- `<entreprise>` : `Dossier / Secteur / Taille / Exercice` extraits de `analysis.uploadContext` et `analysis.fiscalYear`.
- `<donnees_kpi>` : tous les KPIs non-null de `analysis.kpis`, formatés via `getKpiDefinition` + diagnostic (`good`/`danger`/`warning`) + extrait des postes mappedData (production, achats, salaires, capitaux propres, dettes, dispo, clients, fournisseurs, stocks, total actif).
- `<contexte_focus>` (optionnel, si `kpiId` fourni) : label, valeur, diagnostic, formule, tooltip explicatif du KPI.
- `<garde_fous>` : périmètre financier exclusivement, interdiction d'inventer des chiffres absents, vouvoiement, pas de conseil d'investissement.
- `<format_reponse>` : markdown, 200 mots max, citer les chiffres, terminer par 1 action à l'impératif < 90 jours.

### Étape 6 — Appel Claude (`lib/ai/aiService.ts:100-138`)

```ts
const response = await client.messages.create({
  model: CLAUDE_MODEL_ID,            // "claude-sonnet-4-6"
  max_tokens: CLAUDE_MAX_TOKENS,     // 600
  system: systemPrompt,
  messages: [...history, { role: "user", content: question }]
});
```

`history` est mappé directement (`role` + `content`, le `timestamp` est dropé). Pas de streaming, pas de tools, pas de cache prompt.

---

## Section 4 — Patterns / décisions techniques notables

- **Accès aux KPIs réels** : par **injection dans le system prompt**, pas via function calling. Le serveur charge `AnalysisRecord` depuis Firestore (collection `analyses`), filtre les KPIs non-null, et les insère textuellement dans `<donnees_kpi>` avec leur diagnostic vs seuils (`promptBuilder.ts:137-147`). Le commentaire ligne 152 précise : *"KPIs calculés (les seules valeurs que tu peux citer)"*.
- **Contexte analyse par défaut** : si le front n'envoie pas d'`analysisId`, le serveur charge **automatiquement** la dernière analyse du user (`fetchLatestAnalysisForUser`, `route.ts:235-263`). Justification dans le commentaire ligne 119-128 : éviter "je n'ai pas vos données" alors qu'une analyse existe en BDD. Index Firestore évité : `where("userId", "==", userId).get()` puis tri en mémoire par `createdAt`.
- **Override `kpiValue`** : le front peut passer `kpiValue` quand il a la valeur mais pas l'`analysisId` (tooltip widget hors page analyse). Priorité dans `getKpiValue` (`aiService.ts:183-191`) : 1) `params.kpiValue`, 2) `analysis.kpis[kpiId]`, 3) null. Permet au prompt de citer la valeur réelle même sans analyse complète chargée.
- **Historique conversation** : embedded array dans le doc Firestore (`messages: PersistedMessage[]`), append-only via `FieldValue.arrayUnion`. Plafond `MAX_MESSAGES_PER_CONVERSATION = 100` (`chatStore.ts:36, 162-166`). Tout l'historique est renvoyé à Claude à chaque tour (pas de troncation/summarization).
- **Routing par type de question** : aucun. Une seule route, un seul modèle, un seul prompt. Le branchement par `userLevel` change uniquement la phrase de rôle dans `<role>` (`promptBuilder.ts:38-45`). Pas de classification d'intent côté serveur.
- **Réponse structurée** : Claude renvoie du markdown libre. Le serveur retourne `structured: null` en mode Claude réel (`buildStructuredFromContext` n'est appelé que par `MockAiService`, `aiService.ts:73-77`). Le front fallback sur `buildStructuredFromMarkdown(answer, kpiId, kpiValue)` côté client (`AiChatFullPage.tsx:152-154`) pour extraire diagnostic / explanation / actions / follow-ups depuis le `kpiRegistry`. **À vérifier avec Romain** : intention de générer du structuré côté Claude (via tools / JSON mode) ou de rester sur le post-traitement markdown.
- **Fallback mock** : `ClaudeAiService` retombe sur `MockAiService` en cas d'erreur API (`aiService.ts:131-137`). En l'absence de `ANTHROPIC_API_KEY`, `getAiService()` retourne directement le mock (`aiService.ts:159-168`).
- **Niveau utilisateur** : persisté `localStorage` côté client (`quantis.userLevel`), envoyé en body à chaque appel. Pas de persistance Firestore par user.
- **Audit traçabilité** : commentaire `promptBuilder.ts:51` mentionne un `systemPromptHash` dans Firestore — **à vérifier avec Romain** : non implémenté côté `chatStore.ts` actuel (le schéma `PersistedConversation` n'a pas ce champ).

---

## Section 5 — État des fonctionnalités

Légende : 🟢 implémenté+fonctionnel · 🟡 incomplet/buggé · 🔴 non implémenté

| # | Fonctionnalité | Statut | Justification |
|---|---|---|---|
| 1 | Envoi message + réponse IA | 🟢 | `POST /api/ai/ask` complet avec `client.messages.create` (`aiService.ts:118-123`). Fallback mock si pas de clé. |
| 2 | Historique conversation persisté | 🟢 | `createConversation` + `addMessage` en Firestore embedded, append-only (`chatStore.ts:101-180`). |
| 3 | Sidebar "Conversations récentes" | 🟡 | Section "Conversations récentes" affichée sur la page d'accueil `/assistant-ia` (`AssistantConversationsView.tsx:305-377`), mais pas de sidebar permanente *dans* la page chat. Sur `/assistant-ia/chat`, seule l'`AppSidebar` globale est visible — pas de liste des conversations. |
| 4 | Page liste de toutes les conversations | 🟡 | Pas de page dédiée. Toggle `showAllConversations` sur la page d'accueil (`AssistantConversationsView.tsx:73, 161-166`) qui déplie la liste in-situ. Limite hard 50 conversations côté API (`chatStore.ts:190`). |
| 5 | Edit titre conversation | 🔴 | Aucune route PATCH/PUT sur `/api/ai/conversations`. Le titre est figé à la création (`= truncate(question, 80)`, `chatStore.ts:123`). |
| 6 | Suppression conversation | 🔴 | Aucune route DELETE. Pas d'export de `deleteConversation` dans `chatStore.ts`. |
| 7 | Épinglage conversation | 🔴 | Pas de champ `pinned` dans `PersistedConversation` (`chatStore.ts:44-52`). Pas d'UI associée. |
| 8 | Menu 3 points (actions) sur conversation | 🔴 | `ConversationRow` (`AssistantConversationsView.tsx:441-515`) n'a qu'un bouton "ouvrir" — pas de menu kebab / dropdown actions. |
| 9 | Accès aux KPIs réels | 🟢 | Injection directe dans `<donnees_kpi>` du system prompt + chargement automatique de la dernière analyse (`promptBuilder.ts:113-158`, `route.ts:129-139`). Pas via function calling. |
| 10 | Streaming réponse | 🔴 | `messages.create` bloquant, pas de `stream: true` (`aiService.ts:118`). Commentaire explicite ligne 43-45 : "pas de streaming pour la première version". |
| 11 | Markdown rendering | 🟢 | `MarkdownLite.tsx` (159 lignes) + post-traitement via `AiResponseCard` / `structuredResponse.ts` pour blocs A-F. |
| 12 | Indicateur typing dots | 🟢 | `<AiSpinner />` affiché tant que `loading === true` (`AiChatFullPage.tsx:297`). |
| 13 | Gestion erreur (rate limit, network) | 🟢 | 429 retourné si quota atteint (`route.ts:109-117`), 403 ownership, 404 conversation introuvable, 400 body invalide. Côté front : `setErrorMessage` + bandeau rouge (`AiChatFullPage.tsx:299-310`). Fallback mock si l'appel Claude jette (`aiService.ts:131-137`). |
| 14 | Coût / monitoring tokens | 🔴 | Aucun comptage de tokens. La réponse Claude (`response.usage`) n'est jamais lue dans `aiService.ts`. Seul un compteur d'appels existe (`ai_usage/{userId}/daily/{day}.count`), pas de tokens entrée/sortie ni de coût €. |

---

## Section 6 — Code samples clés

### Composant principal de la page chat — appel API

`components/ai/AiChatFullPage.tsx:120-162`

```tsx
const { firebaseAuthGateway } = await import("@/services/auth");
const idToken = await firebaseAuthGateway.getIdToken();
if (!idToken) {
  throw new Error("Vous devez être connecté pour poser une question.");
}
const res = await fetch("/api/ai/ask", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${idToken}`,
  },
  body: JSON.stringify({
    question: trimmed,
    kpiId: props.kpiId,
    kpiValue: props.kpiValue ?? null,
    analysisId: props.analysisId ?? null,
    conversationId,
    userLevel: level,
  }),
});
const json = (await res.json()) as {
  answer?: string;
  structured?: AiStructuredResponse | null;
  conversationId?: string;
  remainingQuota?: number;
  error?: string;
};
```

### Route API — appel SDK Claude

`lib/ai/aiService.ts:100-130`

```ts
async ask(params: AiAskParams): Promise<AiResponse> {
  try {
    const client = new Anthropic({ apiKey: this.apiKey });
    const systemPrompt = buildSystemPrompt({
      analysis: params.analysis,
      kpiId: params.kpiId,
      kpiValue: params.kpiValue ?? null,
      userLevel: params.userLevel,
    });

    const messages = [
      ...(params.history ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user" as const, content: params.question },
    ];

    const response = await client.messages.create({
      model: CLAUDE_MODEL_ID,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: systemPrompt,
      messages,
    });
    // ...
    return { answer, mode: "claude", modelId: CLAUDE_MODEL_ID };
```

### System prompt — section KPIs

`lib/ai/promptBuilder.ts:137-158`

```ts
const kpiLines: string[] = [];
const kpis = analysis.kpis as Record<string, number | null | undefined>;
for (const [id, value] of Object.entries(kpis)) {
  if (value === null || value === undefined || !Number.isFinite(value as number)) continue;
  const def = getKpiDefinition(id);
  if (!def) continue;
  const valueStr = formatKpiValue(def.unit, value as number);
  const diagnostic = getKpiDiagnostic(value as number, def.thresholds);
  const tag = diagnostic !== "neutral" ? ` [${diagnostic}]` : "";
  kpiLines.push(`- ${id} (${def.label}) : ${valueStr}${tag}`);
}

const mappedLines = buildMappedDataExtract(analysis);

return [
  "KPIs calculés (les seules valeurs que tu peux citer) :",
  kpiLines.length > 0 ? kpiLines.join("\n") : "Aucun KPI calculé.",
  "",
  "Postes du compte de résultat / bilan (extrait) :",
  mappedLines,
].join("\n");
```

### Service de persistance — création conversation

`lib/ai/chatStore.ts:101-141`

```ts
export async function createConversation(params: {
  userId: string;
  kpiId: string | null;
  question: string;
  answer: string;
}): Promise<Conversation> {
  const now = Timestamp.now();
  const userMessage: PersistedMessage = { role: "user", content: params.question, timestamp: now };
  const assistantMessage: PersistedMessage = { role: "assistant", content: params.answer, timestamp: now };

  const data: PersistedConversation = {
    kpiId: params.kpiId,
    createdAt: now,
    lastMessageAt: now,
    title: truncate(params.question, TITLE_MAX_LENGTH),
    messages: [userMessage, assistantMessage],
    messageCount: 2,
    lastAnswerPreview: truncate(params.answer, PREVIEW_MAX_LENGTH),
  };

  const ref = await conversationsCollection(params.userId).add(data);
  return { id: ref.id, /* ... */ };
}
```

---

## Section 7 — Branches et commits

Commande exécutée : `git log --oneline --all -i --grep="ai-chat|assistant|claude|\bai\b"` — 188 résultats au total. Beaucoup matchent sur le mot "ai" présent dans des mots français ("d'analyse", "mais", etc.) ou sur "Assistant" comme nom de section UI sans rapport avec l'agent IA. Sélection des 30 plus récents avec leur apport déductible :

| Hash | Sujet | Apport déduit |
|---|---|---|
| `3e1ceb9` | fix(auth): wizard inscription — selects natifs | Hors périmètre agent IA (auth). |
| `b6aaa78` | docs(security): preuves tests manuels | Hors périmètre agent IA. |
| `8b8b31c` | feat: exports modulaires + États fin + UX sidebar | Hors périmètre agent IA. |
| `523bc6c` | feat(reports): rapport synthèse modulaire | Hors périmètre agent IA. |
| `b040149` | fix(layout): sticky header | Hors périmètre agent IA. |
| `4bfede5` | feat(layout): sidebar permanente, header sticky | Layout global incluant pages assistant. |
| `8f69104` | feat(dashboard): widgets + alertes KPI | Hors périmètre agent IA. |
| `a9414eb` | feat(header): Tableau de bord dropdown PDF/Word | Hors périmètre agent IA. |
| `5215294` | feat(header): bouton "Exporter la synthèse" gold | Hors périmètre agent IA. |
| `7a1cb63` | feat(header): pages data variant="data" | Hors périmètre agent IA. |
| `50ee0a0` | feat(header): refonte AppHeader unifié | Header utilisé par /assistant-ia (variant simple). |
| `eebfb1c` | **fix(assistant)**: brique principale pleine largeur | UI page assistant — pleine largeur. |
| `2ec8d10` | feat(simulator): panneau autonome | Hors périmètre agent IA. |
| `9792160` | **fix(theme/light): chat IA** — inline colors → CSS vars | Migration couleurs chat IA en mode clair. |
| `7613045` | **fix(theme/light): chat IA** — couleurs hardcodées migrées | Migration couleurs chat IA. |
| `6d84d13` | **feat(assistant)**: refonte page d'accueil hero + suggestions 2×2 + historique | Refonte UI page `/assistant-ia` (état actuel). |
| `0c95870` | fix(theme/light): KpiTooltip texte noir + IA en gold-deep | Tooltip KPI (lien vers question IA). |
| `503980e` | feat(synthese): data-attributes Synthèse v2 | Hors périmètre agent IA. |
| `5062fd4` | feat(theme/light): Synthèse v2 + bannière agent identity | Bannière identité agent (UI). |
| `d71ef7e` | **feat(theme/light): Phase 7 — Assistant IA chat conversationnel mode clair** | Phase mode clair de la page chat IA. |
| `9d8ead0` | feat(theme/light): Phase 5+6+9 boutons + glass + micro-interactions | Hors périmètre agent IA. |
| `6da11ec` | feat(theme/light): Phase 4 Cards KPI mode clair | Hors périmètre agent IA. |
| `861bc69` | feat(theme/light): Phase 3 Vyzor Score | Hors périmètre agent IA. |
| `4ac4486` | feat(theme/light): Phase 1+2 design tokens + sidebar | Hors périmètre agent IA. |
| `b841637` | refactor(dashboard): retirer KpiEvolutionChart | Hors périmètre agent IA. |
| `bceeaf8` | Merge branch 'features' → audit-prodiges | Merge. |
| `9ef6263` | docs(security): audit Prodiges mai 2026 | Doc audit (cite `@anthropic-ai/sdk` vulnérabilité MemoryTool dev-only). |
| `1aed5f2` | merge: feature/myunisoft-integration | Merge. |
| `6887341` | feat(dashboard+reports): widgets perso. iOS-style + rapport modulaire | Hors périmètre agent IA. |
| `05df106` | merge: feature/mode-clair → features | Merge incluant Phase 7 chat IA. |

**Lecture globale** : la grep est très bruitée. Les seuls commits réellement liés à l'agent conversationnel dans la fenêtre récente sont `6d84d13` (refonte page d'accueil assistant), `d71ef7e` (mode clair chat IA), `9792160` / `7613045` (migration couleurs chat IA → CSS vars) et `eebfb1c` (UI pleine largeur). **À vérifier avec Romain** : si la majorité du code IA (routes, prompt builder, chatStore, aiService) a été développée sur une branche non encore mergée ou sur des commits dont les messages ne contiennent pas les mots-clés grep — un `git log --oneline -- lib/ai/ app/api/ai/ app/assistant-ia/` ciblé donnerait l'historique réel de la feature.

---

## Confirmation finale

Aucun fichier n'a été modifié sur cette branche en dehors de `c:\RomainM\Quantis\QuantisV3\AUDIT_AGENT_IA.md` (créé par le présent audit). `lib/ai/aiService.test.ts` apparaissait déjà comme modifié dans le `git status` initial, indépendamment de cet audit.
