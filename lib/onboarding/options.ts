export const COMPANY_SIZE_OPTIONS = [
  { value: "independant", label: "Independant", range: "1 (Auto-entrepreneur)" },
  { value: "startup_tpe", label: "Startup / TPE", range: "2 - 10 employes" },
  { value: "pme", label: "PME", range: "11 - 50 employes" },
  { value: "grande_pme", label: "Grande PME", range: "51 - 200 employes" },
  { value: "eti", label: "ETI", range: "201 - 500 employes" },
  { value: "grand_compte", label: "Grand Compte", range: "500+ employes" }
] as const;

export const SECTOR_OPTIONS = [
  "SaaS & Edition de Logiciels",
  "Conseil & Services B2B",
  "Agences Marketing & Medias",
  "E-commerce & Pure Players",
  "Commerce de Detail (Retail)",
  "Negoce & Vente de Gros",
  "Hotellerie & Restauration",
  "Industrie & Manufacturier",
  "BTP & Construction",
  "Transport & Logistique",
  "Sante & Pharmaceutique",
  "Immobilier & Gestion d'actifs"
] as const;

export const OTHER_SECTOR_OPTION_VALUE = "Autres" as const;

export type CompanySizeValue = (typeof COMPANY_SIZE_OPTIONS)[number]["value"];
export type SectorValue = (typeof SECTOR_OPTIONS)[number];

export function isCompanySizeValue(value: string): value is CompanySizeValue {
  return COMPANY_SIZE_OPTIONS.some((option) => option.value === value);
}

export function isSectorValue(value: string): value is SectorValue {
  return SECTOR_OPTIONS.some((option) => option === value);
}
