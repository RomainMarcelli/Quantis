"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Info, Save } from "lucide-react";
import { QuantisLogo } from "@/components/ui/QuantisLogo";
import { setLocalAnalysisHint } from "@/lib/analysis/analysisAvailability";
import { buildCompleteKpis, type ManualKpiInput } from "@/lib/kpiBuilder";
import { calculateQuantisScore } from "@/lib/quantisScore";
import { DEFAULT_FOLDER_NAME, registerKnownFolderName } from "@/lib/folders/folderRegistry";
import { createEmptyMappedFinancialData } from "@/services/mapping/financialDataMapper";
import { saveAnalysisDraft } from "@/services/analysisStore";
import { firebaseAuthGateway } from "@/services/auth";
import type { AnalysisDraft } from "@/types/analysis";
import type { AuthenticatedUser } from "@/types/auth";

type ManualFormState = {
  // Activité
  ca: string;
  tcam: string;
  // Rentabilité
  ebe: string;
  resultatNet: string;
  roe: string;
  roce: string;
  // Trésorerie & BFR
  cash: string;
  bfr: string;
  dso: string;
  dpo: string;
  // Avancé
  totalActif: string;
  capitauxPropres: string;
  dettesFinancieres: string;
  actifCirculant: string;
  dettesCt: string;
  immoBrut: string;
  immoNet: string;
};

type ManualValidationErrors = Partial<Record<keyof ManualFormState, string>>;

const INITIAL_STATE: ManualFormState = {
  ca: "",
  tcam: "",
  ebe: "",
  resultatNet: "",
  roe: "",
  roce: "",
  cash: "",
  bfr: "",
  dso: "",
  dpo: "",
  totalActif: "",
  capitauxPropres: "",
  dettesFinancieres: "",
  actifCirculant: "",
  dettesCt: "",
  immoBrut: "",
  immoNet: ""
};

const REQUIRED_FIELDS: Array<keyof ManualFormState> = ["ca", "ebe", "resultatNet", "cash", "bfr", "dso", "dpo"];

export function ManualKpiEntryView() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(() => firebaseAuthGateway.getCurrentUser());
  const [formState, setFormState] = useState<ManualFormState>(INITIAL_STATE);
  const [fieldErrors, setFieldErrors] = useState<ManualValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = firebaseAuthGateway.subscribe((nextUser) => {
      if (!nextUser) {
        const params = new URLSearchParams({
          next: "/upload/manual"
        });
        router.replace(`/register?${params.toString()}`);
        return;
      }
      setUser(nextUser);
    });
    return unsubscribe;
  }, [router]);

  const hasAdvancedValues = useMemo(
    () =>
      [
        formState.totalActif,
        formState.capitauxPropres,
        formState.dettesFinancieres,
        formState.actifCirculant,
        formState.dettesCt,
        formState.immoBrut,
        formState.immoNet
      ].some((value) => value.trim().length > 0),
    [
      formState.totalActif,
      formState.capitauxPropres,
      formState.dettesFinancieres,
      formState.actifCirculant,
      formState.dettesCt,
      formState.immoBrut,
      formState.immoNet
    ]
  );

  function onGoBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/upload");
  }

  async function onSubmit() {
    if (!user) {
      return;
    }

    const parsed = parseManualInput(formState);
    if (!parsed.valid || !parsed.value) {
      setFieldErrors(parsed.errors);
      setErrorMessage("Vérifiez les champs signalés avant de continuer.");
      return;
    }

    setErrorMessage(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      // Pipeline demandé:
      // 1) input utilisateur
      // 2) buildCompleteKpis
      // 3) calculateQuantisScore
      // 4) sauvegarde + affichage synthèse
      const completeKpis = buildCompleteKpis(parsed.value);
      const quantisScore = calculateQuantisScore(completeKpis);

      const mappedData = createEmptyMappedFinancialData();
      mappedData.total_actif = parsed.value.total_actif;
      mappedData.total_cp = parsed.value.capitaux_propres;
      mappedData.emprunts = parsed.value.dettes_financieres;
      mappedData.total_actif_circ = parsed.value.actif_circulant;
      mappedData.fournisseurs = parsed.value.dettes_ct;
      mappedData.total_actif_immo = parsed.value.immo_brut;
      mappedData.immob_corp = parsed.value.immo_net;
      mappedData.dispo = parsed.value.cash;
      mappedData.clients = parsed.value.ca !== null && parsed.value.dso !== null
        ? (parsed.value.ca * parsed.value.dso) / 365
        : null;

      const draft: AnalysisDraft = {
        userId: user.uid,
        folderName: DEFAULT_FOLDER_NAME,
        createdAt: new Date().toISOString(),
        fiscalYear: new Date().getFullYear(),
        sourceFiles: [
          {
            name: "saisie-manuelle",
            mimeType: "text/plain",
            size: 0,
            type: "excel"
          }
        ],
        parsedData: [],
        rawData: {
          byVariableCode: {},
          byLineCode: {},
          byLabel: {}
        },
        mappedData,
        financialFacts: {
          revenue: parsed.value.ca,
          expenses: null,
          payroll: null,
          treasury: parsed.value.cash,
          receivables:
            parsed.value.ca !== null && parsed.value.dso !== null
              ? (parsed.value.ca * parsed.value.dso) / 365
              : null,
          payables:
            parsed.value.ca !== null && parsed.value.dpo !== null
              ? (parsed.value.ca * parsed.value.dpo) / 365
              : null,
          inventory: null
        },
        kpis: completeKpis,
        quantisScore,
        uploadContext: {
          companySize: null,
          sector: null,
          source: "manual"
        }
      };

      await saveAnalysisDraft(draft);
      setLocalAnalysisHint(true);
      registerKnownFolderName(DEFAULT_FOLDER_NAME);
      // Saisie manuelle = équivalent d'un upload FEC → on active la source
      // pour que la synthèse affiche les données saisies (sinon
      // activeAccountingSource = null → "Aucune synthèse disponible").
      const { writeActiveAccountingSource } = await import("@/services/dataSourcesStore");
      await writeActiveAccountingSource(user.uid, "fec", DEFAULT_FOLDER_NAME);
      router.push("/synthese");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Impossible d'enregistrer la saisie manuelle."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-5xl space-y-6">
      <header className="precision-card rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={onGoBack}
              className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
              aria-label="Revenir à la page précédente"
              title="Retour"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour
            </button>
            <h1 className="text-2xl font-semibold text-white md:text-3xl">
              Saisie manuelle <span className="text-quantis-gold">des KPI</span>
            </h1>
            <p className="mt-2 text-sm text-white/70">
              Renseignez quelques indicateurs simples. Quantis calcule ensuite automatiquement les KPI avancés
              pour produire un Quantis Score fiable.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
            <QuantisLogo withText={false} size={34} />
          </div>
        </div>
      </header>

      <section className="precision-card rounded-2xl p-5">
        <div className="space-y-5">
          <FormBlock title="A. Activité" description="Vision globale du volume et de la dynamique commerciale.">
            <div className="grid gap-4 md:grid-cols-2">
              <InputField
                label="Chiffre d'affaires (€)"
                hint="Total des ventes réalisées sur la période."
                value={formState.ca}
                error={fieldErrors.ca}
                onChange={(value) => setFormState((current) => ({ ...current, ca: value }))}
              />
              <InputField
                label="Croissance du CA (%)"
                hint="Évolution annuelle du CA (TCAM)."
                value={formState.tcam}
                error={fieldErrors.tcam}
                onChange={(value) => setFormState((current) => ({ ...current, tcam: value }))}
              />
            </div>
          </FormBlock>

          <FormBlock title="B. Rentabilité" description="Mesure de la performance économique de l'entreprise.">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <InputField
                label="EBE (€)"
                hint="Argent généré avant impôts, intérêts et amortissements."
                value={formState.ebe}
                error={fieldErrors.ebe}
                onChange={(value) => setFormState((current) => ({ ...current, ebe: value }))}
              />
              <InputField
                label="Résultat net (€)"
                hint="Bénéfice final après toutes les charges."
                value={formState.resultatNet}
                error={fieldErrors.resultatNet}
                onChange={(value) => setFormState((current) => ({ ...current, resultatNet: value }))}
              />
              <InputField
                label="ROE (%)"
                hint="Rentabilité des capitaux propres."
                value={formState.roe}
                error={fieldErrors.roe}
                onChange={(value) => setFormState((current) => ({ ...current, roe: value }))}
              />
              <InputField
                label="ROCE (%)"
                hint="Rentabilité des capitaux engagés."
                value={formState.roce}
                error={fieldErrors.roce}
                onChange={(value) => setFormState((current) => ({ ...current, roce: value }))}
              />
            </div>
          </FormBlock>

          <FormBlock title="C. Trésorerie & BFR" description="Équilibre du cash et délais du cycle d'exploitation.">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <InputField
                label="Cash disponible (€)"
                hint="Trésorerie immédiatement mobilisable."
                value={formState.cash}
                error={fieldErrors.cash}
                onChange={(value) => setFormState((current) => ({ ...current, cash: value }))}
              />
              <InputField
                label="BFR (€)"
                hint="Montant immobilisé dans le cycle d'exploitation."
                value={formState.bfr}
                error={fieldErrors.bfr}
                onChange={(value) => setFormState((current) => ({ ...current, bfr: value }))}
              />
              <InputField
                label="DSO (jours)"
                hint="Délai moyen de paiement clients."
                value={formState.dso}
                error={fieldErrors.dso}
                onChange={(value) => setFormState((current) => ({ ...current, dso: value }))}
              />
              <InputField
                label="DPO (jours)"
                hint="Délai moyen de paiement fournisseurs."
                value={formState.dpo}
                error={fieldErrors.dpo}
                onChange={(value) => setFormState((current) => ({ ...current, dpo: value }))}
              />
            </div>
          </FormBlock>

          <details className="rounded-xl border border-white/10 bg-black/20 p-3" open={hasAdvancedValues}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-white">
              <span>D. Optionnel (avancé)</span>
              <ChevronDown className="h-4 w-4 text-white/60" />
            </summary>
            <p className="mt-2 text-xs text-white/60">
              Ces données améliorent la précision des calculs de liquidité, solvabilité et usure des actifs.
            </p>
            <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <InputField
                label="Total actif (€)"
                value={formState.totalActif}
                error={fieldErrors.totalActif}
                onChange={(value) => setFormState((current) => ({ ...current, totalActif: value }))}
              />
              <InputField
                label="Capitaux propres (€)"
                value={formState.capitauxPropres}
                error={fieldErrors.capitauxPropres}
                onChange={(value) =>
                  setFormState((current) => ({ ...current, capitauxPropres: value }))
                }
              />
              <InputField
                label="Dettes financières (€)"
                value={formState.dettesFinancieres}
                error={fieldErrors.dettesFinancieres}
                onChange={(value) =>
                  setFormState((current) => ({ ...current, dettesFinancieres: value }))
                }
              />
              <InputField
                label="Actif circulant (€)"
                value={formState.actifCirculant}
                error={fieldErrors.actifCirculant}
                onChange={(value) => setFormState((current) => ({ ...current, actifCirculant: value }))}
              />
              <InputField
                label="Dettes court terme (€)"
                value={formState.dettesCt}
                error={fieldErrors.dettesCt}
                onChange={(value) => setFormState((current) => ({ ...current, dettesCt: value }))}
              />
              <InputField
                label="Immobilisations brutes (€)"
                value={formState.immoBrut}
                error={fieldErrors.immoBrut}
                onChange={(value) => setFormState((current) => ({ ...current, immoBrut: value }))}
              />
              <InputField
                label="Immobilisations nettes (€)"
                value={formState.immoNet}
                error={fieldErrors.immoNet}
                onChange={(value) => setFormState((current) => ({ ...current, immoNet: value }))}
              />
            </div>
          </details>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={isSubmitting}
            className="btn-gold-premium inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {isSubmitting ? "Enregistrement..." : "Calculer et enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            Retour à l&apos;upload
          </button>
        </div>

        {errorMessage ? (
          <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </section>
  );
}

function FormBlock({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <p className="mt-1 text-xs text-white/60">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function InputField({
  label,
  hint,
  value,
  error,
  onChange
}: {
  label: string;
  hint?: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-white">
        {label}
        {hint ? (
          <span title={hint} aria-label={hint}>
            <Info className="h-3.5 w-3.5 text-white/45" />
          </span>
        ) : null}
      </span>
      <div className="quantis-input bg-white/5 px-3 py-2">
        <input
          type="number"
          step="any"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full border-0 bg-transparent text-sm text-white outline-none"
        />
      </div>
      {hint ? <p className="mt-1 text-[11px] text-white/50">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-rose-300">{error}</p> : null}
    </label>
  );
}

type ParseResult =
  | { valid: true; value: ManualKpiInput; errors: ManualValidationErrors }
  | { valid: false; value: null; errors: ManualValidationErrors };

function parseManualInput(input: ManualFormState): ParseResult {
  const errors: ManualValidationErrors = {};

  for (const key of REQUIRED_FIELDS) {
    if (!input[key].trim()) {
      errors[key] = "Champ requis.";
    }
  }

  const parsed: Record<keyof ManualFormState, number | null> = {
    ca: toNullableNumber(input.ca, "ca", errors),
    tcam: toNullableNumber(input.tcam, "tcam", errors),
    ebe: toNullableNumber(input.ebe, "ebe", errors),
    resultatNet: toNullableNumber(input.resultatNet, "resultatNet", errors),
    roe: toNullableNumber(input.roe, "roe", errors),
    roce: toNullableNumber(input.roce, "roce", errors),
    cash: toNullableNumber(input.cash, "cash", errors),
    bfr: toNullableNumber(input.bfr, "bfr", errors),
    dso: toNullableNumber(input.dso, "dso", errors),
    dpo: toNullableNumber(input.dpo, "dpo", errors),
    totalActif: toNullableNumber(input.totalActif, "totalActif", errors),
    capitauxPropres: toNullableNumber(input.capitauxPropres, "capitauxPropres", errors),
    dettesFinancieres: toNullableNumber(input.dettesFinancieres, "dettesFinancieres", errors),
    actifCirculant: toNullableNumber(input.actifCirculant, "actifCirculant", errors),
    dettesCt: toNullableNumber(input.dettesCt, "dettesCt", errors),
    immoBrut: toNullableNumber(input.immoBrut, "immoBrut", errors),
    immoNet: toNullableNumber(input.immoNet, "immoNet", errors)
  };

  if (parsed.ca !== null && parsed.ca <= 0) {
    errors.ca = "Le chiffre d'affaires doit être supérieur à 0.";
  }

  if (parsed.dso !== null && parsed.dso < 0) {
    errors.dso = "Le DSO ne peut pas être négatif.";
  }

  if (parsed.dpo !== null && parsed.dpo < 0) {
    errors.dpo = "Le DPO ne peut pas être négatif.";
  }

  if (parsed.dettesCt !== null && parsed.dettesCt <= 0) {
    errors.dettesCt = "La dette court terme doit être > 0 pour calculer la liquidité.";
  }

  if (
    parsed.immoBrut !== null &&
    parsed.immoNet !== null &&
    parsed.immoNet > parsed.immoBrut
  ) {
    errors.immoNet = "Les immobilisations nettes ne peuvent pas dépasser le brut.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      valid: false,
      value: null,
      errors
    };
  }

  return {
    valid: true,
    value: {
      ca: parsed.ca,
      tcam: parsed.tcam,
      ebe: parsed.ebe,
      resultat_net: parsed.resultatNet,
      roe: parsed.roe,
      roce: parsed.roce,
      cash: parsed.cash,
      bfr: parsed.bfr,
      dso: parsed.dso,
      dpo: parsed.dpo,
      total_actif: parsed.totalActif,
      capitaux_propres: parsed.capitauxPropres,
      dettes_financieres: parsed.dettesFinancieres,
      actif_circulant: parsed.actifCirculant,
      dettes_ct: parsed.dettesCt,
      immo_brut: parsed.immoBrut,
      immo_net: parsed.immoNet
    },
    errors: {}
  };
}

function toNullableNumber(
  value: string,
  key: keyof ManualFormState,
  errors: ManualValidationErrors
): number | null {
  if (!value.trim()) {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    errors[key] = "Valeur numérique invalide.";
    return null;
  }

  return numericValue;
}
