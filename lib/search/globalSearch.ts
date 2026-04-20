// File: lib/search/globalSearch.ts
// Role: centralise l'index de recherche global et la navigation intelligente (route + section + bloc).

export type SearchRoute = "/analysis" | "/synthese" | "/documents";

export type SearchSection =
  | "cockpit"
  | "creation-valeur"
  | "investissement-bfr"
  | "financement"
  | "rentabilite";

export type SearchItem = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  route: SearchRoute;
  section?: SearchSection;
  refId?: string;
};

export type SearchNavigationTarget = {
  route: SearchRoute;
  section?: SearchSection;
  refId?: string;
  query?: string;
};

const SEARCH_TARGET_STORAGE_KEY = "quantis.globalSearchTarget";
export const SEARCH_NAVIGATE_EVENT = "quantis:search-navigate";

export const GLOBAL_SEARCH_ITEMS: SearchItem[] = [
  {
    id: "synthese-score",
    label: "Quantis Score",
    description: "Synthèse · Santé globale",
    keywords: ["score", "sante", "synthese", "indice"],
    route: "/synthese",
    refId: "synthese-quantis-score"
  },
  {
    id: "synthese-ca",
    label: "Chiffre d'affaires",
    description: "Synthèse · KPI principal",
    keywords: ["ca", "revenu", "vente", "kpi"],
    route: "/synthese",
    refId: "synthese-kpi-ca"
  },
  {
    id: "synthese-ebe",
    label: "Rentabilité opérationnelle (EBE)",
    description: "Synthèse · KPI principal",
    keywords: ["ebe", "rentabilite", "marge"],
    route: "/synthese",
    refId: "synthese-kpi-ebe"
  },
  {
    id: "synthese-cash",
    label: "Cash disponible",
    description: "Synthèse · KPI principal",
    keywords: ["cash", "tresorerie", "liquidite"],
    route: "/synthese",
    refId: "synthese-kpi-cash"
  },
  {
    id: "synthese-actions",
    label: "Actions recommandées",
    description: "Synthèse · Recommandations",
    keywords: ["actions", "recommandations", "priorites"],
    route: "/synthese",
    refId: "synthese-actions"
  },
  {
    id: "synthese-alertes",
    label: "Alertes",
    description: "Synthèse · Signaux de risque",
    keywords: ["alertes", "risque", "warning", "bfr", "cash faible"],
    route: "/synthese",
    refId: "synthese-alertes"
  },
    {
    id: "analysis-cockpit",
    label: "Tableau de bord · Création de valeur",
    description: "Tableau de bord · Onglet par défaut",
    keywords: ["cockpit", "global", "dashboard", "tableau de bord", "creation de valeur"],
    route: "/analysis",
    section: "creation-valeur",
    refId: "analysis-vc-ca"
  },
  {
    id: "analysis-vc-ca",
    label: "Création de valeur · Chiffre d'affaires",
    description: "Tableau de bord · Création de valeur",
    keywords: ["creation", "valeur", "ca", "revenu", "vente"],
    route: "/analysis",
    section: "creation-valeur",
    refId: "analysis-vc-ca"
  },
  {
    id: "analysis-vc-tcam",
    label: "Création de valeur · TCAM",
    description: "Tableau de bord · Croissance",
    keywords: ["tcam", "croissance", "developpement"],
    route: "/analysis",
    section: "creation-valeur",
    refId: "analysis-vc-tcam"
  },
  {
    id: "analysis-vc-ebe",
    label: "Création de valeur · EBE",
    description: "Tableau de bord · Performance opérationnelle",
    keywords: ["ebe", "excédent brut", "operationnel"],
    route: "/analysis",
    section: "creation-valeur",
    refId: "analysis-vc-ebe"
  },
  {
    id: "analysis-vc-net",
    label: "Création de valeur · Résultat net",
    description: "Tableau de bord · Profit",
    keywords: ["resultat net", "benefice", "profit"],
    route: "/analysis",
    section: "creation-valeur",
    refId: "analysis-vc-resultat-net"
  },
  {
    id: "analysis-vc-point-mort",
    label: "Création de valeur · Point mort",
    description: "Tableau de bord · Seuil de rentabilité",
    keywords: ["point mort", "seuil", "rentabilite", "break even"],
    route: "/analysis",
    section: "creation-valeur",
    refId: "analysis-vc-point-mort"
  },
  {
    id: "analysis-invest-bfr",
    label: "Investissement · Argent bloqué (BFR)",
    description: "Tableau de bord · Investissement",
    keywords: ["bfr", "argent bloque", "cycle"],
    route: "/analysis",
    section: "investissement-bfr",
    refId: "analysis-invest-bfr"
  },
  {
    id: "analysis-invest-rotation",
    label: "Investissement · Rotation du BFR",
    description: "Tableau de bord · Investissement",
    keywords: ["rotation", "dso", "dpo", "stocks", "jours"],
    route: "/analysis",
    section: "investissement-bfr",
    refId: "analysis-invest-rotation-bfr"
  },
  {
    id: "analysis-fin-independance",
    label: "Financement · Indépendance",
    description: "Tableau de bord · Levier financier",
    keywords: ["independance", "levier", "gearing", "banque", "dependance"],
    route: "/analysis",
    section: "financement",
    refId: "analysis-fin-levier"
  },
  {
    id: "analysis-fin-liquidite",
    label: "Financement · Liquidité",
    description: "Tableau de bord · Sécurité financière",
    keywords: ["liquidite", "generale", "reduite", "immediate"],
    route: "/analysis",
    section: "financement",
    refId: "analysis-fin-liquidite"
  },
  {
    id: "analysis-rent-roe",
    label: "Rentabilité · ROE",
    description: "Tableau de bord · Gain sur capital",
    keywords: ["roe", "capital", "rendement"],
    route: "/analysis",
    section: "rentabilite",
    refId: "analysis-rent-roe"
  },
  {
    id: "analysis-rent-roce",
    label: "Rentabilité · ROCE",
    description: "Tableau de bord · Performance activité",
    keywords: ["roce", "performance", "capital employed"],
    route: "/analysis",
    section: "rentabilite",
    refId: "analysis-rent-roce"
  },
  {
    id: "documents-folders",
    label: "Documents · Dossiers",
    description: "Documents · Gestion des dossiers",
    keywords: ["dossiers", "projets", "folders"],
    route: "/documents",
    refId: "documents-folders"
  },
  {
    id: "documents-files",
    label: "Documents · Fichiers sources",
    description: "Documents · Liste des fichiers",
    keywords: ["fichiers", "sources", "uploades", "supprimer"],
    route: "/documents",
    refId: "documents-files"
  },
  {
    id: "documents-upload",
    label: "Documents · Glisser-déposer",
    description: "Documents · Import de fichier",
    keywords: ["upload", "glisser", "deposer", "excel", "pdf", "saisie manuelle"],
    route: "/documents",
    refId: "documents-upload"
  }
];

type RankedSearchItem = {
  item: SearchItem;
  score: number;
};

export function searchGlobalItems(query: string, maxResults = 8): SearchItem[] {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) {
    return [];
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const ranked = GLOBAL_SEARCH_ITEMS.map<RankedSearchItem>((item) => {
    const normalizedLabel = normalizeSearchText(item.label);
    const normalizedDescription = normalizeSearchText(item.description);
    const normalizedKeywords = item.keywords.map((keyword) => normalizeSearchText(keyword));

    let score = 0;
    if (normalizedLabel.startsWith(normalizedQuery)) {
      score += 120;
    } else if (normalizedLabel.includes(normalizedQuery)) {
      score += 90;
    }

    if (normalizedDescription.includes(normalizedQuery)) {
      score += 30;
    }

    for (const token of tokens) {
      if (normalizedLabel.includes(token)) {
        score += 18;
      }
      if (normalizedDescription.includes(token)) {
        score += 8;
      }
      for (const keyword of normalizedKeywords) {
        if (keyword.includes(token)) {
          score += 14;
        }
      }
    }

    return { item, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked.slice(0, maxResults).map((entry) => entry.item);
}

export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .trim();
}

export function routeMatchesPath(pathname: string, route: SearchRoute): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function storeSearchTarget(target: SearchNavigationTarget): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(SEARCH_TARGET_STORAGE_KEY, JSON.stringify(target));
}

export function consumeSearchTarget(): SearchNavigationTarget | null {
  if (typeof window === "undefined") {
    return null;
  }
  const rawTarget = window.sessionStorage.getItem(SEARCH_TARGET_STORAGE_KEY);
  if (!rawTarget) {
    return null;
  }
  window.sessionStorage.removeItem(SEARCH_TARGET_STORAGE_KEY);
  try {
    return JSON.parse(rawTarget) as SearchNavigationTarget;
  } catch {
    return null;
  }
}

export function emitSearchNavigation(target: SearchNavigationTarget): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<SearchNavigationTarget>(SEARCH_NAVIGATE_EVENT, { detail: target }));
}

export async function scrollToSearchTarget(refId: string, query?: string): Promise<boolean> {
  const maxAttempts = 24;
  const delayMs = 90;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const target = resolveSearchElement(refId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });

      const clearTextHighlights = applySearchTermHighlight(target, query);
      target.classList.add("quantis-search-highlight");
      window.setTimeout(() => {
        target.classList.remove("quantis-search-highlight");
        clearTextHighlights();
      }, 2600);
      return true;
    }
    await wait(delayMs);
  }

  return false;
}

function resolveSearchElement(refId: string): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  const safeId = cssEscape(refId);
  return (
    document.querySelector<HTMLElement>(`[data-search-id="${safeId}"]`) ??
    document.getElementById(refId)
  );
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function applySearchTermHighlight(target: HTMLElement, query?: string): () => void {
  clearSearchTermHighlights(target);

  if (!query?.trim()) {
    return () => {};
  }

  const tokens = Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  );

  if (!tokens.length) {
    return () => {};
  }

  const escapedTokens = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escapedTokens.join("|")})`, "gi");

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    textNodes.push(currentNode as Text);
    currentNode = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue ?? "";
    if (!text.trim()) {
      return;
    }

    const parent = textNode.parentElement;
    if (!parent) {
      return;
    }

    if (parent.closest("script, style, noscript, mark.quantis-search-term-highlight")) {
      return;
    }

    regex.lastIndex = 0;
    if (!regex.test(text)) {
      return;
    }

    regex.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match = regex.exec(text);

    while (match) {
      const index = match.index;
      const matchedText = match[0];

      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
      }

      const mark = document.createElement("mark");
      mark.className = "quantis-search-term-highlight";
      mark.textContent = matchedText;
      fragment.appendChild(mark);

      lastIndex = index + matchedText.length;
      match = regex.exec(text);
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  });

  return () => {
    clearSearchTermHighlights(target);
  };
}

function clearSearchTermHighlights(target: HTMLElement): void {
  target.querySelectorAll<HTMLElement>("mark.quantis-search-term-highlight").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
  });
  target.normalize();
}



