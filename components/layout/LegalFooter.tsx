// File: components/layout/LegalFooter.tsx
// Role: footer minimaliste avec les liens légaux (mentions légales, CGU,
// politique de confidentialité). Réutilisable dans la page d'auth, dans
// la sidebar de l'app, ou n'importe quelle autre page qui doit afficher
// ces obligations.
//
// 2 variantes :
//   - "row"     (défaut) : liens en ligne séparés par un point médian.
//   - "stacked"          : liens empilés verticalement, utile dans une
//     sidebar étroite ou un encart vertical.
//
// Aucun texte marketing n'est ajouté ici — uniquement les liens et le ©.
"use client";

import Link from "next/link";

export const LEGAL_LINKS = [
  { href: "/cgu", label: "Mentions légales & CGU" },
  { href: "/privacy", label: "Politique de confidentialité" },
] as const;

type LegalFooterProps = {
  variant?: "row" | "stacked";
  /** Affiche le `© 2026 Vyzor` à droite des liens. Défaut true. */
  showCopyright?: boolean;
  /** Couleur du texte. Défaut adaptée fond sombre. */
  tone?: "muted" | "subtle";
  className?: string;
};

export function LegalFooter({
  variant = "row",
  showCopyright = true,
  tone = "muted",
  className,
}: LegalFooterProps) {
  const color = tone === "subtle" ? "#6B7280" : "#9CA3AF";

  if (variant === "stacked") {
    return (
      <div
        className={`flex flex-col gap-1 ${className ?? ""}`}
        style={{ fontSize: 11, color }}
      >
        {LEGAL_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="hover:underline hover:text-white/80 transition-colors"
          >
            {link.label}
          </Link>
        ))}
        {showCopyright ? (
          <p className="mt-1" style={{ color: "#6B7280" }}>
            © 2026 Vyzor
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 ${className ?? ""}`}
      style={{ fontSize: 11, color }}
    >
      {LEGAL_LINKS.map((link, idx) => (
        <span key={link.href} className="inline-flex items-center gap-2">
          <Link
            href={link.href}
            className="hover:underline hover:text-white/80 transition-colors"
          >
            {link.label}
          </Link>
          {idx < LEGAL_LINKS.length - 1 ? (
            <span aria-hidden style={{ color: "#4B5563" }}>
              ·
            </span>
          ) : null}
        </span>
      ))}
      {showCopyright ? (
        <>
          <span aria-hidden style={{ color: "#4B5563" }}>
            ·
          </span>
          <span style={{ color: "#6B7280" }}>© 2026 Vyzor</span>
        </>
      ) : null}
    </div>
  );
}
