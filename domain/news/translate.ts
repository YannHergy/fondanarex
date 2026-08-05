// ================================================================
// TRANSLATION PROMPT
//
// Turns English forex headlines into French, in one batch.
//
// WHY TRANSLATE RATHER THAN SOURCE IN FRENCH: measured. FXStreet's
// French edition answers 403 to any request, and the francophone
// feeds that do answer — Investing.com — return ten items per feed
// against FXStreet's thirty, with a weaker forex focus. Switching
// sources would have traded the whole point of the feature for the
// language.
//
// TAGGING STAYS ON THE ENGLISH. The currency tagger has eighteen
// tests written against English headlines, and a translation is
// exactly the kind of thing that turns "Pound rises" into
// something the word-boundary rules no longer recognise. English
// decides which currency and which direction; French is only what
// the reader sees.
//
// Pure — no I/O.
// ================================================================

export interface Translatable {
    id: string;
    title: string;
    summary: string;
}

export const TRANSLATE_SYSTEM = `Tu traduis des titres d'actualité financière de l'anglais vers le
français, pour un terminal de trading forex.

RÈGLES :
- Traduis fidèlement. N'ajoute rien, n'interprète pas, ne résume pas.
- Garde les codes de devises et de paires tels quels : EUR/USD, GBP, XAU/USD, WTI.
- Garde les sigles d'institutions : Fed, BCE, BoE, BoJ, BNS, RBA, RBNZ. « ECB » devient
  « BCE », « Bank of England » devient « Banque d'Angleterre », « Federal Reserve »
  devient « Réserve fédérale ».
- Garde les noms propres, les sociétés et les noms d'analystes inchangés.
- Emploie le vocabulaire du trading en français : « le Dollar recule », « la Livre
  progresse », « ton haussier », « politique accommodante » pour dovish, « restrictive »
  pour hawkish.
- Les chiffres, dates et niveaux de prix restent identiques.
- Si un texte est vide, renvoie une chaîne vide.

Tu réponds uniquement par le tableau JSON demandé, dans le même ordre que l'entrée.`;

export const TRANSLATE_SCHEMA = {
    type: 'object',
    properties: {
        traductions: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    titre: { type: 'string' },
                    resume: { type: 'string' },
                },
                required: ['id', 'titre', 'resume'],
            },
        },
    },
    required: ['traductions'],
} as const;

/** Headlines batched into one request, identified so order cannot drift. */
export function buildTranslatePrompt(items: readonly Translatable[]): string {
    const body = items
        .map((item) =>
            JSON.stringify({ id: item.id, titre: item.title, resume: item.summary }),
        )
        .join('\n');

    return `Traduis en français les ${items.length} entrées ci-dessous.

Renvoie un objet {"traductions": [...]} contenant une entrée par identifiant, avec le
MÊME "id". L'identifiant est ce qui relie la traduction à son article : ne l'invente
pas, ne le modifie pas, n'en omets aucun.

${body}`;
}

export interface Translation {
    id: string;
    titre: string;
    resume: string;
}

/**
 * Reads the model's answer back into a lookup.
 *
 * Keyed by id rather than trusted by position: a model that drops one entry
 * from a batch of forty would otherwise shift every headline after it onto the
 * wrong article, which is far worse than a missing translation.
 */
export function parseTranslations(value: unknown): Map<string, Translation> {
    const out = new Map<string, Translation>();

    if (typeof value !== 'object' || value === null) return out;
    const raw = (value as { traductions?: unknown }).traductions;
    if (!Array.isArray(raw)) return out;

    for (const entry of raw) {
        if (typeof entry !== 'object' || entry === null) continue;
        const item = entry as Record<string, unknown>;

        if (typeof item.id !== 'string' || !item.id) continue;
        if (typeof item.titre !== 'string' || !item.titre.trim()) continue;

        out.set(item.id, {
            id: item.id,
            titre: item.titre.trim(),
            resume: typeof item.resume === 'string' ? item.resume.trim() : '',
        });
    }

    return out;
}
