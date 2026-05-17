// File: lib/config/data-sources.ts
// Role: catalogue des sources de données comptables disponibles pour le mode
// cabinet (page /cabinet/entreprises/ajouter). Chaque source porte son flow
// d'ajout (oauth / api_key / file_upload). Activable/désactivable via le flag
// `enabled` sans toucher au composant qui affiche la liste.

export type DataSourceType = "oauth" | "api_key" | "file_upload";

export interface DataSource {
  id: string;
  name: string;
  description: string;
  /** Emoji ou nom d'icône Lucide. Le composant gère le rendu. */
  icon: string;
  type: DataSourceType;
  enabled: boolean;
  /** Identifiant technique propagé aux Companies / connectors (pennylane_firm,
   *  myunisoft, fec, static_file…). */
  provider: string;
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: "pennylane_firm",
    name: "Pennylane",
    description: "Connexion automatique — synchronise tous vos dossiers cabinet.",
    icon: "🔗",
    type: "oauth",
    enabled: true,
    provider: "pennylane_firm",
  },
  {
    id: "myunisoft",
    name: "MyUnisoft",
    description: "Connexion via clé API partenaire.",
    icon: "🔌",
    type: "api_key",
    enabled: true,
    provider: "myunisoft",
  },
  {
    id: "fec_import",
    name: "Import FEC",
    description: "Fichier des écritures comptables (.txt ou .csv).",
    icon: "📑",
    type: "file_upload",
    enabled: true,
    provider: "fec",
  },
  {
    id: "excel_pdf",
    name: "Excel / PDF",
    description: "Bilan ou compte de résultat en fichier statique.",
    icon: "📄",
    type: "file_upload",
    enabled: true,
    provider: "static_file",
  },
  {
    id: "odoo",
    name: "Odoo",
    description: "Connexion via API Odoo (bientôt disponible).",
    icon: "⚙️",
    type: "api_key",
    enabled: false,
    provider: "odoo",
  },
  {
    id: "tiime",
    name: "Tiime",
    description: "Connexion via API Tiime (bientôt disponible).",
    icon: "⏱️",
    type: "api_key",
    enabled: false,
    provider: "tiime",
  },
];

export const getEnabledDataSources = (): DataSource[] =>
  DATA_SOURCES.filter((s) => s.enabled);

export const getDataSourceById = (id: string): DataSource | undefined =>
  DATA_SOURCES.find((s) => s.id === id);

export const getDataSourceByProvider = (provider: string): DataSource | undefined =>
  DATA_SOURCES.find((s) => s.provider === provider);
