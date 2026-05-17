// File: components/cabinet/CompanySelector.tsx
// Role: dropdown de sélection de Company dans la sidebar/header (Sprint C Tâche 6).
//
// Visible uniquement pour les firm_members. Charge la liste des Companies
// actives du cabinet via /api/cabinet/portefeuille, permet le switch.
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Building2, ChevronDown, Loader2, ArrowLeftCircle } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { firebaseAuthGateway } from "@/services/auth";
import { firebaseAuth, firestoreDb } from "@/lib/firebase";
import { useActiveCompany } from "@/lib/stores/activeCompanyStore";

type Dossier = {
  companyId: string;
  name: string;
  externalCompanyName: string | null;
};

export function CompanySelector() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeCompanyId, setActiveCompanyId } = useActiveCompany();
  const [dossiers, setDossiers] = useState<Dossier[] | null>(null);
  const [open, setOpen] = useState(false);
  const [accountType, setAccountType] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Détecte le type de compte. Si pas firm_member, on ne rend rien.
  // Garde Firestore directe en amont pour éviter d'appeler /portefeuille
  // côté users non-cabinet (qui répond 403 mais reste un round-trip).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = firebaseAuth.currentUser;
        if (!user) return;

        const userSnap = await getDoc(doc(firestoreDb, "users", user.uid));
        const resolvedAccountType =
          (userSnap.data()?.accountType as string | undefined) ?? "company_owner";
        if (cancelled) return;
        if (resolvedAccountType !== "firm_member") {
          setAccountType(resolvedAccountType);
          return;
        }

        const idToken = await firebaseAuthGateway.getIdToken();
        if (!idToken) return;
        const res = await fetch("/api/cabinet/portefeuille", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.status === 403) {
          if (!cancelled) setAccountType("company_owner");
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { dossiers: Dossier[] };
        if (cancelled) return;
        setAccountType("firm_member");
        setDossiers(
          data.dossiers.map((d) => ({
            companyId: d.companyId,
            name: d.name,
            externalCompanyName: d.externalCompanyName,
          }))
        );
        // Auto-sélectionne la 1re Company si pas d'active stockée.
        if (!activeCompanyId && data.dossiers.length > 0) {
          setActiveCompanyId(data.dossiers[0]!.companyId);
        }
      } catch {
        /* swallow */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click-outside pour fermer (gère aussi le menu porté dans body).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inTrigger && !inMenu) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Position du menu (fixed) calculée depuis le trigger — recalcul au scroll/resize.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setMenuPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Rétrocompat : non-firm_member → composant invisible.
  if (accountType !== "firm_member") return null;

  // Sur le portefeuille, le selector n'a pas de sens (on est déjà en vue
  // d'ensemble) → on le masque. Les pages /cabinet/dossier/[id] et les
  // routes cockpit (/synthese, /analysis…) le conservent pour switcher.
  if (pathname?.startsWith("/cabinet/portefeuille")) return null;

  if (dossiers === null) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--app-text-tertiary)" }} />
        <span style={{ color: "var(--app-text-tertiary)" }}>Chargement…</span>
      </div>
    );
  }

  const active = dossiers.find((d) => d.companyId === activeCompanyId) ?? dossiers[0] ?? null;
  const activeLabel = active
    ? active.externalCompanyName || active.name
    : "Sélectionner un dossier";

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition"
        style={{
          border: "1px solid var(--app-border)",
          backgroundColor: "var(--app-surface-soft)",
          color: "var(--app-text-primary)",
        }}
      >
        <Building2 className="h-3.5 w-3.5" style={{ color: "var(--app-brand-gold-deep)" }} />
        <span className="max-w-[180px] truncate">{activeLabel}</span>
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform"
          style={{
            color: "var(--app-text-tertiary)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open && mounted && menuPos
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="w-72 overflow-hidden rounded-xl shadow-xl"
              style={{
                position: "fixed",
                top: menuPos.top,
                right: menuPos.right,
                zIndex: 9999,
                backgroundColor: "rgb(var(--app-card-bg-rgb, 15 15 18) / 95%)",
                border: "1px solid var(--app-border-strong)",
                backdropFilter: "blur(24px)",
              }}
            >
          <p
            className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--app-text-tertiary)" }}
          >
            Dossiers actifs ({dossiers.length})
          </p>
          <ul className="max-h-72 overflow-y-auto">
            {dossiers.map((d) => {
              const isActive = d.companyId === activeCompanyId;
              return (
                <li key={d.companyId}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCompanyId(d.companyId);
                      setOpen(false);
                      router.push(`/cabinet/dossier/${encodeURIComponent(d.companyId)}`);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition"
                    style={{
                      backgroundColor: isActive
                        ? "rgb(var(--app-brand-gold-deep-rgb) / 10%)"
                        : "transparent",
                      color: isActive ? "var(--app-brand-gold-deep)" : "var(--app-text-primary)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive)
                        e.currentTarget.style.backgroundColor = "var(--app-surface-soft)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{d.externalCompanyName || d.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div style={{ borderTop: "1px solid var(--app-border)" }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/cabinet/portefeuille");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition"
              style={{ color: "var(--app-text-secondary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--app-surface-soft)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <ArrowLeftCircle className="h-3.5 w-3.5" />
              Retour au portefeuille
            </button>
          </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
