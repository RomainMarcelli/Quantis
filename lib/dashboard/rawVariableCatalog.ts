// File: lib/dashboard/rawVariableCatalog.ts
// Role: catalogue des "variables brutes" du Bilan et du Compte de Résultat
// (champs de MappedFinancialData) pour la Phase 2 du dashboard personnalisable.
//
// Ces entrées ne sont PAS dans le registre KPI (kpiRegistry.ts) — elles
// affichent une valeur brute extraite par le parser, sans diagnostic ni
// benchmark. Elles vivent dans un catalogue séparé pour ne pas polluer le
// registre avec des champs purement descriptifs.
//
// Convention d'id : "raw:<champ>" pour pouvoir router au renderer
// (ex. "raw:total_actif", "raw:capital", "raw:ventes_march").

import type { MappedFinancialData } from "@/types/analysis";

export type RawVariableDefinition = {
  /** id préfixé `raw:` — clé MappedFinancialData après le préfixe. */
  id: string;
  /** Nom long affiché dans le picker. */
  label: string;
  /** Nom court (kicker uppercase de la card). */
  shortLabel: string;
  /** Catégorie : "bilan" ou "compte_resultat". */
  source: "bilan" | "compte_resultat";
  /** Champ MappedFinancialData lu pour la valeur. */
  field: keyof MappedFinancialData;
};

// ─── Bilan — actif + passif ─────────────────────────────────────────────
const BILAN: RawVariableDefinition[] = [
  // Actif immobilisé
  { id: "raw:immob_incorp", label: "Immobilisations incorporelles", shortLabel: "Immo. incorp.", source: "bilan", field: "immob_incorp" },
  { id: "raw:immob_corp", label: "Immobilisations corporelles", shortLabel: "Immo. corp.", source: "bilan", field: "immob_corp" },
  { id: "raw:immob_fin", label: "Immobilisations financières", shortLabel: "Immo. fin.", source: "bilan", field: "immob_fin" },
  { id: "raw:total_actif_immo", label: "Total actif immobilisé", shortLabel: "Actif immo total", source: "bilan", field: "total_actif_immo" },
  { id: "raw:total_actif_immo_brut", label: "Actif immobilisé brut", shortLabel: "Actif immo brut", source: "bilan", field: "total_actif_immo_brut" },
  { id: "raw:total_actif_immo_net", label: "Actif immobilisé net", shortLabel: "Actif immo net", source: "bilan", field: "total_actif_immo_net" },
  // Actif circulant
  { id: "raw:total_stocks", label: "Stocks", shortLabel: "Stocks", source: "bilan", field: "total_stocks" },
  { id: "raw:stocks_mp", label: "Stocks matières premières", shortLabel: "Stocks MP", source: "bilan", field: "stocks_mp" },
  { id: "raw:stocks_march", label: "Stocks marchandises", shortLabel: "Stocks march.", source: "bilan", field: "stocks_march" },
  { id: "raw:clients", label: "Créances clients", shortLabel: "Clients", source: "bilan", field: "clients" },
  { id: "raw:autres_creances", label: "Autres créances", shortLabel: "Autres créances", source: "bilan", field: "autres_creances" },
  { id: "raw:creances", label: "Total créances", shortLabel: "Créances", source: "bilan", field: "creances" },
  { id: "raw:vmp", label: "Valeurs mobilières de placement", shortLabel: "VMP", source: "bilan", field: "vmp" },
  { id: "raw:dispo", label: "Disponibilités", shortLabel: "Disponibilités", source: "bilan", field: "dispo" },
  { id: "raw:cca", label: "Charges constatées d'avance", shortLabel: "CCA", source: "bilan", field: "cca" },
  { id: "raw:total_actif_circ", label: "Total actif circulant", shortLabel: "Actif circulant", source: "bilan", field: "total_actif_circ" },
  { id: "raw:total_actif", label: "Total actif", shortLabel: "Total actif", source: "bilan", field: "total_actif" },
  // Capitaux propres
  { id: "raw:capital", label: "Capital", shortLabel: "Capital", source: "bilan", field: "capital" },
  { id: "raw:reserve_legale", label: "Réserve légale", shortLabel: "Réserve légale", source: "bilan", field: "reserve_legale" },
  { id: "raw:autres_reserves", label: "Autres réserves", shortLabel: "Autres réserves", source: "bilan", field: "autres_reserves" },
  { id: "raw:ran", label: "Report à nouveau", shortLabel: "RAN", source: "bilan", field: "ran" },
  { id: "raw:res_net", label: "Résultat de l'exercice", shortLabel: "Résultat net", source: "bilan", field: "res_net" },
  { id: "raw:total_cp", label: "Total capitaux propres", shortLabel: "Capitaux propres", source: "bilan", field: "total_cp" },
  { id: "raw:total_prov", label: "Provisions pour risques et charges", shortLabel: "Provisions", source: "bilan", field: "total_prov" },
  // Dettes
  { id: "raw:emprunts", label: "Emprunts et dettes financières", shortLabel: "Emprunts", source: "bilan", field: "emprunts" },
  { id: "raw:fournisseurs", label: "Dettes fournisseurs", shortLabel: "Fournisseurs", source: "bilan", field: "fournisseurs" },
  { id: "raw:dettes_fisc_soc", label: "Dettes fiscales et sociales", shortLabel: "Dettes fisc/soc", source: "bilan", field: "dettes_fisc_soc" },
  { id: "raw:autres_dettes", label: "Autres dettes", shortLabel: "Autres dettes", source: "bilan", field: "autres_dettes" },
  { id: "raw:total_dettes", label: "Total dettes", shortLabel: "Total dettes", source: "bilan", field: "total_dettes" },
  { id: "raw:total_passif", label: "Total passif", shortLabel: "Total passif", source: "bilan", field: "total_passif" }
];

// ─── Compte de résultat ─────────────────────────────────────────────────
const CDR: RawVariableDefinition[] = [
  // Produits d'exploitation
  { id: "raw:ventes_march", label: "Ventes de marchandises", shortLabel: "Ventes march.", source: "compte_resultat", field: "ventes_march" },
  { id: "raw:prod_vendue", label: "Production vendue", shortLabel: "Prod. vendue", source: "compte_resultat", field: "prod_vendue" },
  { id: "raw:prod_biens", label: "Production de biens", shortLabel: "Prod. biens", source: "compte_resultat", field: "prod_biens" },
  { id: "raw:prod_serv", label: "Production de services", shortLabel: "Prod. services", source: "compte_resultat", field: "prod_serv" },
  { id: "raw:prod_stockee", label: "Production stockée", shortLabel: "Prod. stockée", source: "compte_resultat", field: "prod_stockee" },
  { id: "raw:prod_immo", label: "Production immobilisée", shortLabel: "Prod. immo.", source: "compte_resultat", field: "prod_immo" },
  { id: "raw:subv_expl", label: "Subventions d'exploitation", shortLabel: "Subv. expl.", source: "compte_resultat", field: "subv_expl" },
  { id: "raw:autres_prod_expl", label: "Autres produits d'exploitation", shortLabel: "Autres prod. expl.", source: "compte_resultat", field: "autres_prod_expl" },
  { id: "raw:total_prod_expl", label: "Total produits d'exploitation", shortLabel: "Total prod. expl.", source: "compte_resultat", field: "total_prod_expl" },
  // Charges d'exploitation
  { id: "raw:achats_march", label: "Achats de marchandises", shortLabel: "Achats march.", source: "compte_resultat", field: "achats_march" },
  { id: "raw:achats_mp", label: "Achats de matières premières", shortLabel: "Achats MP", source: "compte_resultat", field: "achats_mp" },
  { id: "raw:var_stock_march", label: "Variation des stocks marchandises", shortLabel: "Δ stocks march.", source: "compte_resultat", field: "var_stock_march" },
  { id: "raw:var_stock_mp", label: "Variation des stocks matières", shortLabel: "Δ stocks MP", source: "compte_resultat", field: "var_stock_mp" },
  { id: "raw:ace", label: "Autres charges externes", shortLabel: "Charges externes", source: "compte_resultat", field: "ace" },
  { id: "raw:impots_taxes", label: "Impôts et taxes", shortLabel: "Impôts/taxes", source: "compte_resultat", field: "impots_taxes" },
  { id: "raw:salaires", label: "Salaires bruts", shortLabel: "Salaires", source: "compte_resultat", field: "salaires" },
  { id: "raw:charges_soc", label: "Charges sociales", shortLabel: "Charges sociales", source: "compte_resultat", field: "charges_soc" },
  { id: "raw:dap", label: "Dotations aux amortissements", shortLabel: "DAP", source: "compte_resultat", field: "dap" },
  { id: "raw:dprov", label: "Dotations aux provisions", shortLabel: "Dot. provisions", source: "compte_resultat", field: "dprov" },
  { id: "raw:autres_charges_expl", label: "Autres charges d'exploitation", shortLabel: "Autres charges", source: "compte_resultat", field: "autres_charges_expl" },
  { id: "raw:total_charges_expl", label: "Total charges d'exploitation", shortLabel: "Total charges expl.", source: "compte_resultat", field: "total_charges_expl" },
  { id: "raw:ebit", label: "Résultat d'exploitation", shortLabel: "EBIT", source: "compte_resultat", field: "ebit" },
  // Résultat financier + exceptionnel
  { id: "raw:prod_fin", label: "Produits financiers", shortLabel: "Prod. fin.", source: "compte_resultat", field: "prod_fin" },
  { id: "raw:charges_fin", label: "Charges financières", shortLabel: "Charges fin.", source: "compte_resultat", field: "charges_fin" },
  { id: "raw:prod_excep", label: "Produits exceptionnels", shortLabel: "Prod. except.", source: "compte_resultat", field: "prod_excep" },
  { id: "raw:charges_excep", label: "Charges exceptionnelles", shortLabel: "Charges except.", source: "compte_resultat", field: "charges_excep" },
  { id: "raw:is_impot", label: "Impôt sur les bénéfices", shortLabel: "IS", source: "compte_resultat", field: "is_impot" },
  { id: "raw:resultat_exercice", label: "Résultat de l'exercice", shortLabel: "Résultat exercice", source: "compte_resultat", field: "resultat_exercice" }
];

export const RAW_VARIABLE_CATALOG: RawVariableDefinition[] = [...BILAN, ...CDR];

const ID_TO_DEF = new Map(RAW_VARIABLE_CATALOG.map((d) => [d.id, d]));

export function getRawVariableDefinition(id: string): RawVariableDefinition | null {
  return ID_TO_DEF.get(id) ?? null;
}

export function isRawVariableId(id: string): boolean {
  return id.startsWith("raw:");
}

export function listRawVariablesBySource(source: "bilan" | "compte_resultat"): RawVariableDefinition[] {
  return RAW_VARIABLE_CATALOG.filter((d) => d.source === source);
}
