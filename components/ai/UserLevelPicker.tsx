// File: components/ai/UserLevelPicker.tsx
// Role: petit sélecteur affiché à la première ouverture de l'AiChatPanel
// (ou depuis les réglages) pour que l'utilisateur déclare son niveau de
// littératie financière. Le choix est persisté en localStorage et adapte
// le ton du system prompt + le style des explications dans les tooltips.
"use client";

import { GraduationCap, BookOpen, Sparkles } from "lucide-react";
import { USER_LEVEL_META } from "@/lib/ai/userLevel";
import type { UserLevel } from "@/lib/ai/types";

const ICON_BY_LEVEL: Record<UserLevel, typeof GraduationCap> = {
  beginner: BookOpen,
  intermediate: GraduationCap,
  expert: Sparkles,
};

const ORDER: UserLevel[] = ["beginner", "intermediate", "expert"];

export function UserLevelPicker({
  onPick,
}: {
  onPick: (level: UserLevel) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-quantis-gold/30 bg-black/30 p-4">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-wider text-quantis-gold/80">
          Première fois ici ?
        </p>
        <p className="mt-1 text-sm font-medium text-white">
          Quel est votre niveau en finance d&apos;entreprise ?
        </p>
        <p className="mt-1 text-xs text-white/60">
          Vyzor adaptera son ton et la profondeur de ses explications. Vous pourrez le changer à tout moment.
        </p>
      </div>

      <div className="grid gap-2">
        {ORDER.map((level) => {
          const Icon = ICON_BY_LEVEL[level];
          const meta = USER_LEVEL_META[level];
          return (
            <button
              key={level}
              type="button"
              onClick={() => onPick(level)}
              className="group flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-quantis-gold/60 hover:bg-quantis-gold/[0.08]"
            >
              <span className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-quantis-gold/30 bg-quantis-gold/10 text-quantis-gold">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-white group-hover:text-quantis-gold">
                  {meta.label}
                </span>
                <span className="mt-0.5 block text-xs text-white/60">
                  {meta.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
