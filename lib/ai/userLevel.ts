// File: lib/ai/userLevel.ts
// Role: helper client pour gérer le niveau utilisateur (débutant /
// intermédiaire / expert) — persisté en localStorage et lu à l'ouverture
// de l'AiChatPanel.
//
// Comportement :
//   - getUserLevel()    : lit la valeur, retourne null si absente.
//   - setUserLevel(lv)  : persiste la valeur.
//   - clearUserLevel()  : utilisé en debug ou pour forcer le re-prompt.
//
// L'UI choisit d'afficher le picker quand getUserLevel() === null (premier
// usage). À chaque appel /api/ai/ask on envoie le niveau dans le body —
// le serveur n'a pas besoin de connaître le storage local.

import type { UserLevel } from "@/lib/ai/types";

const STORAGE_KEY = "quantis.userLevel";

/**
 * Vérifie qu'une valeur correspond à un `UserLevel` connu. Évite de faire
 * confiance à un localStorage corrompu / migré d'une version précédente.
 */
function isValidLevel(v: unknown): v is UserLevel {
  return v === "beginner" || v === "intermediate" || v === "expert";
}

/**
 * Lit le niveau persisté. Retourne `null` si jamais défini ou en SSR
 * (`window` indisponible). L'appelant doit gérer le cas null en affichant
 * le picker.
 */
export function getUserLevel(): UserLevel | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isValidLevel(raw) ? raw : null;
  } catch {
    // localStorage peut throw en mode privé Safari ou si storage plein.
    return null;
  }
}

/**
 * Persiste le niveau choisi par l'utilisateur. Silencieux si localStorage
 * indisponible (iframe sandboxée, mode privé, etc.) — on ne veut pas
 * bloquer l'UX, le niveau sera juste re-demandé au prochain chargement.
 */
export function setUserLevel(level: UserLevel): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // ignore
  }
}

/** Reset — utile en debug ou depuis un panneau de réglages. */
export function clearUserLevel(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Niveau effectif à passer aux services côté front : valeur persistée si
 * définie, sinon `intermediate` comme défaut neutre. Permet un appel
 * /api/ai/ask même si l'utilisateur n'a pas encore choisi (rare — on
 * affiche le picker avant — mais résiliant).
 */
export function getEffectiveUserLevel(): UserLevel {
  return getUserLevel() ?? "intermediate";
}

/** Métadonnées d'affichage pour le picker. Centralisées ici pour cohérence. */
export const USER_LEVEL_META: Record<
  UserLevel,
  { label: string; description: string }
> = {
  beginner: {
    label: "Débutant",
    description: "Je découvre la finance, vulgarisez chaque terme.",
  },
  intermediate: {
    label: "Intermédiaire",
    description: "Je suis à l'aise avec les bases, allez à l'essentiel.",
  },
  expert: {
    label: "Expert",
    description: "Soyez technique, ratios et arbitrages détaillés.",
  },
};
