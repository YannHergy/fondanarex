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
    /**
     * What this indicator is FOR — a policy target, a normal range, a
     * directional rule of thumb. "2.9%" means nothing on its own; "2.9%,
     * against a 2% target" is the actual news, and the target is not
     * something the reading itself carries.
     *
     * Owned by the caller, not this module: a wrong or outdated target here
     * would make every comment for that field wrong, so each one is set
     * once, deliberately, next to the series it describes — see
     * `EUROSTAT_CONTEXT` in lib/integrations/eurostat.ts — rather than
     * guessed generically for "a percentage" or "a growth rate".
     *
     * Null when the field genuinely has none (nothing invented in its place).
     */
    context: string | null;
}

export const COMMENTARY_SYSTEM =
    "Tu es un analyste macroéconomique qui commente une publication de donnée chiffrée en une ou deux phrases, en français, dans le style d'une brève financière (Reuters, Trading Economics). " +
    "Une brève qui se contente de dire qu'un chiffre a bougé n'apporte rien : le lecteur veut savoir ce que ce chiffre SIGNIFIE. " +
    "Quand un contexte t'est donné (objectif de banque centrale, zone jugée saine, seuil habituel), situe la nouvelle valeur PAR RAPPORT à ce contexte — au-dessus, en dessous, dans la zone, combien de points d'écart — et pas seulement par rapport à la valeur précédente. " +
    "Tu commentes UNIQUEMENT les chiffres et le contexte fournis : la valeur, la précédente, la période, l'objectif donné. " +
    "N'invente jamais de consensus de marché, de prévision, de ventilation par pays, ou un objectif que le prompt ne te donne pas explicitement — une brève qui se trompe sur un fait vérifiable est pire qu'une brève plus sobre. " +
    "Une ou deux phrases, jamais plus. Pas de guillemets, pas de markdown.";

/**
 * No `additionalProperties`. Gemini's `responseSchema` is a restricted
 * OpenAPI-style dialect, not full JSON Schema — that keyword makes it reject
 * the request outright with HTTP 400 rather than ignore it, confirmed live:
 * ["Invalid JSON payload received. Unknown name \"additionalProperties\"..."].
 * A 400 is not in `geminiRetryable`'s list, so the call failed on every one
 * of the three fallback models identically and silently, since the caller in
 * macro-refresh.ts treats commentary as best-effort and never surfaces the
 * returned error.
 */
const COMMENTARY_SCHEMA = {
    type: "object",
    properties: {
        comment: { type: "string" },
    },
    required: ["comment"],
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

    if (input.context) {
        lines.push(`Contexte : ${input.context}`);
    }

    lines.push(`Source : ${input.source}.`);
    lines.push("", "Rédige le commentaire.");

    return lines.join("\n");
}
