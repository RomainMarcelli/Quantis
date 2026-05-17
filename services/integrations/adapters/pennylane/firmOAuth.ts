// File: services/integrations/adapters/pennylane/firmOAuth.ts
// Role: helpers spécifiques à l'OAuth Firm de Pennylane — appels post-token
// qui ne sont pas modélisables via le pattern Connection (puisqu'on n'a pas
// encore persisté la connexion au moment où on les fait, on a juste un
// access_token frais).
//
// Brief 13/05/2026 : la Firm API expose la liste des dossiers clients
// accessibles à un token cabinet via GET /companies. On l'utilise dans le
// callback OAuth pour :
//   - renseigner externalCompanyId avec un dossier représentatif
//     (premier dans la liste — sélection multi-dossiers = v2)
//   - dériver un externalFirmId stable pour identifier le cabinet
//
// Doc API : https://pennylane.readme.io/reference/get-companies (Firm API)

const DEFAULT_BASE_URL = "https://app.pennylane.com/api/external/v2";

/**
 * Représentation minimale d'un dossier client retourné par Pennylane.
 * On garde uniquement les champs dont on a besoin côté Vyzor — la réponse
 * complète contient bien d'autres champs (adresse, RIB, etc.) qu'on
 * récupèrera plus tard si besoin via le sync.
 */
export type PennylaneFirmCompany = {
  id: string;
  name: string;
  siren: string | null;
};

type RawCompany = {
  id?: string | number;
  source_id?: string | number;
  name?: string;
  legal_name?: string;
  siren?: string | null;
  registration_number?: string | null;
};

type RawCompaniesResponse = {
  items?: RawCompany[];
  data?: RawCompany[];
  companies?: RawCompany[];
  results?: RawCompany[];
};

function getBaseUrl(): string {
  return process.env.PENNYLANE_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

/**
 * Liste les dossiers clients accessibles avec un access_token Firm.
 *
 * Cet appel est fait juste après l'échange OAuth dans le callback, donc on
 * n'a pas encore de Connection persistée — d'où la signature spéciale qui
 * prend l'access_token brut (pas une Connection).
 *
 * Comportement défensif : si l'endpoint est indisponible ou retourne un
 * format inattendu, on retourne un tableau vide plutôt que de faire échouer
 * tout le flow OAuth. Le sync ultérieur retentera et l'erreur sera visible
 * dans les logs.
 */
export async function fetchFirmCompaniesWithToken(
  accessToken: string
): Promise<PennylaneFirmCompany[]> {
  if (!accessToken.trim()) {
    return [];
  }

  const url = `${getBaseUrl()}/companies?per_page=100`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (error) {
    console.warn("[pennylane-firm] fetch /companies network error", {
      detail: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }

  if (!response.ok) {
    // 401 = token invalide, 403 = scope `companies:readonly` manquant — on
    // log sans bloquer le callback (la connexion sera créée avec
    // externalCompanyId vide et le sync ultérieur tentera de re-résoudre).
    console.warn("[pennylane-firm] /companies non-OK", {
      status: response.status,
    });
    return [];
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return [];
  }

  // Pennylane Firm API peut renvoyer la liste sous plusieurs formes selon
  // la version : { items: [...] } | { data: [...] } | { companies: [...] }
  // | { results: [...] } | [...] (top-level array). On essaie chacune.
  let rawList: RawCompany[] = [];
  if (Array.isArray(payload)) {
    rawList = payload as RawCompany[];
  } else if (payload && typeof payload === "object") {
    const p = payload as RawCompaniesResponse;
    rawList = p.items ?? p.data ?? p.companies ?? p.results ?? [];
  }

  // Log diagnostic si on reçoit 200 OK mais 0 dossier — c'est ce cas
  // précis qu'on a vu en sandbox 17/05/2026 (Pennylane a 1 dossier mais
  // notre parsing renvoie []). On loggue les top-level keys du payload
  // pour identifier le bon shape sans exposer de PII.
  if (rawList.length === 0) {
    const topKeys =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? Object.keys(payload as Record<string, unknown>).slice(0, 10)
        : Array.isArray(payload)
          ? ["__top_level_array__"]
          : [typeof payload];
    console.warn("[pennylane-firm] /companies returned 0 items", {
      status: response.status,
      topLevelKeys: topKeys,
    });
  }

  return rawList
    .map((raw) => normalizeRawCompany(raw))
    .filter((c): c is PennylaneFirmCompany => c !== null);
}

function normalizeRawCompany(raw: RawCompany): PennylaneFirmCompany | null {
  const id = raw.id != null ? String(raw.id) : raw.source_id != null ? String(raw.source_id) : "";
  if (!id) return null;
  const name = raw.legal_name?.trim() || raw.name?.trim() || `Dossier ${id}`;
  const siren = raw.siren?.trim() || raw.registration_number?.trim() || null;
  return { id, name, siren };
}

/**
 * Dérive un identifiant stable de cabinet à partir de la liste de dossiers
 * accessibles. Pennylane ne renvoie pas de "firm_id" séparé sur /companies
 * — on synthétise donc un identifiant déterministe en hashant la liste
 * triée des ids dossiers. Cohérence : tant que le cabinet conserve le
 * même périmètre, l'identifiant reste stable d'une connexion à l'autre.
 *
 * Brief 13/05/2026 — sélection multi-dossiers v2 : on stocke tous les
 * dossiers accessibles comme "actifs" et on utilise cet identifiant
 * synthétique côté ConnectionRecord (champ externalFirmId).
 */
export function deriveFirmIdFromCompanies(companies: PennylaneFirmCompany[]): string {
  if (companies.length === 0) return "";
  const sortedIds = companies.map((c) => c.id).sort();
  return `firm-${sortedIds.join("-").slice(0, 64)}`;
}
