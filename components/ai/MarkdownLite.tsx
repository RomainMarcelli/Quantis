// File: components/ai/MarkdownLite.tsx
// Role: rendu markdown minimal pour les bulles assistant. Volontairement
// pas de dépendance externe (react-markdown, marked, etc.) — la surface
// utilisée est petite : **gras**, *italique*, listes, ligne, paragraphe.
//
// Pourquoi pas marked/react-markdown :
//   - bundle léger (un dirigeant ouvre l'AiChatPanel rarement, pas la peine
//     de charger 50 ko de JS),
//   - sécurité : on ne supporte pas le HTML brut (pas de XSS via réponse
//     LLM mal calibrée — paranoïa raisonnable),
//   - contrôle total sur le styling Tailwind et la couleur dorée.
//
// Limitations assumées : pas de tableaux, pas de blocs de code multi-ligne,
// pas de liens. On ajoutera quand un cas d'usage le justifie.
"use client";

import { Fragment } from "react";

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "h"; level: 2 | 3; text: string };

/**
 * Découpe le markdown brut en blocs (paragraphes, listes, titres).
 * Une ligne vide sépare deux blocs ; les listes sont reconnues par leur
 * préfixe `- ` ou `1. `.
 */
function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    // Ligne vide → on avance
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Titre (## …, ### …)
    const headerMatch = line.match(/^(#{2,3})\s+(.*)$/);
    if (headerMatch) {
      blocks.push({
        type: "h",
        level: headerMatch[1]!.length === 2 ? 2 : 3,
        text: headerMatch[2]!,
      });
      i++;
      continue;
    }

    // Liste à puces (- …)
    if (line.match(/^- /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.match(/^- /)) {
        items.push(lines[i]!.replace(/^- /, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Liste numérotée (1. …)
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.match(/^\d+\.\s/)) {
        items.push(lines[i]!.replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // Sinon : paragraphe (jusqu'à la prochaine ligne vide)
    const paraLines: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !lines[i]!.match(/^[-#]|^\d+\.\s/)) {
      paraLines.push(lines[i]!);
      i++;
    }
    if (paraLines.length) {
      blocks.push({ type: "p", text: paraLines.join(" ") });
    }
  }

  return blocks;
}

/**
 * Inline formatter — gère **gras** et *italique* sur une string. Échappe
 * tout le reste pour empêcher l'injection HTML accidentelle.
 */
function renderInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  // Regex : `**…**` ou `*…*`. On capture le marqueur pour différencier.
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const t = match[0]!;
    if (t.startsWith("**")) {
      tokens.push(
        <strong key={`b-${key++}`} className="font-semibold text-quantis-gold">
          {t.slice(2, -2)}
        </strong>
      );
    } else {
      tokens.push(
        <em key={`i-${key++}`} className="italic">
          {t.slice(1, -1)}
        </em>
      );
    }
    lastIndex = match.index + t.length;
  }
  if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
  return tokens;
}

export function MarkdownLite({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-white/90">
      {blocks.map((block, idx) => (
        <Fragment key={idx}>
          {block.type === "p" && <p>{renderInline(block.text)}</p>}
          {block.type === "h" && block.level === 2 && (
            <h3 className="text-sm font-semibold text-white">{renderInline(block.text)}</h3>
          )}
          {block.type === "h" && block.level === 3 && (
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/70">
              {renderInline(block.text)}
            </h4>
          )}
          {block.type === "ul" && (
            <ul className="list-disc space-y-1 pl-5 marker:text-quantis-gold/70">
              {block.items.map((it, i) => (
                <li key={i}>{renderInline(it)}</li>
              ))}
            </ul>
          )}
          {block.type === "ol" && (
            <ol className="list-decimal space-y-1 pl-5 marker:text-quantis-gold/70">
              {block.items.map((it, i) => (
                <li key={i}>{renderInline(it)}</li>
              ))}
            </ol>
          )}
        </Fragment>
      ))}
    </div>
  );
}
