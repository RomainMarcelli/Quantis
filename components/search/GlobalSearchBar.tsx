// File: components/search/GlobalSearchBar.tsx
// Role: barre de recherche globale simplifiee (mode test) sans suggestions visuelles.
"use client";

import { type FormEvent, useState } from "react";
import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  emitSearchNavigation,
  routeMatchesPath,
  searchGlobalItems,
  storeSearchTarget,
  type SearchItem,
  type SearchNavigationTarget
} from "@/lib/search/globalSearch";

type GlobalSearchBarProps = {
  className?: string;
  placeholder?: string;
};

export function GlobalSearchBar({
  className,
  placeholder = "Rechercher un KPI, une section, un document..."
}: GlobalSearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  function handleSelection(item: SearchItem, submittedQuery: string) {
    const target: SearchNavigationTarget = {
      route: item.route,
      section: item.section,
      refId: item.refId,
      query: submittedQuery
    };

    if (routeMatchesPath(pathname, item.route)) {
      emitSearchNavigation(target);
      return;
    }

    storeSearchTarget(target);
    router.push(item.route);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    const [bestMatch] = searchGlobalItems(trimmed, 1);
    if (!bestMatch) {
      return;
    }

    handleSelection(bestMatch, trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className={`relative w-full ${className ?? ""}`}>
      <label htmlFor="global-search-input" className="sr-only">
        Recherche globale
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/35 px-3 py-2 backdrop-blur-sm transition-colors focus-within:border-quantis-gold/60">
        <Search className="h-4 w-4 text-white/55" />
        <input
          id="global-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/45"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          Aller
        </button>
      </div>
    </form>
  );
}
