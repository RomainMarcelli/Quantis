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
  // Notifie les composants montés dans le même onglet (StorageEvent natif ne
  // tire pas pour la même fenêtre). Pendant exact de quantis:activeAnalysisChanged.
  window.dispatchEvent(
    new CustomEvent("quantis:activeFolderChanged", { detail: { folderName: normalizedFolderName } })
  );
}

export function clearActiveFolderName(): void {
  if (typeof window === "undefined") {
    return;
  }
  // Reset complet : utilisé lors d'une purge de données (AccountView).
  // Pour juste désactiver la sélection sans toucher à la liste des dossiers
  // connus, utiliser `clearActiveFolderSelection` à la place.
  window.localStorage.removeItem(ACTIVE_FOLDER_STORAGE_KEY);
  window.localStorage.removeItem(KNOWN_FOLDERS_STORAGE_KEY);
  window.dispatchEvent(
    new CustomEvent("quantis:activeFolderChanged", { detail: { folderName: null } })
  );
}

// Désactive la sélection de dossier sans purger la liste des dossiers connus.
// Utilisé quand l'utilisateur bascule sur une connexion dynamique (Pennylane,
// Bridge…) — on veut clear l'override statique mais garder ses dossiers
// pour pouvoir y revenir plus tard.
export function clearActiveFolderSelection(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ACTIVE_FOLDER_STORAGE_KEY);
  window.dispatchEvent(
    new CustomEvent("quantis:activeFolderChanged", { detail: { folderName: null } })
  );
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

  // Aucun popup navigateur: on bascule automatiquement sur un dossier par defaut.
  const next = DEFAULT_FOLDER_NAME;
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

export function removeKnownFolderName(folderName: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const normalizedFolderName = normalizeFolderName(folderName).toLowerCase();
  const nextFolders = getKnownFolderNames().filter(
    (knownFolderName) => knownFolderName.toLowerCase() !== normalizedFolderName
  );
  window.localStorage.setItem(KNOWN_FOLDERS_STORAGE_KEY, JSON.stringify(nextFolders));
  return nextFolders;
}

export function renameKnownFolderName(previousFolderName: string, nextFolderName: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const previousNormalized = normalizeFolderName(previousFolderName).toLowerCase();
  const nextNormalized = normalizeFolderName(nextFolderName);
  const mergedFolders = getKnownFolderNames()
    .map((knownFolderName) =>
      knownFolderName.toLowerCase() === previousNormalized ? nextNormalized : knownFolderName
    )
    .concat(nextNormalized);
  const deduplicatedFolders = Array.from(new Set(mergedFolders));
  window.localStorage.setItem(KNOWN_FOLDERS_STORAGE_KEY, JSON.stringify(deduplicatedFolders));
  return deduplicatedFolders;
}

function normalizeFolderName(folderName?: string | null): string {
  const cleaned = folderName?.trim();
  return cleaned || DEFAULT_FOLDER_NAME;
}
