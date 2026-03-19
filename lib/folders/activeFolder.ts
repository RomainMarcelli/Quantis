const ACTIVE_FOLDER_STORAGE_KEY = "quantis.activeFolderName";
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
  window.localStorage.setItem(ACTIVE_FOLDER_STORAGE_KEY, folderName.trim());
}

export function clearActiveFolderName(): void {
  if (typeof window === "undefined") {
    return;
  }
  // Le dossier actif est stocke uniquement cote client: on le purge
  // lors d'une suppression de donnees pour repartir sur un etat vierge.
  window.localStorage.removeItem(ACTIVE_FOLDER_STORAGE_KEY);
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
