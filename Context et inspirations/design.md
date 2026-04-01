## Statut document (mise a jour 2026-04-01)

Ce fichier est un blueprint design/inspiration.
Le rendu effectif de l'application suit la DA premium Quantis implementee dans `components/` et documentee dans `projet.md`.

---

💎 QUANTIS : PRODUCT BLUEPRINT (Version Validée)
Concept UX : Le "Navigateur Financier Sécurisé". Style Visuel : "Premium Fintech" (Grille modulaire Bento, palette restreinte, finitions matte/metal). Device : Desktop First (Architecture PC large).

1. STRUCTURE GLOBALE : "BROWSER-LIKE"
L'application ne se comporte pas comme un site web classique, mais comme un navigateur.
Header (Fixe) :
À gauche : Logo Quantis (Solide).
Au centre : The Decision Bar.
À droite : Indicateur "Secure Vault" (Statut des données : 🟢 À jour).
Barre d'Onglets (Sous le header) :
Onglet 1 (Fixe & Indestructible) : [ 🏠 Dashboard ]
Onglets suivants (Dynamiques) : [ ⚡ Recrutement ] [ 📦 Stock ] (S'ouvrent quand on pose une question).

2. ONGLET PRINCIPAL : [ 🏠 DASHBOARD ]
L'espace de pilotage quotidien. Pas de longs textes, de l'efficacité visuelle.
A. The Insight Feed (Grille Bento)
Une grille de "Smart Widgets" modulaires (carrés et rectangulaires).
Widget "Santé Globale" (1x1) : Une jauge circulaire (Design "15% Completed" de ta ref). Code couleur (Emerald/Crimson). Insight : "Structure saine."
Widget "Argent Dormant" (2x1) :
Gros chiffre clé : 24 000 €.
Mini-graphique (Sparkline) à côté.
Micro-Insight : "Stocks lents détectés." (Clic = ouvre le détail).
Widget "Flux & Alertes" (1x2) : Liste verticale des 3 dernières notifs importantes (Retards clients, échéances fiscales).
B. The Secure Vault (Zone d'Ingestion)
Discrètement intégrée (peut-être en bas de grille ou via un bouton flottant "Mettre à jour").
Drag & drop sécurisé avec feedback immédiat (Checklist verte).

3. ONGLETS DYNAMIQUES : [ ⚡ DECISION MODE ]
L'interface qui s'ouvre quand on tape une question dans la Decision Bar (ex: "Puis-je recruter ?").
A. Le Canvas (Zone Centrale)
L'espace de projection visuelle.
Affiche les courbes comparatives (Avant/Après décision).
Affiche les chiffres clés de l'impact (Coût total, Impact Tréso).
C'est ici que l'utilisateur voit la réponse.
B. Le Chat & Hypothèses (Zone Basse)
L'intelligence conversationnelle.
The Hypothesis Chips (Les Puces Flottantes) :
Juste au-dessus de la zone de saisie (pas de barre lourde).
Des "Chips" (pilules) cliquables qui résument les paramètres compris par l'IA.
Visuel : [ Salaire: 45k€ ✏️ ] [ Date: Janvier ✏️ ]
Interaction : Un clic ouvre une mini-bulle pour modifier la valeur sans avoir à écrire. Le Canvas se met à jour en temps réel.
The Chat Input (En bas) :
L'IA explique son raisonnement ou demande une info manquante.
IA : "J'ai simulé un salaire de 45k€. Attention, cela réduit votre marge de sécurité en mars."

4. LA MÉCANIQUE "WOW" (User Journey)
Drop : Je glisse mon bilan dans le Vault. ✅ Validé.
Scan : Je regarde mon Bento. Une case "Argent Dormant" est orange.
Ask : Je clique dans la Decision Bar en haut. Je tape : "Comment optimiser mon stock ?".
Focus : Un nouvel onglet [ 📦 Stock ] s'ouvre.
Tweak : Je vois la courbe. Je clique sur le Chip [ Rotation: 60j ] au-dessus du chat. Je mets 45.
Result : La courbe grimpe. L'IA confirme : "Vous libérez 15k€."
Close : Je ferme l'onglet. Je reviens au Dashboard.



QUANTIS — DESIGN BRIEF (PART 1: STYLE & ART DIRECTION)

Version : Premium Fintech (Qonto-like)

1. VISION & IDENTITÉ VISUELLE

Le Pitch Visuel : "Quiet Luxury". L'interface ne doit pas crier. Elle doit ressembler à une invitation dans un club privé. C'est propre, lumineux, avec des touches de matériaux précieux. L'Inspiration : Qonto (pour la structure clean), Apple (pour les blancs), Amex Centurion (pour le noir mat).

Les 3 Piliers Esthétiques :

Radical Cleanliness : Des fonds blancs purs, des bordures grises ultra-fines. On évite les ombres lourdes. Tout est plat (Flat) ou très légèrement surélevé.

Material Design (Matte & Metal) : On joue sur les textures suggérées. Le noir n'est pas juste noir, c'est un "Noir Charbon Mat". Le doré n'est pas jaune, c'est un "Laiton brossé" ou "Champagne".

Sharp Contrast : L'écriture est noire sur blanc. Pas de gris moyen illisible. C'est binaire et efficace.

2. SYSTÈME CHROMATIQUE (PALETTE "PREMIUM")

Une palette restreinte, sophistiquée, sans bruit visuel.

A. Les Fonds (La Lumière)

Fond Application : "Smoke White" (#F4F5F7). Un gris très très pâle, juste pour différencier le fond de la page des cartes.

Fond des Cartes (Bento) : "Pure White" (#FFFFFF).

Bordures (Strokes) : "Mist Grey" (#E0E0E0). Très fines (1px). C'est ce qui structure la grille Bento façon Qonto.

B. La Structure (La Force)

Primaire Sombre : "Matte Carbon" (#1A1A1A). Ce n'est pas du noir absolu (#000000) qui agresse l'œil. C'est un anthracite très profond. Utilisé pour les titres, les gros chiffres et la navigation active.

C. L'Accent (Le Luxe)

La "Touch" Quantis : "Muted Gold" / "Champagne" (#C5A065 ou #D4AF37).

Usage : Pour les boutons d'action principaux (CTA), les icônes actives, ou pour surligner un insight clé.

Règle d'or : À utiliser avec parcimonie (10% de l'écran max). C'est le bijou.

D. Les Indicateurs Fonctionnels (La Finance)

On garde les codes financiers mais désaturés pour ne pas casser le style "Luxe".

Positif : "Emerald" (Vert Profond, pas fluo).

Négatif : "Crimson" (Rouge sombre).

Neutre/Texte secondaire : "Slate Grey" (#6B7280).

3. TYPOGRAPHIE (MODERN SWISS STYLE)

Pour ressembler à Qonto ou aux fintechs modernes, on abandonne le Serif (trop "journal") pour du Sans-Serif Géométrique. C'est plus "Tech", plus "Direct", plus "Efficace".

A. La Police Principale (Titres & Textes)

Style : Geometric Sans-Serif.

Référence : Inter (Classique, efficace), Graphik (Très Qonto), ou DM Sans.

Traitement : Des graisses contrastées.

Titres : Bold ou Medium.

Corps : Regular.

B. La Police Data (Chiffres)

Style : Monospace (Chasse fixe).

Référence : JetBrains Mono ou Roboto Mono.

Traitement : En "Matte Carbon". C'est la seule fantaisie technique qu'on garde pour crédibiliser l'aspect "Outil financier".

4. UI KIT & FINITIONS (LE "FEELING")

C'est ici qu'on fait la différence entre "propre" et "premium".

Arrondis (Radius) : 12px ou 16px. Ni trop carré (vieux), ni trop rond (enfantin).

Ombres (Shadows) : Quasi inexistantes. On préfère utiliser des Bordures (Strokes) fines pour délimiter les zones.

Exception : Au survol (Hover), une ombre très diffuse et douce apparaît pour soulever l'élément.

Boutons (CTA) :

Primaire : Fond "Matte Carbon" ou "Muted Gold", Texte Blanc. Forme Pillule ou Rectange arrondi.

Secondaire : Fond Blanc, Bordure "Slate Grey", Texte Noir.

Iconographie :

Style "Line" (Filaire), fin (1.5px ou 2px).

Couleur : Noir ou Gris foncé.

Résumé visuel pour le Designer : "Imagine une interface Bento Grid très blanche, très aérée. Les cartes ont des bordures grises fines. Le texte est noir mat, très lisible (font style Inter). Les seuls éléments de couleur sont les boutons d'action en Or (Champagne) ou Noir Mat. C'est l'élégance d'une carte de crédit Premium appliquée à une interface web."


QUANTIS — DESIGN BRIEF (PART 2: ARCHITECTURE & UX)
1. LE CONCEPT DE NAVIGATION : "BROWSER-LIKE"
L'application adopte une structure de navigateur web pour gérer le multitâche (Pilotage vs Simulation).
La Structure Globale (The App Shell)
L'écran est divisé en 3 blocs verticaux fixes :
Le Header (App Bar) : Très fin et minimaliste. Il ne sert qu'au statut et à l'identité.
La Barre d'Onglets (Tab Bar) : Juste en dessous. Pour naviguer entre le Dashboard et les Recherches.
Le Viewport (Zone de Contenu) : Le reste de l'écran. C'est ici que tout se joue.

2. DÉTAIL DES ÉLÉMENTS
A. LE HEADER (Minimaliste)
Puisque la barre de recherche n'est plus là, le header s'allège considérablement pour laisser la place au contenu.
Contenu :
Gauche : Logo Quantis (Discret, élégant).
Droite : L'indicateur "Secure Vault" (Cadenas / Statut vert) + Avatar Utilisateur.
Style : Fond transparent ou très léger, pour se fondre dans le fond "Papier".
B. ÉCRAN 1 : LE DASHBOARD (ONGLET "HOME")
C'est l'écran principal. Il est construit en deux étages distincts.
Étage 1 : La "Hero Decision Bar" (Le Focus)
C'est l'élément le plus visible de l'écran. Il occupe la partie supérieure du Viewport.
Position : Centrée horizontalement, située en haut de la page (avec de l'espace blanc autour pour la "respiration").
Taille : Grande, imposante ("Large Input"). C'est un appel à l'action clair.
Design :
Un champ de saisie flottant avec une ombre portée douce (Elevation).
Placeholder (Texte fantôme) : Une question engageante type "Quelle décision voulez-vous prendre, [Prénom] ?".
Iconographie : Une icône "Étincelle" ou "Loupe" élégante à gauche.
Comportement : C'est le point de départ. L'utilisateur tape ici pour ouvrir un nouvel onglet de simulation.
Étage 2 : Le "Insight Feed" (La Grille Bento)
Situé sous la Decision Bar. C'est le contenu consultatif.
Transition : Séparé de la barre par un espace vide confortable.
Structure : Une grille modulaire de "Smart Widgets".
Widget Santé (1x1) : Score / Jauge.
Widget Argent Dormant (2x1) : Le chiffre clé en gros + Sparkline.
Widget Alertes (1x2) : Liste verticale.
Interaction : Au clic sur une carte, un panneau latéral (Drawer) s'ouvre à droite.

C. ÉCRAN 2 : LE DECISION MODE (LES ONGLETS DYNAMIQUES)
Cet écran s'affiche quand l'utilisateur a validé une question dans la "Hero Decision Bar" de l'accueil. L'interface change pour devenir un espace de travail.
Zone Centrale (Le Canvas) :
Occupe la majorité de l'écran.
Affiche la réponse visuelle (Courbes de projection, Chiffres d'impact).
Zone Basse (Le Pilotage) :
La Barre d'Hypothèses (Chips) : Juste au-dessus du chat. Affiche les paramètres modifiables ([ Salaire: 45k€ ]).
Le Chat (Input) : Tout en bas.
Note : Ici, la barre de saisie redevient "normale" (en bas de page), car l'utilisateur est en mode conversation, plus en mode "Recherche initiale".

D. ÉCRAN 3 : LE SECURE VAULT (L'INGESTION)
L'écran de dépôt des fichiers.
Peut être accessible via un widget dédié dans la grille Bento ou un bouton dans le Header.
Zone de Drop large, rassurante, chiffrée.

RÉSUMÉ POUR LE DESIGNER (HIERARCHIE VISUELLE)
Sur l'écran d'accueil (Home), l'œil de l'utilisateur doit suivre ce chemin :
La Hero Decision Bar (Qu'est-ce que je veux faire ?)
Les Widgets d'Alerte (Est-ce que quelque chose clignote en Crimson ou Muted Gold ?)
Les Widgets de Santé (Tout va bien ?)
QUANTIS — DESIGN BRIEF (PART 3: WIREFRAMES & LAYOUT)
0. LE GLOBAL SHELL (L'Enveloppe)
Éléments persistants sur tous les écrans.
Top Bar (Hauteur : ~48px - 60px) :
Gauche : Logo Quantis (SVG propre).
Centre : Vide (pour laisser respirer).
Droite :
Indicateur "Vault Status" : Icône Cadenas + Point Vert (Texte : "Données à jour").
Avatar Utilisateur (Cercle simple).
Tab Bar (Hauteur : ~40px) :
Juste sous la Top Bar.
Onglet 1 (Fixe) : [ 🏠 Dashboard ] (État : Actif ou Inactif).
Onglet 2+ (Dynamique) : [ ⚡ Simulation Recrutement ] (Apparaît quand une simulation est lancée).
Style : Style "Navigateur" (Chrome/Arc). Les onglets inactifs sont fondus dans le fond, l'onglet actif est "connecté" à la zone de contenu (Fond Blanc).

VUE 1 : LE DASHBOARD (ONGLET "HOME")
L'écran d'accueil. Vertical, scrollable si nécessaire.
ZONE A : LA HERO DECISION BAR (Le Focus)
Position : Placée dans le tiers supérieur de l'écran (environ à 15-20% du haut). Centrée horizontalement.
Largeur : ~60% de la largeur de l'écran (Max-width: 800px).
Composants :
Input Field : Hauteur généreuse (~64px). Ombres douces (Elevation 2). Coins très arrondis (Pill shape ou 16px).
Placeholder : "Quelle décision stratégique voulez-vous prendre ?"
Icône Start : "Sparkles" (Étincelles) ou "Search" à gauche.
Icône End : Flèche "Entrée" ou bouton "Go" subtil à droite.
Comportement : Au focus, une liste de suggestions ("Quick Actions") apparaît en dropdown juste en dessous.
ZONE B : LA GRILLE BENTO DYNAMIQUE (Le Contenu)
Position : Sous la Decision Bar. Marge supérieure importante (~80px) pour séparer l'action de la consultation.
Layout : Grille fluide (CSS Grid / Masonry).
Colonnes : 3 ou 4 colonnes selon la résolution.
Gouttière (Gap) : ~24px (Aéré).
Logique Dynamique :
Les widgets ne sont pas figés. L'IA remonte les widgets "Critiques" (Crimson ou Muted Gold) en haut à gauche (Zone prioritaire).
Les widgets "Neutres" (Emerald) remplissent le reste.
Types de Blocs (Wireframe) :
Bloc 1x1 (Score/Metric) :
Haut gauche : Label (ex: "Santé Globale").
Centre : Jauge Circulaire ou Gros Pourcentage.
Bas : Micro-texte ("Stable").
Bloc 2x1 (Key Insight - Le "Wide") :
Gauche (50%) : Label ("Argent Dormant") + Gros Montant (24k€).
Droite (50%) : Sparkline (Graphique ligne simple sans axe) ou Mini-Bar chart.
Fond : Peut avoir une teinte légère (ex: Emerald très pâle ou Smoke White avec teinte Emerald) si positif.
Bloc 1x2 (List/Feed - Le "Tall") :
Haut : Titre ("Derniers Mouvements").
Corps : Liste de 3 items (Ligne 1: Date + Label / Ligne 2: Montant). Séparateurs très fins.

VUE 2 : LE DECISION MODE (ONGLET DE SIMULATION)
L'écran de travail qui s'ouvre dans un nouvel onglet. Structure en "Sandwich" : Visuel (Haut) / Contrôle (Bas).
ZONE CENTRALE : LE CANVAS DE PROJECTION (70% Hauteur)
Fond : Blanc ou Gris très pâle.
Contenu :
Graphique Principal : Grande zone de chart (Line chart).
Axe X : Temps (Mois/Semaines).
Axe Y : Montant (€).
Courbes : Courbe A (Solide) vs Courbe B (Pointillée/Simulation).
Annotations : Des "Bulles" flottantes sur le graph aux points clés (ex: "Cash Min. : 12k€").
KPIs Flottants : En haut à droite du graph, 2-3 gros chiffres clés (ex: "Coût Total", "Impact Tréso").
ZONE BASSE : LE COCKPIT DE CONTRÔLE (Fixe en bas)
Composant 1 : La Hypothesis Bar (Flottant)
Située juste au-dessus de la barre de chat.
Suite horizontale de "Chips" (Pilules).
État Chip : Contour fin, Icône "Edit" (Crayon), Texte Label : Valeur.
Interaction : Clic = Popover pour modifier la valeur (Input numérique + Slider).
Composant 2 : La Chat Bar (Ancrée)
Input : Largeur 100% ou centrée.
Historique récent : Les 2-3 derniers échanges avec l'IA s'affichent en fondu au-dessus de l'input.
Style : Moins imposant que la "Hero Bar" du dashboard. C'est une barre de conversation.

VUE 3 : LE SIDE PANEL (LE DÉTAIL)
L'écran qui s'ouvre quand on clique sur un Widget du Dashboard.
Type : Drawer / Off-canvas (Glisse depuis la droite).
Largeur : ~400px à 500px.
Overlay : Le reste du Dashboard s'assombrit légèrement (Dimmed).
Structure Interne :
Header : Titre du Widget ("Détail Stocks") + Bouton Fermer (X).
Corps :
Explication narrative détaillée (Paragraphe texte).
Graphique détaillé (avec axes et légendes).
Liste des éléments concernés (Tableau simple).
Footer : Bouton d'Action Principal (ex: "Lancer une simulation d'optimisation"). Note : Ce clic ouvre un nouvel onglet de simulation.
QUANTIS — DESIGN BRIEF (PART 4: INTERACTIONS & STATES)
1. PRINCIPES DE MOTION DESIGN (L'ALCHIMIE)
Physique : Les éléments ne doivent pas apparaître/disparaître brusquement. Ils doivent glisser, s'estomper (fade) ou s'agrandir (scale).
Vitesse : Rapide et "Snappy".
Durée standard : 200ms - 300ms.
Easing : ease-out (rapide au début, doux à la fin).
Feedback : Chaque clic doit avoir une micro-réponse visuelle (changement de couleur, légère pression).

2. LA HERO DECISION BAR (DASHBOARD)
Le point d'entrée principal.
État : Repos (Idle)
Apparence : Fond blanc, bordure fine grise (Mist Grey, 1px).
Curseur : "Text".
État : Focus (Actif)
Déclencheur : Clic dans le champ.
Réaction : * La barre s'élargit légèrement (scale 1.02).
Une ombre très diffuse et douce apparaît (hover effect).
La bordure devient colorée (Matte Carbon ou Muted Gold).
Dropdown de suggestions apparaît en fondu juste en dessous (liste des "Questions fréquentes").
État : Validation (Submit)
Déclencheur : Touche "Entrée".
Animation : 1. La barre de recherche ne disparaît pas. 2. Le texte tapé "s'envole" vers la Tab Bar pour créer le nouvel onglet. 3. Transition fluide vers l'écran "Decision Mode".

3. LA GRILLE BENTO (DASHBOARD)
Les Smart Widgets.
État : Chargement (Loading)
Ne pas utiliser de spinner tournant.
Utiliser des Skeleton Screens (Formes grises pulsantes) qui imitent la forme des widgets (1x1, 2x1).
Cela donne une impression de structure immédiate.
Interaction : Survol (Hover)
Réaction : La carte "lévite" légèrement (Translate Y -4px) et l'ombre grandit. Le curseur devient "Pointer".
Indice : Si c'est un widget d'alerte, un bouton "Voir détail ->" apparaît subtilement ou change de couleur.
Interaction : Clic (Open Detail)
Réaction :
La carte ne s'agrandit pas en plein écran.
Un Drawer (Panneau latéral) glisse depuis la droite de l'écran.
Le fond du dashboard (derrière le panneau) s'assombrit légèrement (Backdrop filter: blur 2px + Noir 20%).

4. LE SIDE PANEL (LE TIROIR DE DÉTAIL)
Entrée : Slide-in rapide depuis la droite (ease-out).
Sortie : Slide-out vers la droite.
Fermeture :
Clic sur le bouton "X".
Clic sur la zone sombre (Overlay).
Touche "Echap".

5. LE DECISION MODE (SIMULATION)
L'écran de travail complexe.
Les Onglets (Tabs)
Création : Un nouvel onglet apparaît avec une animation de largeur (grow from left).
Actif : Fond blanc, texte sombre, connecté au contenu.
Inactif : Fond transparent, texte gris, aspect "en retrait".
Hover : Affichage d'une petite croix "x" pour fermer l'onglet.
Les Hypothesis Chips (Les Puces)
État : Repos
Pillule blanche, bordure grise fine. Texte : Salaire: 45k€.
Interaction : Clic
Une Popover (Mini-bulle) s'ouvre juste au-dessus du Chip.
Contenu : Un champ input pré-rempli (45000) et un Slider.
Focus automatique dans l'input.
Interaction : Modification (Live)
Pendant que l'utilisateur tape ou bouge le slider, le Canvas (Graphique) en arrière-plan se met à jour en temps réel. Pas de bouton "Valider". C'est instantané.
Le Graphique (Canvas)
Apparition : Les lignes se dessinent de gauche à droite (Stroke animation).
Mise à jour : Si les données changent, la ligne ne "saute" pas. Elle s'interpole (morphing) vers la nouvelle position.
Le Chat (IA)
État : Thinking (Réflexion)
Juste après l'envoi d'une question.
Afficher 3 petits points pulsants (animation fluide) alignés à gauche.
État : Streaming (Réponse)
Le texte ne s'affiche pas d'un bloc. Il s'affiche mot par mot (très rapide), comme si quelqu'un tapait. Cela renforce l'idée que l'IA réfléchit.

6. LE SECURE VAULT (INGESTION)
État : Drag Enter
Quand l'utilisateur survole la zone avec un fichier au bout de la souris.
Réaction : La zone devient légèrement teintée (Muted Gold très pâle), la bordure devient pointillée et épaisse (Mist Grey). Une icône "Lâcher ici" rebondit.
État : Processing (Analyse)
Une fois le fichier lâché.
Remplacer la zone de drop par une Liste de vérification animée.
Animation :
⏳ "Lecture du fichier..." (1s) -> ✅
⏳ "Vérification cohérence..." (1s) -> ✅
⏳ "Extraction des données..." (1s) -> ✅
Succès : Confettis subtils ou coche verte "Done". Redirection automatique vers le Dashboard mis à jour.

7. ÉTATS VIDES & ERREURS (EDGE CASES)
Dashboard Vide (Première visite)
Ne pas montrer une grille vide triste.
Montrer un "Empty State" illustré et encourageant.
Visuel : Une illustration élégante (style filaire) représentant un bureau calme.
CTA : Un gros bouton "Déposer mes premiers documents" (Secure Vault).
Erreur de chargement / IA indisponible
Pas de message rouge agressif.
Un message toast (notification flottante) en bas d'écran : "La connexion est lente, mais vos données sont en sécurité. Nouvelle tentative..."
