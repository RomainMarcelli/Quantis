// File: lib/folders/activeFolder.ts
// Role: centralise la gestion locale du dossier actif et de la liste des dossiers utilisateur.

const ACTIVE_FOLDER_STORAGE_KEY = "quantis.activeFolderName";
const KNOWN_FOLDERS_STORAGE_KEY = "quantis.knownFolders";
export const DEFAULT_FOLDER_NAME = "Dossier principal";

export function getActiveFolderName(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(ACTIVE_FOLDER_STORAGE_KEY);
  return value?.trim() ? value.trim() : null;
}

export function setActiveFolderName(folderName: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const normalizedFolderName = normalizeFolderName(folderName);
  window.localStorage.setItem(ACTIVE_FOLDER_STORAGE_KEY, normalizedFolderName);
  registerKnownFolderName(normalizedFolderName);
}

export function clearActiveFolderName(): void {
  if (typeof window === "undefined") {
    return;
  }
  // Le dossier actif est stocke uniquement cote client: on le purge
  // lors d'une suppression de donnees pour repartir sur un etat vierge.
  window.localStorage.removeItem(ACTIVE_FOLDER_STORAGE_KEY);
  // Les dossiers connus sont aussi locaux: on les purge avec le dossier actif.
  window.localStorage.removeItem(KNOWN_FOLDERS_STORAGE_KEY);
}

export function ensureFolderName(explicitFolderName?: string | null): string | null {
  const explicit = explicitFolderName?.trim();
  if (explicit) {
    setActiveFolderName(explicit);
    return explicit;
  }

  const stored = getActiveFolderName();
  if (stored) {
    return stored;
  }

  if (typeof window === "undefined") {
    return DEFAULT_FOLDER_NAME;
  }

  const input = window.prompt(
    "Choisissez un nom de dossier pour organiser vos fichiers",
    "Mon dossier"
  );
  if (!input || !input.trim()) {
    return null;
  }

  const next = input.trim();
  setActiveFolderName(next);
  return next;
}

export function getKnownFolderNames(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(KNOWN_FOLDERS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const folders = parsed
      .map((value) => (typeof value === "string" ? normalizeFolderName(value) : ""))
      .filter((value) => Boolean(value));

    return Array.from(new Set(folders));
  } catch {
    return [];
  }
}

export function registerKnownFolderName(folderName: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const normalizedFolderName = normalizeFolderName(folderName);
  if (!normalizedFolderName) {
    return getKnownFolderNames();
  }

  const knownFolders = Array.from(
    new Set([...getKnownFolderNames(), normalizedFolderName])
  );
  window.localStorage.setItem(KNOWN_FOLDERS_STORAGE_KEY, JSON.stringify(knownFolders));
  return knownFolders;
}

function normalizeFolderName(folderName?: string | null): string {
  const cleaned = folderName?.trim();
  return cleaned || DEFAULT_FOLDER_NAME;
}
