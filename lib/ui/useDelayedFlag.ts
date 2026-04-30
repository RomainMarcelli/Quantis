// File: lib/ui/useDelayedFlag.ts
// Role: hook qui renvoie `true` uniquement quand `flag` est resté true
// pendant plus de `delayMs` millisecondes.
//
// Utilisation : suppression des "flash de loader" — pour la majorité
// des fetchs Firestore qui terminent en <300 ms, le loader n'apparaît
// jamais. Pour un fetch lent (>400 ms), il s'affiche normalement.
//
//   const isReallyLoading = useDelayedFlag(loading, 400);
//   {isReallyLoading ? <p>Chargement…</p> : null}

"use client";

import { useEffect, useState } from "react";

export function useDelayedFlag(flag: boolean, delayMs = 400): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!flag) {
      // Reset immédiat quand le flag source repasse à false — pas de
      // résidu si la requête finit avant le délai.
      setDelayed(false);
      return;
    }
    const timer = setTimeout(() => setDelayed(true), delayMs);
    return () => clearTimeout(timer);
  }, [flag, delayMs]);

  return delayed;
}
