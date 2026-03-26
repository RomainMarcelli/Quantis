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
};

const SEARCH_TARGET_STORAGE_KEY = "quantis.globalSearchTarget";
export const SEARCH_NAVIGATE_EVENT = "quantis:search-navigate";

export const GLOBAL_SEARCH_ITEMS: SearchItem[] = [
  {
    id: "synthese-score",
    label: "Quantis Score",
    description: "SynthÃ¨se Â· SantÃ© globale",
    keywords: ["score", "sante", "synthese", "indice"],
    route: "/synthese",
    refId: "synthese-quantis-score"
  },
  {
    id: "synthese-ca",
    label: "Chiffre d'affaires",
    description: "SynthÃ¨se Â· KPI principal",
    keywords: ["ca", "revenu", "vente", "kpi"],
    route: "/synthese",
    refId: "synthese-kpi-ca"
  },
  {
    id: "synthese-ebe",
    label: "RentabilitÃ© opÃ©rationnelle (EBE)",
    description: "SynthÃ¨se Â· KPI principal",
    keywords: ["ebe", "rentabilite", "marge"],
    route: "/synthese",
    refId: "synthese-kpi-ebe"
  },
  {
    id: "synthese-cash",
    label: "Cash disponible",
    description: "SynthÃ¨se Â· KPI principal",
    keywords: ["cash", "tresorerie", "liquidite"],
    route: "/synthese",
    refId: "synthese-kpi-cash"
  },
  {
    id: "synthese-actions",
    label: "Actions recommandÃ©es",
    description: "SynthÃ¨se Â· Recommandations",
    keywords: ["actions", "recommandations", "priorites"],
    route: "/synthese",
    refId: "synthese-actions"
  },
  {
    id: "synthese-alertes",
    label: "Alertes",
    description: "SynthÃ¨se Â· Signaux de risque",
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
    label: "CrÃ©ation de valeur Â· Chiffre d'affaires",
    description: "Tableau de bord Â· CrÃ©ation de valeur",
    keywords: ["creation", "valeur", "ca", "revenu", "vente"],
    route: "/analysis",
    section: "creation-valeur",
    refId: "analysis-vc-ca"
  },
  {
    id: "analysis-vc-tcam",
    label: "CrÃ©ation de valeur Â· TCAM",
    description: "Tableau de bord Â· Croissance",
    keywords: ["tcam", "croissance", "developpement"],
    route: "/analysis",
    section: "creation-valeur",
    refId: "analysis-vc-tcam"
  },
  {
    id: "analysis-vc-ebe",
    label: "CrÃ©ation de valeur Â· EBE",
    description: "Tableau de bord Â· Performance opÃ©rationnelle",
    keywords: ["ebe", "excÃ©dent brut", "operationnel"],
    route: "/analysis",
    section: "creation-valeur",
    refId: "analysis-vc-ebe"
  },
  {
    id: "analysis-vc-net",
    label: "CrÃ©ation de valeur Â· RÃ©sultat net",
    description: "Tableau de bord Â· Profit",
    keywords: ["resultat net", "benefice", "profit"],
    route: "/analysis",
    section: "creation-valeur",
    refId: "analysis-vc-resultat-net"
  },
  {
    id: "analysis-vc-point-mort",
    label: "CrÃ©ation de valeur Â· Point mort",
    description: "Tableau de bord Â· Seuil de rentabilitÃ©",
    keywords: ["point mort", "seuil", "rentabilite", "break even"],
    route: "/analysis",
    section: "creation-valeur",
    refId: "analysis-vc-point-mort"
  },
  {
    id: "analysis-invest-bfr",
    label: "Investissement Â· Argent bloquÃ© (BFR)",
    description: "Tableau de bord Â· Investissement",
    keywords: ["bfr", "argent bloque", "cycle"],
    route: "/analysis",
    section: "investissement-bfr",
    refId: "analysis-invest-bfr"
  },
  {
    id: "analysis-invest-rotation",
    label: "Investissement Â· Rotation du BFR",
    description: "Tableau de bord Â· Investissement",
    keywords: ["rotation", "dso", "dpo", "stocks", "jours"],
    route: "/analysis",
    section: "investissement-bfr",
    refId: "analysis-invest-rotation-bfr"
  },
  {
    id: "analysis-fin-independance",
    label: "Financement Â· IndÃ©pendance",
    description: "Tableau de bord Â· Levier financier",
    keywords: ["independance", "levier", "gearing", "banque", "dependance"],
    route: "/analysis",
    section: "financement",
    refId: "analysis-fin-levier"
  },
  {
    id: "analysis-fin-liquidite",
    label: "Financement Â· LiquiditÃ©",
    description: "Tableau de bord Â· SÃ©curitÃ© financiÃ¨re",
    keywords: ["liquidite", "generale", "reduite", "immediate"],
    route: "/analysis",
    section: "financement",
    refId: "analysis-fin-liquidite"
  },
  {
    id: "analysis-rent-roe",
    label: "RentabilitÃ© Â· ROE",
    description: "Tableau de bord Â· Gain sur capital",
    keywords: ["roe", "capital", "rendement"],
    route: "/analysis",
    section: "rentabilite",
    refId: "analysis-rent-roe"
  },
  {
    id: "analysis-rent-roce",
    label: "RentabilitÃ© Â· ROCE",
    description: "Tableau de bord Â· Performance activitÃ©",
    keywords: ["roce", "performance", "capital employed"],
    route: "/analysis",
    section: "rentabilite",
    refId: "analysis-rent-roce"
  },
  {
    id: "documents-folders",
    label: "Documents Â· Dossiers",
    description: "Documents Â· Gestion des dossiers",
    keywords: ["dossiers", "projets", "folders"],
    route: "/documents",
    refId: "documents-folders"
  },
  {
    id: "documents-files",
    label: "Documents Â· Fichiers sources",
    description: "Documents Â· Liste des fichiers",
    keywords: ["fichiers", "sources", "uploades", "supprimer"],
    route: "/documents",
    refId: "documents-files"
  },
  {
    id: "documents-upload",
    label: "Documents Â· Glisser-dÃ©poser",
    description: "Documents Â· Import de fichier",
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

export async function scrollToSearchTarget(refId: string): Promise<boolean> {
  const maxAttempts = 24;
  const delayMs = 90;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const target = resolveSearchElement(refId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("quantis-search-highlight");
      window.setTimeout(() => {
        target.classList.remove("quantis-search-highlight");
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
