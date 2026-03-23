// File: components/dashboard/useAnimatedNumber.ts
// Role: hook React pour animer des valeurs numeriques (compteurs/jauges) sans dependre du DOM global.
"use client";

import { useEffect, useRef, useState } from "react";
import { interpolateAnimatedValue } from "@/lib/dashboard/premiumDashboardAdapter";

type UseAnimatedNumberOptions = {
  durationMs?: number;
};

// Hook reutilisable pour animer des compteurs vers une cible numerique.
export function useAnimatedNumber(
  targetValue: number | null,
  options: UseAnimatedNumberOptions = {}
): number {
  const durationMs = options.durationMs ?? 1000;
  const [value, setValue] = useState(targetValue ?? 0);
  const previousTargetRef = useRef(targetValue ?? 0);

  useEffect(() => {
    // Si la cible est absente, on revient proprement a 0 pour eviter les NaN.
    const nextTarget = targetValue ?? 0;
    const startValue = previousTargetRef.current;
    const startTime = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = (now - startTime) / durationMs;
      const nextValue = interpolateAnimatedValue(startValue, nextTarget, progress);
      setValue(nextValue);

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }

      previousTargetRef.current = nextTarget;
      setValue(nextTarget);
    };

    frame = requestAnimationFrame(tick);

    // Cleanup strict pour eviter les frames orphelines lors des rerenders.
    return () => cancelAnimationFrame(frame);
  }, [durationMs, targetValue]);

  return value;
}
