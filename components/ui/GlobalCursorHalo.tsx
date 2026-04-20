// File: components/ui/GlobalCursorHalo.tsx
// Role: applique un halo lumineux global qui suit la souris sur toute l'application.
"use client";

import { useEffect, useRef } from "react";

export function GlobalCursorHalo() {
  const haloRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const nextPositionRef = useRef({ x: 0, y: 0, visible: false });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const supportsHoverPointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!supportsHoverPointer || prefersReducedMotion) {
      return;
    }

    function flush() {
      rafRef.current = null;
      const node = haloRef.current;
      if (!node) {
        return;
      }

      const next = nextPositionRef.current;
      node.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) translate(-50%, -50%)`;
      node.style.opacity = next.visible ? "1" : "0";
    }

    function schedule() {
      if (rafRef.current !== null) {
        return;
      }
      rafRef.current = requestAnimationFrame(flush);
    }

    function handleMouseMove(event: MouseEvent) {
      nextPositionRef.current = {
        x: event.clientX,
        y: event.clientY,
        visible: true
      };
      schedule();
    }

    function hideHalo() {
      nextPositionRef.current = { ...nextPositionRef.current, visible: false };
      schedule();
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("blur", hideHalo);
    document.addEventListener("mouseleave", hideHalo);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("blur", hideHalo);
      document.removeEventListener("mouseleave", hideHalo);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return <div ref={haloRef} className="global-cursor-halo" aria-hidden="true" />;
}

