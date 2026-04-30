// File: components/integrations/DataSourceSelector.tsx
// Role: sélecteur unifié des sources de données (Upload PDF/FEC, Pennylane, MyUnisoft, Odoo).
// Permet à l'utilisateur d'ajouter une nouvelle source. Les sources actives sont gérées
// par ConnectionsPanel (au-dessus dans la page).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plug, Upload } from "lucide-react";
import { MyUnisoftConnectCard } from "@/components/integrations/MyUnisoftConnectCard";
import { OdooConnectCard } from "@/components/integrations/OdooConnectCard";
import { PennylaneConnectCard } from "@/components/integrations/PennylaneConnectCard";

type SourceTab = "upload" | "pennylane" | "myunisoft" | "odoo";

const TABS: Array<{ id: SourceTab; label: string }> = [
  { id: "upload", label: "Upload PDF/FEC" },
  { id: "pennylane", label: "Pennylane" },
  { id: "myunisoft", label: "MyUnisoft" },
  { id: "odoo", label: "Odoo" },
];

type DataSourceSelectorProps = {
  onSyncCompleted?: () => void | Promise<void>;
};

export function DataSourceSelector({ onSyncCompleted }: DataSourceSelectorProps) {
  const router = useRouter();
  const [active, setActive] = useState<SourceTab>("upload");

  return (
    <div className="precision-card rounded-2xl p-5">
      <div className="mb-4 flex items-center gap-2">
        <Plug className="h-4 w-4 text-quantis-gold" />
        <h3 className="text-sm font-semibold text-white">Ajouter une source de données</h3>
      </div>

      {/* Onglets segmentés */}
      <div className="mb-5 flex flex-wrap gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              active === tab.id
                ? "bg-quantis-gold text-black"
                : "text-white/70 hover:bg-white/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenu de l'onglet actif */}
      <div>
        {active === "upload" && <UploadOption onUploadClick={() => router.push("/upload")} />}
        {active === "pennylane" && <PennylaneConnectCard onSyncCompleted={onSyncCompleted} />}
        {active === "myunisoft" && <MyUnisoftConnectCard onSyncCompleted={onSyncCompleted} />}
        {active === "odoo" && <OdooConnectCard onSyncCompleted={onSyncCompleted} />}
      </div>
    </div>
  );
}

function UploadOption({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-quantis-gold/30 bg-quantis-gold/10">
          <FileText className="h-5 w-5 text-quantis-gold" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Importer un document</h3>
          <p className="mt-1 text-xs text-white/55">
            Importez une liasse fiscale, un FEC ou un Excel comptable. Le parser extrait
            automatiquement les KPI et le bilan, sans connexion à un logiciel tiers.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onUploadClick}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-quantis-gold px-4 py-2 text-xs font-semibold text-black hover:opacity-90"
      >
        <Upload className="h-3.5 w-3.5" />
        Aller à l'upload
      </button>
    </div>
  );
}
