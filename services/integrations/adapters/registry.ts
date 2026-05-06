// Registry des adaptateurs par provider. Source de vérité partagée entre l'orchestrator
// (qui pilote la pagination) et buildAnalysisFromSync (qui appelle fetchTrialBalance).
//
// Pour ajouter un nouveau connecteur (ex. Chift, Bridge) : créer son adapter et l'ajouter
// au registry, c'est la seule modif nécessaire côté pipeline.

import { myUnisoftAdapter } from "@/services/integrations/adapters/myunisoft";
import { odooAdapter } from "@/services/integrations/adapters/odoo";
import { pennylaneAdapter } from "@/services/integrations/adapters/pennylane";
import type { ConnectorProvider, IntegrationAdapter } from "@/types/connectors";

export const ADAPTER_REGISTRY: Record<ConnectorProvider, IntegrationAdapter | undefined> = {
  pennylane: pennylaneAdapter,
  myunisoft: myUnisoftAdapter,
  odoo: odooAdapter,
  chift: undefined, // Phase 2 (API unifiée multi-logiciels)
  bridge: undefined, // Phase 3 (open banking)
};

export function getAdapter(provider: ConnectorProvider): IntegrationAdapter | null {
  return ADAPTER_REGISTRY[provider] ?? null;
}
