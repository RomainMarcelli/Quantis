// File: components/documents/SourceTile.tsx
// Role: tuile unitaire d'une source de données dans la grille /documents.
// Représente Pennylane, MyUnisoft, Odoo, Tiime, Documents (FEC) ou Bridge.
//
// 4 états visuels :
//   - active       : bordure dorée + pastille verte "🟢 Active"
//   - connected    : bordure neutre + badge discret "Connectée"
//   - disconnected : bordure neutre + badge doré "Connecter"
//   - unavailable  : tuile grisée + badge "Bientôt", non cliquable
//
// Le clic propage la décision au parent via `onActivate` / `onDeactivate` /
// `onConnect` selon l'état — la tuile elle-même n'a aucune logique métier.
"use client";

import type { ReactNode } from "react";

export type SourceTileState = "active" | "connected" | "disconnected" | "unavailable";

type SourceTileProps = {
  /** Nom affiché en grand. */
  name: string;
  /** Sous-titre court (ex. "OAuth", "Upload", "Open Banking"). */
  subtitle?: string;
  /** Logo / icône custom (img, svg, emoji). */
  logo: ReactNode;
  state: SourceTileState;
  /** Appelé quand l'utilisateur clique pour activer/désactiver/connecter. */
  onClick: () => void;
  /** Optionnel : feedback "loading" pendant la mutation Firestore. */
  busy?: boolean;
};

const COLOR_GOLD = "#C5A059";
const COLOR_GREEN = "#22C55E";

export function SourceTile({
  name,
  subtitle,
  logo,
  state,
  onClick,
  busy = false,
}: SourceTileProps) {
  const isUnavailable = state === "unavailable";
  const isActive = state === "active";

  // Border + ombre — la tuile active porte une bordure dorée et un léger
  // halo doré pour ressortir dans la grille. Les autres restent neutres.
  const borderColor = isActive
    ? `${COLOR_GOLD}`
    : "rgba(255, 255, 255, 0.08)";
  const boxShadow = isActive
    ? `0 0 0 1px ${COLOR_GOLD}55 inset, 0 8px 24px ${COLOR_GOLD}1A`
    : "0 1px 2px rgba(0, 0, 0, 0.18)";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isUnavailable || busy}
      aria-pressed={isActive}
      className={`group relative flex h-full flex-col items-start gap-3 rounded-2xl p-5 text-left transition-all duration-150 ${
        isUnavailable ? "cursor-not-allowed" : "cursor-pointer hover:-translate-y-0.5"
      }`}
      style={{
        backgroundColor: "rgba(15, 15, 18, 0.85)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: `1px solid ${borderColor}`,
        boxShadow,
        opacity: isUnavailable ? 0.5 : busy ? 0.7 : 1,
      }}
    >
      {/* Badge état — coin sup-droit */}
      <StatusBadge state={state} />

      {/* Logo — vignette carrée 44 px */}
      <span
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
        }}
      >
        {logo}
      </span>

      {/* Nom + sous-titre */}
      <div className="min-w-0 flex-1">
        <p
          className="truncate"
          style={{
            color: isUnavailable ? "#6B7280" : "#FFFFFF",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: "-0.01em",
          }}
        >
          {name}
        </p>
        {subtitle ? (
          <p
            className="mt-0.5 truncate"
            style={{
              color: isUnavailable ? "#4B5563" : "#9CA3AF",
              fontSize: 12,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </button>
  );
}

function StatusBadge({ state }: { state: SourceTileState }) {
  const baseClass =
    "absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold";

  if (state === "active") {
    return (
      <span
        className={baseClass}
        style={{
          color: COLOR_GREEN,
          backgroundColor: `${COLOR_GREEN}1A`,
          border: `1px solid ${COLOR_GREEN}40`,
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 9999,
            backgroundColor: COLOR_GREEN,
            boxShadow: `0 0 6px ${COLOR_GREEN}`,
          }}
        />
        Active
      </span>
    );
  }

  if (state === "connected") {
    return (
      <span
        className={baseClass}
        style={{
          color: "#9CA3AF",
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        Connectée
      </span>
    );
  }

  if (state === "disconnected") {
    return (
      <span
        className={baseClass}
        style={{
          color: COLOR_GOLD,
          backgroundColor: `${COLOR_GOLD}1A`,
          border: `1px solid ${COLOR_GOLD}40`,
        }}
      >
        Connecter
      </span>
    );
  }

  // unavailable
  return (
    <span
      className={baseClass}
      style={{
        color: "#6B7280",
        backgroundColor: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      Bientôt
    </span>
  );
}
