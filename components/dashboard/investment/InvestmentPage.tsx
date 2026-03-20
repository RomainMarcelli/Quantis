// File: components/dashboard/investment/InvestmentPage.tsx
// Role: assemble la section Investissement (BFR, rotation, délais clients/fournisseurs, état matériel) en vue pédagogique.
"use client";

import { BFRCard } from "@/components/dashboard/investment/BFRCard";
import { BFRRotationCard } from "@/components/dashboard/investment/BFRRotationCard";
import { BFRVariationChart } from "@/components/dashboard/investment/BFRVariationChart";
import { ClientsVsFournisseurs } from "@/components/dashboard/investment/ClientsVsFournisseurs";
import { EquipmentStateChart } from "@/components/dashboard/investment/EquipmentStateChart";
import {
  buildBfrVariationSeries,
  buildClientsVsSuppliersComparison,
  normalizeEquipmentState
} from "@/lib/dashboard/investment/investmentViewModel";
import type { CalculatedKpis } from "@/types/analysis";

type InvestmentPageProps = {
  kpis: CalculatedKpis;
};

export function InvestmentPage({ kpis }: InvestmentPageProps) {
  // Les séries/indicateurs sont calculés côté front uniquement pour la présentation visuelle.
  const bfrSeries = buildBfrVariationSeries(kpis.bfr);
  const clientsVsSuppliers = buildClientsVsSuppliersComparison(kpis.dso, kpis.dpo);
  const equipmentState = normalizeEquipmentState(kpis.etat_materiel_indice);

  return (
    <section className="space-y-4">
      {/* Ligne 1: bloc BFR compact + variation large, comme la maquette de référence. */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-3">
          <BFRCard bfr={kpis.bfr} />
        </div>
        <div className="xl:col-span-9">
          <BFRVariationChart data={bfrSeries} />
        </div>
      </div>

      {/* Ligne 2: bloc rotation + comparaison côte à côte, sans étirement vertical inutile. */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <BFRRotationCard
            rotationBfr={kpis.rot_bfr}
            rotationStocks={kpis.rot_stocks}
            dso={kpis.dso}
            dpo={kpis.dpo}
          />
        </div>

        <div className="xl:col-span-5">
          <ClientsVsFournisseurs dso={kpis.dso} dpo={kpis.dpo} comparison={clientsVsSuppliers} />
        </div>
      </div>

      {/* Ligne 3: état matériel en pleine largeur pour respirer et éviter les blocs tassés. */}
      <div className="grid gap-4">
        <EquipmentStateChart equipmentState={equipmentState} />
      </div>
    </section>
  );
}
