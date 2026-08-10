// ================================================================
// INDICATOR COMMENTARY
//
// Neither Eurostat nor FXMacroData publishes a comment alongside a
// figure — confirmed live against both before writing this: the
// bulk APIs carry numbers and metadata, never prose. This builds
// the prompt for a short French sentence explaining a fresh reading,
// generated once per genuinely new publication and then stored
// rather than regenerated.
//
// Pure string building — no I/O, no clock.
// ================================================================

export interface CommentaryInput {
    /** Human label as shown in the UI, e.g. "Inflation (IPCH)". */
    label: string;
    /** ISO 4217-ish display code, e.g. "EUR". */
    currency: string;
    value: number;
    /** Unit suffix as displayed, e.g. "%", "Md€", "". */
    unit: string;
    /** Human period, e.g. "juillet 2026" or "T2 2026". */
    period: string;
    previousValue: number | null;
    previousPeriod: string | null;
    source: string;
}

export const COMMENTARY_SYSTEM =
    "Tu es un analyste macroéconomique qui commente une publication de donnée chiffrée en une phrase, en français, dans le style d'une brève financière (Reuters, Trading Economics). " +
    "Tu commentes UNIQUEMENT les chiffres fournis : la valeur, la précédente, la période. " +
    "N'invente jamais de consensus de marché, de prévision, de ventilation par pays ou de cause que le prompt ne te donne pas explicitement — une brève qui se trompe sur un fait vérifiable est pire qu'une brève plus sobre. " +
    "Une seule phrase, deux au maximum. Pas de guillemets, pas de markdown.";

const COMMENTARY_SCHEMA = {
    type: "object",
    properties: {
        comment: { type: "string" },
    },
    required: ["comment"],
    additionalProperties: false,
} as const;

export function commentarySchema(): typeof COMMENTARY_SCHEMA {
    return COMMENTARY_SCHEMA;
}

/**
 * Parses and narrows Gemini's JSON reply.
 *
 * Trimmed and length-capped: a model given "one sentence, two at most" that
 * answers with a paragraph has not failed the schema (the schema only
 * requires a string), so the bound is enforced here rather than trusted from
 * the instruction alone.
 */
const MAX_COMMENT_LENGTH = 400;

export function parseCommentaryResponse(value: unknown): string | null {
    if (!value || typeof value !== "object") return null;
    const comment = (value as { comment?: unknown }).comment;
    if (typeof comment !== "string") return null;

    const trimmed = comment.trim();
    if (trimmed.length === 0) return null;

    return trimmed.length > MAX_COMMENT_LENGTH ? `${trimmed.slice(0, MAX_COMMENT_LENGTH - 1)}…` : trimmed;
}

/**
 * Builds the prompt for one fresh reading.
 *
 * The previous reading is included whenever known, because "2.9%" alone says
 * nothing a trader cares about — "2.9%, up from 2.8%" is the actual news.
 * Omitted rather than guessed when genuinely absent (a series' first ever
 * point), which the model is told explicitly so it does not invent a
 * comparison.
 */
export function buildCommentaryPrompt(input: CommentaryInput): string {
    const lines = [
        `Indicateur : ${input.label} (${input.currency})`,
        `Nouvelle valeur : ${input.value}${input.unit} pour la période ${input.period}`,
    ];

    if (input.previousValue !== null) {
        lines.push(
            `Valeur précédente : ${input.previousValue}${input.unit}` +
                (input.previousPeriod ? ` (${input.previousPeriod})` : ""),
        );
    } else {
        lines.push("Aucune valeur précédente connue — c'est la première lecture de cette série.");
    }

    lines.push(`Source : ${input.source}.`);
    lines.push("", "Rédige le commentaire.");

    return lines.join("\n");
}
