// File: components/cabinet/PortfolioTable.tsx
// Role: table filtrable du portefeuille cabinet.
//   - Tri colonne au clic (asc/desc) sur Entreprise / CA / Résultat / Sync
//   - Recherche par nom
//   - Avatar dérivé du nom (couleur stable)
//   - Click ligne → /cabinet/dossier/{id}
//   - Icône mail → onInvite callback (prop facultative)
//
// La forme attendue des companies est `PortfolioCompany` ci-dessous,
// alignée sur le DTO renvoyé par /api/cabinet/portefeuille.
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Search } from "lucide-react";
import { ROUTES } from "@/lib/config/routes";

export interface PortfolioCompany {
  companyId: string;
  name: string;
  externalCompanyName?: string | null;
  source?: string | null;
  lastSyncedAt?: string | null;
  kpis?: {
    ca?: number | null;
    tresorerieNette?: number | null;
    ebitda?: number | null;
    resultatNet?: number | null;
    vyzorScore?: number | null;
  } | null;
}

type SortKey = "name" | "ca" | "net" | "sync";
type SortDir = "asc" | "desc";

const PROVIDER_LABELS: Record<string, string> = {
  pennylane_oauth: "Pennylane",
  pennylane: "Pennylane",
  myu: "MyUnisoft",
  myunisoft: "MyUnisoft",
  fec: "Import FEC",
  manual: "Import fichier",
  static_file: "Import fichier",
  bridge: "Bridge",
};

function formatEUR(n: number | null | undefined): string {
  if (typeof n !== "number") return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)} K€`;
  return `${Math.round(n)} €`;
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function formatSync(iso: string | null | undefined): string {
  const days = daysSince(iso);
  if (days === Infinity) return "Jamais";
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 30) return `il y a ${days} j`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return `il y a ${Math.floor(days / 365)} an${days >= 730 ? "s" : ""}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

const AVATAR_PALETTE = [
  { bg: "rgb(245 158 11 / 15%)", color: "#FAC775" },
  { bg: "rgb(34 197 94 / 15%)", color: "#5DCAA5" },
  { bg: "rgb(55 138 221 / 15%)", color: "#85B7EB" },
  { bg: "rgb(127 119 221 / 15%)", color: "#AFA9EC" },
  { bg: "rgb(216 90 48 / 15%)", color: "#F0997B" },
] as const;

function avatarFor(name: string): (typeof AVATAR_PALETTE)[number] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]!;
}

export function PortfolioTable({
  companies,
  onInvite,
}: {
  companies: PortfolioCompany[];
  onInvite?: (company: PortfolioCompany) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  }

  const visible = useMemo(() => {
    let list = [...companies];
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((c) =>
        (c.externalCompanyName || c.name).toLowerCase().includes(s)
      );
    }
    list.sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      switch (sortKey) {
        case "name":
          va = (a.externalCompanyName || a.name).toLowerCase();
          vb = (b.externalCompanyName || b.name).toLowerCase();
          break;
        case "ca":
          va = a.kpis?.ca ?? -Infinity;
          vb = b.kpis?.ca ?? -Infinity;
          break;
        case "net":
          va = a.kpis?.resultatNet ?? -Infinity;
          vb = b.kpis?.resultatNet ?? -Infinity;
          break;
        case "sync":
          va = daysSince(a.lastSyncedAt);
          vb = daysSince(b.lastSyncedAt);
          break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [companies, search, sortKey, sortDir]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2
          className="text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--app-text-tertiary)" }}
        >
          Tous les dossiers ({companies.length})
        </h2>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "var(--app-text-tertiary)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-48 rounded-full py-1.5 pl-9 pr-3 text-xs outline-none transition"
            style={{
              border: "1px solid var(--app-border)",
              backgroundColor: "transparent",
              color: "var(--app-text-primary)",
            }}
          />
        </div>
      </div>

      <div
        className="precision-card overflow-hidden rounded-2xl"
        style={{
          backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 85%)",
          border: "1px solid var(--app-border)",
        }}
      >
        <div
          className="grid items-center gap-3 px-5 py-3"
          style={{
            gridTemplateColumns: "2.2fr 1fr 1fr 1fr 0.4fr",
            borderBottom: "1px solid var(--app-border)",
            backgroundColor: "var(--app-surface-soft)",
          }}
        >
          <SortHeader label="Entreprise" k="name" current={sortKey} dir={sortDir} onClick={toggleSort} align="left" />
          <SortHeader label="CA" k="ca" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
          <SortHeader label="Résultat" k="net" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
          <SortHeader label="Sync" k="sync" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
          <span />
        </div>

        {visible.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm" style={{ color: "var(--app-text-tertiary)" }}>
            {search ? "Aucun dossier ne correspond à la recherche." : "Aucun dossier dans le portefeuille."}
          </div>
        ) : (
          <ul>
            {visible.map((c) => {
              const av = avatarFor(c.externalCompanyName || c.name);
              const ca = c.kpis?.ca;
              const net = c.kpis?.resultatNet;
              const syncDays = daysSince(c.lastSyncedAt);
              const providerLabel = c.source ? PROVIDER_LABELS[c.source] ?? c.source : "—";
              return (
                <li key={c.companyId}>
                  <div
                    onClick={() => router.push(ROUTES.CABINET_DOSSIER(encodeURIComponent(c.companyId)))}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(ROUTES.CABINET_DOSSIER(encodeURIComponent(c.companyId)));
                    }}
                    className="grid w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left transition"
                    style={{ gridTemplateColumns: "2.2fr 1fr 1fr 1fr 0.4fr", borderBottom: "1px solid var(--app-border)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "rgb(var(--app-brand-gold-deep-rgb) / 4%)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-xs font-medium"
                        style={{ backgroundColor: av.bg, color: av.color }}
                      >
                        {initials(c.externalCompanyName || c.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>
                          {c.externalCompanyName || c.name}
                        </p>
                        <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--app-text-tertiary)" }}>
                          {providerLabel}
                        </p>
                      </div>
                    </div>

                    <p
                      className="text-right font-mono text-sm tabular-nums"
                      style={{ color: "var(--app-text-primary)" }}
                    >
                      {formatEUR(ca)}
                    </p>

                    <p
                      className="text-right font-mono text-sm tabular-nums"
                      style={{
                        color:
                          typeof net === "number" && net < 0
                            ? "var(--app-danger, #EF4444)"
                            : "var(--app-text-primary)",
                      }}
                    >
                      {formatEUR(net)}
                    </p>

                    <p
                      className="text-right font-mono text-[11px] tabular-nums"
                      style={{ color: syncDays >= 14 ? "#F59E0B" : "var(--app-text-tertiary)" }}
                    >
                      {formatSync(c.lastSyncedAt)}
                    </p>

                    <div className="flex items-center justify-end">
                      {onInvite ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInvite(c);
                          }}
                          aria-label="Inviter le dirigeant"
                          title="Inviter le dirigeant"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md transition"
                          style={{
                            color: "var(--app-text-tertiary)",
                            border: "1px solid var(--app-border)",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = "var(--app-brand-gold-deep)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = "var(--app-text-tertiary)";
                          }}
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SortHeader({
  label,
  k,
  current,
  dir,
  onClick,
  align,
}: {
  label: string;
  k: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align: "left" | "right";
}) {
  const isActive = current === k;
  return (
    <button
      type="button"
      onClick={() => onClick(k)}
      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition"
      style={{
        color: isActive ? "var(--app-brand-gold-deep)" : "var(--app-text-tertiary)",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
      }}
    >
      {label}
      {isActive ? (
        <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 12 12" aria-hidden>
          {dir === "asc" ? <path d="M6 3l4 5H2z" /> : <path d="M6 9L2 4h8z" />}
        </svg>
      ) : null}
    </button>
  );
}
