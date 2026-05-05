// File: components/debug/PennylaneClassesView.tsx
// Role: vue debug "données Pennylane par classe PCG (1 à 7)".
//
// Pour le PM : ouvre cette page après une sync, choisis une connection
// dans le picker, et tu vois compte par compte ce qu'on a réellement
// rapatrié — agrégé par classe du Plan Comptable Général français.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { formatCurrency } from "@/components/dashboard/formatting";
import type { AuthenticatedUser } from "@/types/auth";
import type {
  ClassAggregate,
  PcgClassCode,
  PennylaneClassReport,
} from "@/lib/debug/pennylaneClasses";

type ConnectionSummary = {
  id: string;
  externalCompanyId: string;
  tokenPreview: string;
  authMode: string;
  status: string;
  lastSyncAt: string | null;
  lastSyncStatus: string;
  createdAt: string;
};

type FetchState = "idle" | "loading" | "ready" | "error";

const CLASS_PALETTE: Record<PcgClassCode, { ring: string; text: string; chip: string }> = {
  "1": { ring: "border-l-purple-400/70", text: "text-purple-300", chip: "bg-purple-500/15 text-purple-200" },
  "2": { ring: "border-l-blue-400/70", text: "text-blue-300", chip: "bg-blue-500/15 text-blue-200" },
  "3": { ring: "border-l-cyan-400/70", text: "text-cyan-300", chip: "bg-cyan-500/15 text-cyan-200" },
  "4": { ring: "border-l-amber-400/70", text: "text-amber-300", chip: "bg-amber-500/15 text-amber-200" },
  "5": { ring: "border-l-emerald-400/70", text: "text-emerald-300", chip: "bg-emerald-500/15 text-emerald-200" },
  "6": { ring: "border-l-rose-400/70", text: "text-rose-300", chip: "bg-rose-500/15 text-rose-200" },
  "7": { ring: "border-l-quantis-gold/80", text: "text-quantis-gold", chip: "bg-quantis-gold/15 text-quantis-gold" },
  "8": { ring: "border-l-white/30", text: "text-white/70", chip: "bg-white/10 text-white/70" },
  "9": { ring: "border-l-white/30", text: "text-white/70", chip: "bg-white/10 text-white/70" },
};

type RawApiResponse = {
  environment: {
    baseUrl: string;
    baseUrlOverridden: boolean;
    defaultBaseUrl: string;
    hint: string;
  };
  connection: {
    id: string;
    authMode: string;
    tokenPreview: string;
    externalCompanyId: string;
    externalFirmId: string | null;
    lastSyncAt: string | null;
    lastSyncStatus: string;
  };
  me: SafeResult<unknown>;
  samples: Record<string, SafeResult<unknown>>;
};

type SafeResult<T> = { ok: true; value: T } | { ok: false; error: string };

// Mapping (raw Pennylane → mapped interne) affiché sous chaque section pour
// que le PM voie d'un coup d'œil la transformation appliquée par les mappers.
const RAW_TO_MAPPED_HINTS: Record<string, string[]> = {
  ledger_accounts: [
    "number → number (préservé)",
    "label / name → label",
    "type (sales/supplier/customer/general/tax) → type (asset/liability/equity/revenue/expense)",
  ],
  journals: [
    "id → externalId",
    "code → code (préservé)",
    "name → label",
    "type (sales/loans/general…) → type (préservé)",
  ],
  customers: [
    "name → name",
    "legal_name → legalName",
    "reg_no / registration_number → siret (14 chiffres)",
    "vat_number → vatNumber",
    "emails[0] / email → email",
    "country_alpha2 → countryCode",
    "business_sector → sector",
  ],
  suppliers: [
    "Mêmes champs que customers — type interne fixé à 'supplier'.",
  ],
  ledger_entries_list: [
    "Vue liste : pas de lignes — uniquement métadonnées (id, date, label, journal_id).",
    "→ Le mapper exige la vue détail (ledger_entry_detail) pour récupérer les lignes.",
  ],
  ledger_entry_detail: [
    "id → externalId",
    "journal.code / journal_id → journalCode",
    "date → date",
    "label → label",
    "ledger_entry_lines[].ledger_account.number → lines[].accountNumber",
    "ledger_entry_lines[].debit (string) → lines[].debit (number, € HT)",
    "ledger_entry_lines[].credit (string) → lines[].credit (number, € HT)",
    "ledger_entry_lines[].vat_rate → lines[].vatRate",
  ],
  customer_invoices: [
    "id → externalId",
    "invoice_number / number → number",
    "date / deadline / paid_at → date / dueDate / paidAt",
    "currency_amount_before_tax → amountExclVat",
    "currency_amount → amountInclVat",
    "tax / currency_tax → vatAmount",
    "customer.id → contactExternalId",
  ],
  supplier_invoices: [
    "Mêmes mappings que customer_invoices.",
    "supplier.id → contactExternalId, type → 'supplier'.",
  ],
  trial_balance: [
    "number → accountNumber",
    "label → accountLabel",
    "debits (string) → debit (number)",
    "credits (string) → credit (number)",
    "formatted_number → formattedNumber",
  ],
};

export function PennylaneClassesView() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [report, setReport] = useState<PennylaneClassReport | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Vue "format brut API Pennylane" : chargée à la demande via le bouton
  // dédié. Permet de voir base URL, /me et les payloads JSON natifs avant
  // mapping. Dissociée du report pour ne pas allonger le chargement initial
  // (ces appels tapent l'API Pennylane en live, plusieurs requêtes).
  const [rawApi, setRawApi] = useState<RawApiResponse | null>(null);
  const [rawState, setRawState] = useState<FetchState>("idle");
  const [rawError, setRawError] = useState<string | null>(null);

  // ── Auth ────────────────────────────────────────────────────────────
  useEffect(() => {
    let unsub: (() => void) | undefined;
    void (async () => {
      const { firebaseAuthGateway } = await import("@/services/auth");
      unsub = firebaseAuthGateway.subscribe((nextUser) => {
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
        setAuthReady(true);
      });
    })();
    return () => unsub?.();
  }, [router]);

  const fetchWithToken = useCallback(async (path: string) => {
    const { firebaseAuthGateway } = await import("@/services/auth");
    const idToken = await firebaseAuthGateway.getIdToken();
    if (!idToken) throw new Error("Non authentifié");
    const res = await fetch(path, { headers: { authorization: `Bearer ${idToken}` } });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Erreur HTTP ${res.status}`);
    }
    return res.json();
  }, []);

  // ── Liste des connections Pennylane ─────────────────────────────────
  const loadConnections = useCallback(async () => {
    try {
      const data = (await fetchWithToken("/api/debug/pennylane-classes")) as {
        connections: ConnectionSummary[];
      };
      setConnections(data.connections);
      if (data.connections.length > 0 && !selectedId) {
        setSelectedId(data.connections[0]!.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }, [fetchWithToken, selectedId]);

  useEffect(() => {
    if (!authReady || !user) return;
    void loadConnections();
  }, [authReady, user, loadConnections]);

  // ── Chargement du rapport pour la connection sélectionnée ───────────
  const loadReport = useCallback(async () => {
    if (!selectedId) return;
    setFetchState("loading");
    setError(null);
    try {
      const data = (await fetchWithToken(
        `/api/debug/pennylane-classes?connectionId=${encodeURIComponent(selectedId)}`
      )) as { report: PennylaneClassReport };
      setReport(data.report);
      setFetchState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setFetchState("error");
    }
  }, [fetchWithToken, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    void loadReport();
  }, [selectedId, loadReport]);

  const loadRawApi = useCallback(async () => {
    if (!selectedId) return;
    setRawState("loading");
    setRawError(null);
    try {
      const data = (await fetchWithToken(
        `/api/debug/pennylane-raw?connectionId=${encodeURIComponent(selectedId)}&limit=3`
      )) as RawApiResponse;
      setRawApi(data);
      setRawState("ready");
    } catch (err) {
      setRawError(err instanceof Error ? err.message : "Erreur inconnue");
      setRawState("error");
    }
  }, [fetchWithToken, selectedId]);

  // Reset le rawApi quand on change de connection — sinon on affiche du
  // contenu d'une autre boîte si l'utilisateur switche le picker.
  useEffect(() => {
    setRawApi(null);
    setRawState("idle");
    setRawError(null);
  }, [selectedId]);

  const totals = report?.totals;
  const classes = report?.classes ?? [];

  // Le sens du net (« attendu débit/crédit ») teinte légèrement la couleur
  // du chiffre dans le récap pour faire ressortir une anomalie visuellement.
  const formatNet = (value: number) => formatCurrency(value);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <header className="precision-card flex items-center justify-between gap-3 rounded-2xl px-5 py-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/45">
            Debug Pennylane
          </p>
          <h1 className="text-lg font-semibold text-white">Données rapatriées par classe PCG</h1>
          <p className="text-xs text-white/55">
            Vue brute des comptes 1 à 7 — pour vérifier ce qui remonte réellement avant agrégation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </button>
      </header>

      {/* Connection picker */}
      <div className="precision-card rounded-2xl bg-[#0F0F12] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-white/70" htmlFor="conn-picker">
            Connection Pennylane :
          </label>
          {connections.length === 0 ? (
            <span className="text-xs italic text-white/55">
              Aucune connection trouvée. Connectez-vous via{" "}
              <a className="text-quantis-gold underline" href="/debug/pennylane">
                /debug/pennylane
              </a>{" "}
              d&apos;abord.
            </span>
          ) : (
            <select
              id="conn-picker"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
            >
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.externalCompanyId} · {c.tokenPreview} · {c.authMode}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={!selectedId || fetchState === "loading"}
            onClick={() => void loadReport()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-quantis-gold/40 bg-quantis-gold/10 px-3 py-1.5 text-xs text-quantis-gold transition hover:bg-quantis-gold/20 disabled:opacity-40"
          >
            {fetchState === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Recharger
          </button>
        </div>
        {error && (
          <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-300">
            {error}
          </p>
        )}
      </div>

      {/* Totaux */}
      {totals && (
        <div className="precision-card grid grid-cols-2 gap-4 rounded-2xl bg-[#0F0F12] p-5 sm:grid-cols-4">
          <Stat label="Comptes" value={totals.accountCount.toString()} />
          <Stat label="Écritures" value={totals.entryCount.toString()} />
          <Stat label="Lignes" value={totals.lineCount.toString()} />
          <Stat
            label="Période"
            value={
              totals.earliestEntryDate
                ? `${totals.earliestEntryDate} → ${totals.latestEntryDate}`
                : "—"
            }
          />
        </div>
      )}

      {/* ── Sandbox vs prod + format brut API ─────────────────────────── */}
      <RawApiSection
        rawApi={rawApi}
        rawState={rawState}
        rawError={rawError}
        onLoad={loadRawApi}
        disabled={!selectedId}
      />

      {/* Classes 1-7 */}
      {fetchState === "loading" && (
        <p className="text-center text-sm text-white/55">Chargement du rapport...</p>
      )}

      {fetchState === "ready" &&
        classes
          .filter((c) => ["1", "2", "3", "4", "5", "6", "7"].includes(c.classCode))
          .map((cls) => <ClassCard key={cls.classCode} cls={cls} formatNet={formatNet} />)}

      {/* Classes 8/9 si présentes */}
      {fetchState === "ready" &&
        classes.some((c) => (c.classCode === "8" || c.classCode === "9") && c.lineCount > 0) && (
          <details className="precision-card rounded-2xl bg-[#0F0F12] p-5">
            <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-white/55">
              Classes spéciales (8, 9) détectées — voir détail
            </summary>
            <div className="mt-3 space-y-3">
              {classes
                .filter((c) => (c.classCode === "8" || c.classCode === "9") && c.lineCount > 0)
                .map((cls) => (
                  <ClassCard key={cls.classCode} cls={cls} formatNet={formatNet} />
                ))}
            </div>
          </details>
        )}

      {/* Comptes hors classification */}
      {fetchState === "ready" && (report?.unmappedAccountSamples ?? []).length > 0 && (
        <div className="precision-card rounded-2xl border-l-4 border-l-rose-500/60 bg-[#0F0F12] p-5">
          <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-rose-300">
            Comptes au format inattendu ({report!.unmappedAccountSamples.length})
          </p>
          <ul className="space-y-1 text-xs text-white/75">
            {report!.unmappedAccountSamples.map((u) => (
              <li key={u.number} className="font-mono">
                <span className="text-rose-300">{u.number || "(vide)"}</span>{" "}
                — {u.label ?? "—"} · {u.lineCount} ligne{u.lineCount > 1 ? "s" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

function ClassCard({
  cls,
  formatNet,
}: {
  cls: ClassAggregate;
  formatNet: (n: number) => string;
}) {
  const palette = CLASS_PALETTE[cls.classCode];
  const [showSamples, setShowSamples] = useState(false);

  // Indicateur visuel "sens normal" : si la classe attend du crédit et que
  // le net est en débit (ou inversement), on l'highlight.
  const sign = useMemo(() => {
    if (cls.net === 0) return null;
    const isDebit = cls.net > 0;
    const expected = cls.meta.expectedSign;
    if (expected === "mixed") return null;
    if ((expected === "debit" && isDebit) || (expected === "credit" && !isDebit)) {
      return "ok";
    }
    return "anomaly";
  }, [cls]);

  return (
    <article
      className={`precision-card rounded-2xl border-l-4 ${palette.ring} bg-[#0F0F12] p-5`}
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className={`text-[10px] font-mono uppercase tracking-wider ${palette.text}`}>
            Classe {cls.classCode} — {cls.meta.label}
          </p>
          <p className="text-sm text-white/70">{cls.meta.description}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${palette.chip}`}>
          {cls.accountCount} comptes · {cls.lineCount} lignes
        </span>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/45">Total débit</p>
          <p className="font-mono text-white">{formatNet(cls.totalDebit)}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/45">Total crédit</p>
          <p className="font-mono text-white">{formatNet(cls.totalCredit)}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-white/45">Net</p>
          <p
            className={`font-mono ${
              sign === "anomaly" ? "text-amber-300" : "text-white"
            }`}
            title={
              sign === "anomaly"
                ? `Sens inattendu — cette classe est habituellement en ${cls.meta.expectedSign}.`
                : undefined
            }
          >
            {formatNet(cls.net)}
            {sign === "anomaly" && <span className="ml-1 text-[10px]">⚠</span>}
          </p>
        </div>
      </div>

      {/* Top comptes */}
      {cls.topAccounts.length > 0 ? (
        <div className="mb-3">
          <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-white/45">
            Top {cls.topAccounts.length} comptes (par |net|)
          </p>
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-white/5">
                <tr className="text-left text-white/60">
                  <th className="px-3 py-1.5 font-mono">N°</th>
                  <th className="px-3 py-1.5 font-medium">Libellé</th>
                  <th className="px-3 py-1.5 text-right font-mono">Débit</th>
                  <th className="px-3 py-1.5 text-right font-mono">Crédit</th>
                  <th className="px-3 py-1.5 text-right font-mono">Net</th>
                  <th className="px-3 py-1.5 text-right font-mono">Lignes</th>
                </tr>
              </thead>
              <tbody>
                {cls.topAccounts.map((a) => (
                  <tr key={a.number} className="border-t border-white/5 text-white/85">
                    <td className="px-3 py-1.5 font-mono text-quantis-gold/80">{a.number}</td>
                    <td className="px-3 py-1.5">{a.label ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatNet(a.totalDebit)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatNet(a.totalCredit)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatNet(a.net)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-white/55">
                      {a.lineCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="mb-3 text-xs italic text-white/45">
          Aucune ligne sur cette classe (référentiel uniquement, pas de mouvement).
        </p>
      )}

      {/* Sample */}
      {cls.sampleEntries.length > 0 && (
        <button
          type="button"
          onClick={() => setShowSamples((v) => !v)}
          className="text-[10px] font-mono uppercase tracking-wider text-quantis-gold/80 hover:text-quantis-gold"
        >
          {showSamples ? "Masquer" : "Voir"} les {cls.sampleEntries.length} dernières écritures →
        </button>
      )}

      {showSamples && cls.sampleEntries.length > 0 && (
        <div className="mt-3 space-y-2">
          {cls.sampleEntries.map((sample, i) => (
            <div
              key={sample.externalId ?? i}
              className="rounded-lg border border-white/10 bg-black/30 p-2.5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <p className="font-medium text-white">
                  <span className="font-mono text-white/55">{sample.date}</span> · {sample.label}
                </p>
                <p className="font-mono text-[10px] text-white/55">
                  {sample.journalCode}
                  {sample.reference ? ` · ${sample.reference}` : ""}
                </p>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-[11px]">
                {sample.linesInClass.map((line, idx) => (
                  <li key={idx} className="grid grid-cols-12 gap-2 font-mono text-white/75">
                    <span className="col-span-2 text-quantis-gold/80">{line.accountNumber}</span>
                    <span className="col-span-5 truncate text-white/85">
                      {line.accountLabel ?? line.description ?? "—"}
                    </span>
                    <span className="col-span-2 text-right">
                      {line.debit > 0 ? formatNet(line.debit) : ""}
                    </span>
                    <span className="col-span-2 text-right">
                      {line.credit > 0 ? formatNet(line.credit) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

// ─── Section "Format brut API Pennylane" ────────────────────────────────

function RawApiSection({
  rawApi,
  rawState,
  rawError,
  onLoad,
  disabled,
}: {
  rawApi: RawApiResponse | null;
  rawState: FetchState;
  rawError: string | null;
  onLoad: () => void;
  disabled: boolean;
}) {
  return (
    <section className="precision-card rounded-2xl border-l-4 border-l-cyan-400/60 bg-[#0F0F12] p-5">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-cyan-300">
            Identité connection + format brut API
          </p>
          <h2 className="text-sm font-semibold text-white">
            Tape directement l&apos;API Pennylane (sans mapping)
          </h2>
          <p className="mt-1 text-xs text-white/60">
            Confirme la base URL utilisée, identifie l&apos;entreprise via{" "}
            <code className="font-mono text-quantis-gold/80">/me</code>, et affiche le JSON natif
            renvoyé par chaque endpoint principal — pour comparer avec les données stockées.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || rawState === "loading"}
          onClick={onLoad}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"
        >
          {rawState === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {rawApi ? "Recharger" : "Charger les données brutes"}
        </button>
      </header>

      {rawError && (
        <p className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-300">
          {rawError}
        </p>
      )}

      {rawApi && (
        <div className="space-y-4">
          {/* Environnement */}
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
            <p className="mb-2 text-[10px] font-mono uppercase tracking-wider text-white/55">
              Environnement utilisé pour les appels API
            </p>
            <div className="space-y-1">
              <p>
                <span className="text-white/55">Base URL : </span>
                <code className="font-mono text-cyan-300">{rawApi.environment.baseUrl}</code>
                {rawApi.environment.baseUrlOverridden ? (
                  <span className="ml-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] uppercase text-amber-200">
                    override env
                  </span>
                ) : (
                  <span className="ml-2 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[9px] uppercase text-white/65">
                    défaut
                  </span>
                )}
              </p>
              <p className="text-white/65">{rawApi.environment.hint}</p>
              <p>
                <span className="text-white/55">Mode auth : </span>
                <code className="font-mono text-white/85">{rawApi.connection.authMode}</code>
                <span className="text-white/55"> · Token : </span>
                <code className="font-mono text-white/85">{rawApi.connection.tokenPreview}</code>
                <span className="text-white/55"> · External ID : </span>
                <code className="font-mono text-white/85">{rawApi.connection.externalCompanyId}</code>
              </p>
            </div>
          </div>

          {/* /me */}
          <RawJsonBlock
            title="GET /me — identité du token (à comparer avec ton compte Pennylane)"
            mappingHints={[
              "C'est l'endpoint qui prouve quel compte Pennylane répond.",
              "Si la response montre une autre entreprise/email que la sandbox attendue, le token pointe ailleurs.",
            ]}
            result={rawApi.me}
          />

          {Object.entries(rawApi.samples).map(([key, result]) => (
            <RawJsonBlock
              key={key}
              title={`GET /${key.replace(/_/g, "_")} — format natif (limit=3)`}
              mappingHints={RAW_TO_MAPPED_HINTS[key] ?? []}
              result={result}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RawJsonBlock({
  title,
  mappingHints,
  result,
}: {
  title: string;
  mappingHints: string[];
  result: SafeResult<unknown>;
}) {
  return (
    <details className="rounded-lg border border-white/10 bg-black/30 open:bg-black/40">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-white/85 hover:text-white">
        {title}
        {!result.ok && <span className="ml-2 text-rose-300">(erreur — voir détail)</span>}
      </summary>
      <div className="border-t border-white/5 px-3 py-3">
        {mappingHints.length > 0 && (
          <div className="mb-3 rounded-md border border-quantis-gold/20 bg-quantis-gold/[0.04] p-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-quantis-gold/80">
              Mapping appliqué (raw → interne)
            </p>
            <ul className="mt-1 space-y-0.5 text-[11px] text-white/75">
              {mappingHints.map((h, i) => (
                <li key={i} className="font-mono">• {h}</li>
              ))}
            </ul>
          </div>
        )}
        <pre className="max-h-96 overflow-auto rounded-md bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-white/85">
          {result.ok
            ? JSON.stringify(result.value, null, 2)
            : `Erreur API : ${result.error}`}
        </pre>
      </div>
    </details>
  );
}
