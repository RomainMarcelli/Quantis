// File: components/dashboard/widgets/StableChartContainer.tsx
// Role: remplace `ResponsiveContainer` de Recharts pour les widgets de
// dashboard. Mesure la taille de son conteneur via ResizeObserver et
// passe `width` / `height` en props explicites au chart enfant — MAIS
// met le ResizeObserver en pause pendant un drag (via DragStateContext).
//
// Pourquoi : ResponsiveContainer de Recharts re-render le chart à chaque
// fire du ResizeObserver. Pendant la danse iOS-style (positions qui
// bougent en spring via framer-motion), le ResizeObserver détecte des
// micro-changements de taille → setState dans un useEffect interne →
// boucle "Maximum update depth exceeded" dans XAxis. En gelant la taille
// pendant le drag, on évite ces re-renders en cascade.
"use client";

import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type ReactElement
} from "react";
import { useDragState } from "@/components/dashboard/widgets/DragStateContext";

type ChartProps = { width?: number; height?: number };

type StableChartContainerProps = {
  /** Chart Recharts (LineChart, BarChart, PieChart…). On lui clone le
   *  prop `width` et `height` à partir de la mesure du conteneur. */
  children: ReactElement<ChartProps>;
};

export function StableChartContainer({ children }: StableChartContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const { isDragging } = useDragState();
  // Ref miroir : le callback ResizeObserver lit la valeur courante,
  // pas la closure capturée au mount.
  const isDraggingRef = useRef(isDragging);
  isDraggingRef.current = isDragging;

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    function update() {
      // Pause pendant le drag : un ResizeObserver qui fire pendant la
      // spring de framer-motion déclencherait setSize → re-render Recharts
      // → setState interne de XAxis → boucle. On garde la taille connue
      // au début du drag, on resume après.
      if (isDraggingRef.current) return;
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    }

    update(); // mesure initiale

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full w-full">
      {size.width > 0 && size.height > 0
        ? cloneElement(children, { width: size.width, height: size.height })
        : null}
    </div>
  );
}
