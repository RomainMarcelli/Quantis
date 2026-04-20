// File: components/ui/PremiumLoader.tsx
// Role: loader premium reutilisable (etat de chargement) avec animation legere et contraste dark/light.
"use client";

type PremiumLoaderProps = {
  size?: "sm" | "md" | "lg";
  intensity?: "subtle" | "balanced" | "wow";
  label?: string;
  className?: string;
};

export function PremiumLoader({
  size = "md",
  intensity = "balanced",
  label,
  className
}: PremiumLoaderProps) {
  const sizeClass =
    size === "sm" ? "quantis-loader--sm" : size === "lg" ? "quantis-loader--lg" : "quantis-loader--md";
  const intensityClass =
    intensity === "subtle"
      ? "quantis-loader--intensity-subtle"
      : intensity === "wow"
        ? "quantis-loader--intensity-wow"
        : "quantis-loader--intensity-balanced";

  return (
    <div className={`quantis-loader-wrap ${className ?? ""}`}>
      <div className={`quantis-loader ${sizeClass} ${intensityClass}`} aria-hidden="true">
        <span className="quantis-loader__aura" />
        <span className="quantis-loader__ring quantis-loader__ring--outer" />
        <span className="quantis-loader__ring quantis-loader__ring--inner" />
        <span className="quantis-loader__core" />
        <span className="quantis-loader__orbiter" />
      </div>
      {label ? <p className="quantis-loader__label">{label}</p> : null}
    </div>
  );
}
