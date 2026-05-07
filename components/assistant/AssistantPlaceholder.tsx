// File: components/assistant/AssistantPlaceholder.tsx
// Role: page teaser pour l'Assistant IA Vyzor (livraison MT).
//
// Deux modes selon les query params :
//   - sans `?kpi=` : teaser générique avec 5 questions modèles globales
//   - avec `?kpi={id}` : version contextualisée — header + question initiale
//     (si `?q=`) mise en avant + 4-5 questions liées au KPI cliqué
//
// Cf. docs/AI_ARCHITECTURE.md pour le détail des 3 niveaux IA prévus.
"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MessageCircle, Sparkles } from "lucide-react";
import { VyzorLogo } from "@/components/ui/VyzorLogo";
import { getKpiDefinition, type KpiDefinition } from "@/lib/kpi/kpiRegistry";

const GLOBAL_SAMPLE_QUESTIONS = [
  "Pourquoi mon EBITDA est-il négatif ce trimestre ?",
  "Quels leviers prioriser pour faire baisser mon BFR ?",
  "Mon DSO est anormalement long — par où commencer ?",
  "Combien d'euros une hausse de prix de 5 % rapporterait sur mon résultat ?",
  "Ma santé financière s'est-elle améliorée vs l'an dernier ?",
];

/**
 * Génère 5 questions contextualisées pour un KPI donné. On s'appuie sur le
 * registre (whenGood, whenBad) + 3 templates génériques substitués avec le
 * label du KPI. Ça donne un panel d'attaque varié (interprétation,
 * benchmark, action, simulation, projection) sans dépendre d'un champ supplé-
 * mentaire dans le registre.
 */
function buildKpiQuestions(def: KpiDefinition): string[] {
  return [
    def.suggestedQuestions.whenBad,
    def.suggestedQuestions.whenGood,
    `Comment ma valeur de ${def.shortLabel} se compare-t-elle au secteur ?`,
    `Quels facteurs influencent le plus mon ${def.shortLabel} ?`,
    `Quelle évolution réaliste de ${def.shortLabel} viser sur 12 mois ?`,
  ];
}

function AssistantPlaceholderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kpiId = searchParams.get("kpi");
  const initialQuestion = searchParams.get("q");

  const definition = kpiId ? getKpiDefinition(kpiId) : null;
  const isContextual = definition !== null;
  const questions = definition ? buildKpiQuestions(definition) : GLOBAL_SAMPLE_QUESTIONS;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <header className="precision-card flex items-center justify-between gap-3 rounded-2xl px-5 py-3">
        <div className="flex items-center gap-3">
          <VyzorLogo withText={false} size={28} />
          <div>
            <p className="text-sm font-semibold text-white">Assistant IA Vyzor</p>
            <p className="text-xs text-white/55">Bientôt disponible</p>
          </div>
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

      <div className="precision-card rounded-2xl border-l-4 border-l-[#C5A059] bg-[#1A1A2E] p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-quantis-gold/40 bg-quantis-gold/10 text-quantis-gold">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-quantis-gold/70">
              {isContextual ? `Contexte : ${definition!.shortLabel}` : "Aperçu"}
            </p>
            <h1 className="text-xl font-semibold text-white">
              {isContextual
                ? `Discutons de votre ${definition!.label}`
                : "L'assistant IA arrive bientôt"}
            </h1>
          </div>
        </div>

        {isContextual ? (
          <>
            <p className="text-sm leading-relaxed text-white/85">
              L&apos;assistant pourra analyser votre {definition!.shortLabel} en contexte avec vos
              autres KPIs, vous expliquer pourquoi il évolue dans ce sens, et vous proposer des
              actions concrètes adaptées à votre secteur.
            </p>

            {/* Question d'origine — si l'utilisateur a cliqué la question
                suggérée du tooltip, on l'affiche ici en surbrillance pour
                lui montrer qu'elle sera la première à être traitée. */}
            {initialQuestion ? (
              <div className="mt-5 rounded-xl border border-quantis-gold/40 bg-quantis-gold/[0.06] p-4">
                <p className="mb-1 text-[10px] font-mono uppercase tracking-wider text-quantis-gold/80">
                  Votre question
                </p>
                <p className="text-sm font-medium text-white">{initialQuestion}</p>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm leading-relaxed text-white/85">
            L&apos;assistant IA Vyzor pourra analyser vos KPIs en contexte, répondre à vos
            questions financières en langage naturel, et simuler des scénarios à votre place. Tout
            sera ancré sur vos données comptables réelles, sans faire d&apos;hypothèses que vous ne
            pourriez pas vérifier.
          </p>
        )}

        <div className="mt-6">
          <p className="mb-3 text-[10px] font-mono uppercase tracking-wider text-white/45">
            {isContextual
              ? `Questions suggérées sur ${definition!.shortLabel}`
              : "Questions modèles que l'assistant pourra traiter"}
          </p>
          <ul className="space-y-2">
            {questions.map((q) => (
              <li
                key={q}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 opacity-70"
                aria-disabled="true"
              >
                <span aria-hidden className="text-quantis-gold/60">
                  ✨
                </span>
                <span className="text-sm text-white/80">{q}</span>
                <span className="ml-auto font-mono text-[10px] uppercase text-white/35">
                  Bientôt
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Zone de saisie libre — désactivée pour l'instant, mais visuellement
            présente pour montrer le futur produit. */}
        <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-3">
          <div className="flex items-center gap-2 text-white/40">
            <MessageCircle className="h-4 w-4" />
            <span className="text-[10px] font-mono uppercase tracking-wider">
              Ou posez votre question
            </span>
          </div>
          <input
            type="text"
            disabled
            placeholder={
              isContextual
                ? `Une autre question sur ${definition!.shortLabel}…`
                : "Posez votre question financière en langage naturel…"
            }
            className="mt-2 w-full cursor-not-allowed bg-transparent px-1 py-1 text-sm text-white/40 placeholder:text-white/30 focus:outline-none"
          />
          <p className="mt-2 text-[10px] italic text-white/35">
            La saisie libre s&apos;active dès la livraison du niveau 3 (chat multi-tour).
          </p>
        </div>

        <p className="mt-6 text-[11px] italic text-white/50">
          Détail technique de l&apos;architecture IA dans{" "}
          <code className="font-mono text-white/70">docs/AI_ARCHITECTURE.md</code> — 3 niveaux
          (tooltip, question suggérée, chat libre), system prompt contextualisé, stockage Firestore
          des conversations.
        </p>
      </div>
    </section>
  );
}

export function AssistantPlaceholder() {
  // useSearchParams() exige un Suspense boundary parent en Next 13+.
  // On en pose un local pour ne pas dépendre du squelette serveur.
  return (
    <Suspense fallback={<div className="precision-card mx-auto max-w-3xl rounded-2xl p-8 text-sm text-white/55">Chargement…</div>}>
      <AssistantPlaceholderInner />
    </Suspense>
  );
}
