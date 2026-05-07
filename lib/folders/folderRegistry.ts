// File: lib/folders/folderRegistry.ts
// Role: registre local des dossiers connus de l'utilisateur. Stocke la
// liste des noms dans localStorage pour pouvoir les afficher dans les
// menus de déplacement / création sans aller-retour serveur.
//
// Anciennement dans `lib/folders/activeFolder.ts` (supprimé). La notion
// de "dossier actif" a été remplacée par `useActiveDataSource()` qui
// stocke le folder courant en Firestore quand `activeAccountingSource ===
// "fec"` (cf. types/dataSources.ts → `activeFecFolderName`).

const KNOWN_FOLDERS_STORAGE_KEY = "quantis.knownFolders";
export const DEFAULT_FOLDER_NAME = "Dossier principal";

export function getKnownFolderNames(): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KNOWN_FOLDERS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const folders = parsed
      .map((value) => (typeof value === "string" ? normalizeFolderName(value) : ""))
      .filter((value) => Boolean(value));
    return Array.from(new Set(folders));
  } catch {
    return [];
  }
}

export function registerKnownFolderName(folderName: string): string[] {
  if (typeof window === "undefined") return [];
  const normalizedFolderName = normalizeFolderName(folderName);
  if (!normalizedFolderName) return getKnownFolderNames();
  const knownFolders = Array.from(
    new Set([...getKnownFolderNames(), normalizedFolderName])
  );
  window.localStorage.setItem(KNOWN_FOLDERS_STORAGE_KEY, JSON.stringify(knownFolders));
  return knownFolders;
}

export function removeKnownFolderName(folderName: string): string[] {
  if (typeof window === "undefined") return [];
  const normalizedFolderName = normalizeFolderName(folderName).toLowerCase();
  const nextFolders = getKnownFolderNames().filter(
    (knownFolderName) => knownFolderName.toLowerCase() !== normalizedFolderName
  );
  window.localStorage.setItem(KNOWN_FOLDERS_STORAGE_KEY, JSON.stringify(nextFolders));
  return nextFolders;
}

export function renameKnownFolderName(
  previousFolderName: string,
  nextFolderName: string
): string[] {
  if (typeof window === "undefined") return [];
  const previousNormalized = normalizeFolderName(previousFolderName).toLowerCase();
  const nextNormalized = normalizeFolderName(nextFolderName);
  const mergedFolders = getKnownFolderNames()
    .map((knownFolderName) =>
      knownFolderName.toLowerCase() === previousNormalized ? nextNormalized : knownFolderName
    )
    .concat(nextNormalized);
  return Array.from(new Set(mergedFolders));
}

export function normalizeFolderName(folderName?: string | null): string {
  const cleaned = folderName?.trim();
  return cleaned || DEFAULT_FOLDER_NAME;
}

/**
 * Reset complet (tous les dossiers connus). Utilisé par AccountView pour
 * la suppression de compte / RGPD.
 */
export function clearKnownFolderNames(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KNOWN_FOLDERS_STORAGE_KEY);
}
