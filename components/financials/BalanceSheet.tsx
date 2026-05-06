// File: components/financials/BalanceSheet.tsx
// Role: rendu visuel d'un bilan — actif à gauche, passif à droite.
//
// Architecture en 2 sous-grilles :
//   1. La grille "contenu" : les sections (immobilisé, circulant, CCA |
//      capitaux propres, provisions, dettes, PCA). Hauteur libre.
//   2. La grille "totaux" : Total actif et Total passif côte à côte sur
//      la même ligne, en encart doré. Indépendant de la hauteur du
//      contenu — ainsi les deux totaux sont toujours alignés
//      visuellement quel que soit le nombre de sections affichées
//      dans chaque colonne.
"use client";

import type { BalanceSheet as BalanceSheetType } from "@/lib/financials/types";
import {
  SectionCard,
  SectionSubtotal,
  formatAmount,
} from "@/components/financials/FinancialsCommon";

export function BalanceSheet({ sheet }: { sheet: BalanceSheetType }) {
  const showCcaActif = sheet.actif.cca !== null && sheet.actif.cca !== 0;
  const showPcaPassif = sheet.passif.pca !== null && sheet.passif.pca !== 0;
  const hasActifContent =
    sheet.actif.immobilise.subtotal !== null ||
    sheet.actif.circulant.subtotal !== null ||
    showCcaActif;
  const hasPassifContent =
    sheet.passif.capitauxPropres.subtotal !== null ||
    sheet.passif.provisions.subtotal !== null ||
    sheet.passif.dettes.subtotal !== null ||
    showPcaPassif;

  return (
    <article className="precision-card rounded-2xl px-5 py-4">
      <header className="mb-4 flex items-baseline justify-between gap-3 border-b border-white/10 pb-3">
        <h2 className="text-sm font-semibold tracking-wide text-white">Bilan</h2>
        {sheet.fiscalYear ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/45">
            Au 31/12/{sheet.fiscalYear}
          </span>
        ) : null}
      </header>

      {/* En-tête de colonnes — toujours visible. */}
      <div className="mb-3 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/55">
          Actif
        </p>
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/55">
          Passif
        </p>
      </div>

      {/* ─── Contenu (sections en colonnes) ───────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="space-y-3">
          {!hasActifContent ? (
            <p className="text-xs italic text-white/35">
              Aucune donnée d'actif disponible.
            </p>
          ) : (
            <>
              {sheet.actif.immobilise.subtotal !== null ? (
                <SectionCard section={sheet.actif.immobilise} />
              ) : null}
              {sheet.actif.circulant.subtotal !== null ? (
                <SectionCard section={sheet.actif.circulant} />
              ) : null}
              {showCcaActif ? (
                <div className="rounded-xl border border-white/10 bg-black/[0.18] px-4 py-3">
                  <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-white/55">
                    Charges constatées d'avance
                  </p>
                  <div className="grid grid-cols-[1fr_auto] items-baseline gap-3 text-xs">
                    <span className="text-white/85">CCA</span>
                    <span className="font-mono tabular-nums text-white/85">
                      {formatAmount(sheet.actif.cca)}
                    </span>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="space-y-3">
          {!hasPassifContent ? (
            <p className="text-xs italic text-white/35">
              Aucune donnée de passif disponible.
            </p>
          ) : (
            <>
              {sheet.passif.capitauxPropres.subtotal !== null ? (
                <SectionCard section={sheet.passif.capitauxPropres} />
              ) : null}
              {sheet.passif.provisions.subtotal !== null ? (
                <SectionCard section={sheet.passif.provisions} />
              ) : null}
              {sheet.passif.dettes.subtotal !== null ? (
                <SectionCard section={sheet.passif.dettes} />
              ) : null}
              {showPcaPassif ? (
                <div className="rounded-xl border border-white/10 bg-black/[0.18] px-4 py-3">
                  <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-white/55">
                    Produits constatés d'avance
                  </p>
                  <div className="grid grid-cols-[1fr_auto] items-baseline gap-3 text-xs">
                    <span className="text-white/85">PCA</span>
                    <span className="font-mono tabular-nums text-white/85">
                      {formatAmount(sheet.passif.pca)}
                    </span>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {/* ─── Totaux Actif / Passif sur la même ligne ────────────────── */}
      {(sheet.actif.total !== null || sheet.passif.total !== null) ? (
        <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {sheet.actif.total !== null ? (
            <div className="rounded-xl border border-quantis-gold/30 bg-quantis-gold/[0.04] px-4 py-3">
              <SectionSubtotal
                label="TOTAL ACTIF"
                value={sheet.actif.total}
                intensity="final"
              />
            </div>
          ) : (
            <div />
          )}
          {sheet.passif.total !== null ? (
            <div className="rounded-xl border border-quantis-gold/30 bg-quantis-gold/[0.04] px-4 py-3">
              <SectionSubtotal
                label="TOTAL PASSIF"
                value={sheet.passif.total}
                intensity="final"
              />
            </div>
          ) : (
            <div />
          )}
        </div>
      ) : null}
    </article>
  );
}
