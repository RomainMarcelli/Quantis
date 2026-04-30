// File: components/debug/PennylaneDebugView.tsx
// Role: page de debug Pennylane — connexion via Company Token, sync, exploration des données
// remontées (dailyAccounting + balanceSheetSnapshot), avec sélecteur de granularité temporelle.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { firebaseAuthGateway } from "@/services/auth";
import { listUserAnalyses } from "@/services/analysisStore";
import {
  formatCurrency,
  formatPercent,
  formatNumber,
} from "@/components/dashboard/formatting";
import {
  aggregateDailyByGranularity,
  computeFrontKpis,
  GRANULARITY_LABEL,
  HIGHLIGHTED_BALANCE_CODES,
  HIGHLIGHTED_PNL_CODES,
  pickLatestDynamicAnalysis,
} from "@/lib/debug/pennylaneAggregation";
import { TemporalityBar } from "@/components/temporality/TemporalityBar";
import { useTemporality } from "@/lib/temporality/temporalityContext";
import type { AnalysisRecord } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

type ConnectStatus = "idle" | "connecting" | "syncing" | "done" | "error";

export function PennylaneDebugView() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connexion / sync
  const [tokenInput, setTokenInput] = useState("");
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("idle");
  const [connectMessage, setConnectMessage] = useState<string | null>(null);

  // Granularité d'affichage : globale (partagée avec /synthese et /documents).
  const temporality = useTemporality();
  const granularity = temporality.granularity;

  // ─── Auth + chargement initial ──────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((nextUser) => {
      if (!nextUser) {
        router.replace("/");
        return;
      }
      if (!nextUser.emailVerified) {
        void firebaseAuthGateway.signOut();
        router.replace("/");
        return;
      }
      setUser(nextUser);
    });
    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!user) return;
    void refreshAnalyses(user);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshAnalyses(currentUser: AuthenticatedUser) {
    setLoading(true);
    setError(null);
    try {
      const results = await listUserAnalyses(currentUser.uid);
      setAnalyses(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  // ─── Actions Pennylane ──────────────────────────────────────────────────
  async function callApi(path: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) throw new Error("Non authentifié");
    const res = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function handleConnect() {
    if (!tokenInput.trim()) {
      setConnectMessage("Token manquant.");
      setConnectStatus("error");
      return;
    }
    setConnectMessage(null);
    setConnectStatus("connecting");
    try {
      const connect = await callApi("/api/integrations/pennylane/connect", {
        mode: "company_token",
        accessToken: tokenInput.trim(),
      });
      if (!connect.ok) {
        const errMsg = (connect.data as { error?: string; detail?: string })?.detail
          ?? (connect.data as { error?: string })?.error
          ?? "Connexion refusée";
        throw new Error(errMsg);
      }
      const connectionId = (connect.data as { connectionId: string }).connectionId;

      setConnectStatus("syncing");
      const sync = await callApi("/api/integrations/pennylane/sync", { connectionId });
      if (!sync.ok) {
        const errMsg = (sync.data as { error?: string; detail?: string })?.detail
          ?? (sync.data as { error?: string })?.error
          ?? "Sync échoué";
        throw new Error(errMsg);
      }

      const report = (sync.data as { report?: { entities?: { entity: string; itemsPersisted: number }[] } }).report;
      const total = report?.entities?.reduce((s, e) => s + e.itemsPersisted, 0) ?? 0;
      setConnectMessage(`Sync terminé — ${total} entité(s) persistée(s).`);
      setConnectStatus("done");
      setTokenInput("");
      if (user) await refreshAnalyses(user);
    } catch (err) {
      setConnectMessage(err instanceof Error ? err.message : "Erreur inconnue");
      setConnectStatus("error");
    }
  }

  async function handleResync() {
    const cid = latest?.sourceMetadata?.connectionId;
    if (!cid) return;
    setConnectMessage(null);
    setConnectStatus("syncing");
    try {
      const res = await callApi("/api/integrations/pennylane/sync", { connectionId: cid });
      if (!res.ok) {
        throw new Error((res.data as { error?: string }).error ?? "Resync échoué");
      }
      const report = (res.data as { report?: { entities?: { itemsPersisted: number }[] } }).report;
      const total = report?.entities?.reduce((s, e) => s + e.itemsPersisted, 0) ?? 0;
      setConnectMessage(`Resync terminé — ${total} entité(s) re-persistée(s).`);
      setConnectStatus("done");
      if (user) await refreshAnalyses(user);
    } catch (err) {
      setConnectMessage(err instanceof Error ? err.message : "Erreur inconnue");
      setConnectStatus("error");
    }
  }

  async function handleDisconnect() {
    const cid = latest?.sourceMetadata?.connectionId;
    if (!cid) return;
    if (!confirm("Supprimer la connection Pennylane et toutes les entités synchronisées ?")) return;
    setConnectMessage(null);
    setConnectStatus("connecting");
    try {
      const res = await callApi("/api/integrations/pennylane/disconnect", { connectionId: cid });
      if (!res.ok) {
        throw new Error((res.data as { error?: string }).error ?? "Disconnect échoué");
      }
      setConnectMessage("Connection supprimée.");
      setConnectStatus("done");
      if (user) await refreshAnalyses(user);
    } catch (err) {
      setConnectMessage(err instanceof Error ? err.message : "Erreur inconnue");
      setConnectStatus("error");
    }
  }

  // ─── Mémo ───────────────────────────────────────────────────────────────
  const latest = useMemo(() => pickLatestDynamicAnalysis(analyses), [analyses]);
  const periods = useMemo(
    () =>
      latest?.dailyAccounting
        ? aggregateDailyByGranularity(latest.dailyAccounting, granularity)
        : [],
    [latest, granularity]
  );
  const kpis = useMemo(
    () =>
      latest
        ? computeFrontKpis(latest.dailyAccounting ?? [], latest.balanceSheetSnapshot ?? null)
        : null,
    [latest]
  );

  const isBusy = connectStatus === "connecting" || connectStatus === "syncing";

  // ─── Rendu ──────────────────────────────────────────────────────────────
  if (!user || loading) {
    return (
      <div className="mx-auto max-w-6xl py-12 text-center text-sm text-white/60">
        Chargement…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl py-12 text-center">
        <p className="text-sm text-red-400">Erreur : {error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8">
      <Header />

      {/* ─── Connexion / Resync / Disconnect ─────────────────────────────── */}
      <section className="precision-card rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm uppercase tracking-wider text-white/50">
              Connexion Pennylane
            </h2>
            <p className="mt-1 text-xs text-white/50">
              Authentification simplifiée : copiez un Company Token depuis votre compte Pennylane
              (Settings → API Tokens). OAuth viendra quand l'app sera enregistrée chez Pennylane.
            </p>
          </div>
          {latest?.sourceMetadata?.connectionId && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleResync}
                disabled={isBusy}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium hover:bg-white/10 disabled:opacity-40"
              >
                {connectStatus === "syncing" ? "Resync…" : "Resync"}
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isBusy}
                className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              >
                Déconnecter
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 md:flex-row">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Pennylane Company Token"
            disabled={isBusy}
            className="flex-1 rounded-lg border border-white/15 bg-black/30 px-4 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:border-quantis-gold focus:outline-none disabled:opacity-40"
          />
          <button
            type="button"
            onClick={handleConnect}
            disabled={isBusy || !tokenInput.trim()}
            className="rounded-lg bg-quantis-gold px-5 py-2 text-xs font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {connectStatus === "connecting"
              ? "Vérification…"
              : connectStatus === "syncing"
              ? "Sync en cours…"
              : "Se connecter à Pennylane"}
          </button>
        </div>

        {connectMessage && (
          <p
            className={`mt-3 text-xs ${
              connectStatus === "error" ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {connectMessage}
          </p>
        )}
      </section>

      {/* ─── Pas encore de données ───────────────────────────────────────── */}
      {!latest && (
        <div className="precision-card rounded-xl p-8 text-center">
          <p className="text-sm text-white/70">
            Aucune analyse dynamique pour votre compte. Collez votre Company Token au-dessus
            et cliquez sur <strong>Se connecter à Pennylane</strong> — la synchronisation est
            lancée immédiatement.
          </p>
        </div>
      )}

      {/* ─── Données du dernier sync ─────────────────────────────────────── */}
      {latest && (
        <>
          {/* Méta-info */}
          <section className="precision-card rounded-xl p-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 text-xs">
              <Meta label="Provider" value={latest.sourceMetadata?.provider ?? "—"} />
              <Meta label="Type" value={latest.sourceMetadata?.type ?? "—"} />
              <Meta
                label="Synced at"
                value={
                  latest.sourceMetadata?.syncedAt?.slice(0, 19).replace("T", " ") ?? "—"
                }
              />
              <Meta
                label="Période"
                value={`${latest.sourceMetadata?.periodStart?.slice(0, 10) ?? "?"} → ${
                  latest.sourceMetadata?.periodEnd?.slice(0, 10) ?? "?"
                }`}
              />
              <Meta label="Analysis ID" value={latest.id} mono />
              <Meta
                label="Connection ID"
                value={latest.sourceMetadata?.connectionId ?? "—"}
                mono
              />
              <Meta
                label="Jours avec écritures"
                value={String(latest.dailyAccounting?.length ?? 0)}
              />
              <Meta label="Périodes affichées" value={String(periods.length)} />
            </div>
          </section>

          {/* KPI front */}
          {kpis && (
            <section>
              <h2 className="mb-4 text-sm uppercase tracking-wider text-white/50">
                KPI calculés côté front (formules PM, sur la période complète)
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
                <KpiCard
                  label="CA"
                  value={formatCurrency(kpis.ca)}
                  hint="ventes_march + prod_vendue"
                />
                <KpiCard
                  label="VA"
                  value={formatCurrency(kpis.va)}
                  hint="total_prod_expl − achats_march − achats_mp − ace"
                />
                <KpiCard
                  label="EBITDA"
                  value={formatCurrency(kpis.ebitda)}
                  hint="va − impots_taxes − salaires − charges_soc"
                />
                <KpiCard
                  label="Marge EBITDA"
                  value={kpis.marge_ebitda === null ? "N/D" : formatPercent(kpis.marge_ebitda, 1)}
                  hint="ebitda / ca"
                />
                <KpiCard
                  label="BFR"
                  value={kpis.bfr === null ? "N/D" : formatCurrency(kpis.bfr)}
                  hint="(stocks + créances) − (fournisseurs + dettes_fisc_soc)"
                />
                <KpiCard
                  label="DSO (j)"
                  value={kpis.dso === null ? "N/D" : formatNumber(kpis.dso, 0)}
                  hint="(clients × 365) / (ca × 1.2)"
                />
                <KpiCard
                  label="Solvabilité"
                  value={kpis.solvabilite === null ? "N/D" : formatPercent(kpis.solvabilite, 1)}
                  hint="total_cp / total_passif"
                />
              </div>
            </section>
          )}

          {/* Filtre temporel global (partagé entre pages) */}
          <TemporalityBar
            rightLabel={`${latest?.dailyAccounting?.length ?? 0} jour(s) avec écritures`}
          />

          {/* Graphe */}
          {periods.length > 0 && (
            <section className="precision-card rounded-xl p-6">
              <h2 className="mb-4 text-sm uppercase tracking-wider text-white/50">
                Évolution {GRANULARITY_LABEL[granularity].toLowerCase()} — produits vs charges
              </h2>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={periods.map((p) => ({
                      period: p.period,
                      total_prod_expl: Math.round(p.values.total_prod_expl),
                      total_charges_expl: Math.round(p.values.total_charges_expl),
                    }))}
                    margin={{ top: 10, right: 20, bottom: 10, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      dataKey="period"
                      stroke="rgba(255,255,255,0.5)"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      stroke="rgba(255,255,255,0.5)"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(10,10,10,0.92)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: unknown) =>
                        formatCurrency(typeof value === "number" ? value : null)
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="total_prod_expl"
                      name="Produits"
                      stroke="#d4af37"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total_charges_expl"
                      name="Charges"
                      stroke="#e74c3c"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Tableau récap */}
          <section className="precision-card rounded-xl p-6">
            <h2 className="mb-4 text-sm uppercase tracking-wider text-white/50">
              Récap {GRANULARITY_LABEL[granularity].toLowerCase()} — variables P&L principales
            </h2>
            {periods.length === 0 ? (
              <p className="text-sm text-white/60">Aucune donnée.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white/50">
                      <th className="py-2 pr-4 font-medium">Variable</th>
                      {periods.map((p) => (
                        <th
                          key={p.period}
                          className="py-2 px-3 text-right font-medium whitespace-nowrap"
                        >
                          {p.period}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {HIGHLIGHTED_PNL_CODES.map((code) => (
                      <tr key={code} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-2 pr-4 font-mono text-white/80">{code}</td>
                        {periods.map((p) => {
                          const v = p.values[code];
                          return (
                            <td
                              key={`${code}-${p.period}`}
                              className={`py-2 px-3 text-right font-mono whitespace-nowrap ${
                                v === 0 ? "text-white/30" : "text-white"
                              }`}
                            >
                              {v === 0 ? "—" : formatCurrency(v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/10 text-white/50">
                      <td className="py-2 pr-4 italic">Jours avec écritures</td>
                      {periods.map((p) => (
                        <td
                          key={`days-${p.period}`}
                          className="py-2 px-3 text-right whitespace-nowrap"
                        >
                          {p.daysWithEntries}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* Snapshot bilan */}
          <section className="precision-card rounded-xl p-6">
            <h2 className="mb-4 text-sm uppercase tracking-wider text-white/50">
              Balance Sheet Snapshot
            </h2>
            {latest.balanceSheetSnapshot ? (
              <>
                <p className="mb-4 text-xs text-white/50">
                  asOfDate{" "}
                  <span className="font-mono text-white/70">
                    {latest.balanceSheetSnapshot.asOfDate}
                  </span>{" "}
                  · period start{" "}
                  <span className="font-mono text-white/70">
                    {latest.balanceSheetSnapshot.periodStart}
                  </span>
                </p>
                <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                  {HIGHLIGHTED_BALANCE_CODES.map((code) => {
                    const v = latest.balanceSheetSnapshot!.values[code];
                    return (
                      <div
                        key={code}
                        className={`flex items-baseline justify-between border-b border-white/5 py-2 ${
                          v === 0 ? "opacity-40" : ""
                        }`}
                      >
                        <span className="font-mono text-xs text-white/70">{code}</span>
                        <span className="font-mono">{formatCurrency(v)}</span>
                      </div>
                    );
                  })}
                </div>
                <details className="mt-6">
                  <summary className="cursor-pointer text-xs text-white/50 hover:text-white/80">
                    Toutes les variables bilan (incl. zéros)
                  </summary>
                  <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-black/40 p-4 text-xs text-white/60">
                    {JSON.stringify(latest.balanceSheetSnapshot.values, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <p className="text-sm text-white/60">
                Snapshot bilan absent (trial balance Pennylane non disponible).
              </p>
            )}
          </section>

          {/* Raw debug */}
          <section className="precision-card rounded-xl p-6">
            <details>
              <summary className="cursor-pointer text-sm text-white/60 hover:text-white">
                Raw dailyAccounting (JSON)
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-black/40 p-4 text-xs text-white/60">
                {JSON.stringify(latest.dailyAccounting, null, 2)}
              </pre>
            </details>
          </section>
        </>
      )}
    </div>
  );
}

// ─── UI primitives locales ──────────────────────────────────────────────

function Header() {
  return (
    <header className="border-b border-white/10 pb-6">
      <p className="text-xs uppercase tracking-wider text-quantis-gold">DEBUG</p>
      <h1 className="mt-2 text-2xl font-semibold">Pennylane sync · données front</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/60">
        Connectez-vous à Pennylane via un Company Token, lancez un sync, puis explorez les données
        avec différents niveaux de granularité (jour / semaine / mois / trimestre / année).
      </p>
    </header>
  );
}

function Meta({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-white/40 uppercase tracking-wider">{label}</div>
      <div className={`mt-1 break-all ${mono ? "font-mono text-[11px]" : "text-sm"}`}>{value}</div>
    </div>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="precision-card rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
      <div className="mt-2 text-[10px] text-white/40">{hint}</div>
    </div>
  );
}
