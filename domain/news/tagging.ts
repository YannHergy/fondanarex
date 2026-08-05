// ================================================================
// CURRENCY TAGGING AND DIRECTION
//
// Which currencies a headline is about, and which way it leans for
// each of them.
//
// EVERY TERM IS MATCHED ON WORD BOUNDARIES. The legacy filter used
// bare substring tests, and `'boe'` — for Bank of England —
// matched inside "Boeing", so an FAA certification of a 737 was
// filed under the pound. On a page a trader reads before risking
// money, a wrong tag is worse than no tag.
//
// DIRECTION IS PER CURRENCY, not per article. "British Pound rises
// as soft ADP jobs report weighs on Dollar" is bullish sterling and
// bearish dollar in one sentence; a single article-level sentiment
// would have to be wrong about one of them.
//
// Pure — no I/O.
// ================================================================

export type Lean = 'bullish' | 'bearish' | 'neutral';

export interface Tag {
    currency: string;
    lean: Lean;
}

/**
 * "Dollar" on its own, meaning the American one.
 *
 * Needed because a forex feed writes "weighs on Dollar" as often as "US
 * Dollar", and dropping the bare form loses half the greenback's coverage. The
 * lookbehind is what makes it safe: without it every Canadian, Australian and
 * New Zealand dollar headline would also be filed under USD, which is the
 * mirror image of the Boeing mistake.
 */
const BARE_DOLLAR =
    /(?<!(?:canadian|australian|new zealand|singapore|hong kong|taiwan|nz)\s)(?<![a-z0-9])dollars?(?![a-z0-9])/gi;

/**
 * Terms that identify a currency.
 *
 * Written for a forex feed, where headlines name the currency in words rather
 * than in codes. Deliberately excludes bare country names — "Germany" appears
 * in stories with nothing to do with the euro, and the noise it lets through
 * costs more than the few articles it catches.
 */
export const CURRENCY_TERMS: Record<string, readonly (string | RegExp)[]> = {
    USD: [
        'us dollar', 'u.s. dollar', 'greenback', 'dollar index', 'dxy', 'usd', BARE_DOLLAR,
        'federal reserve', 'fomc', 'powell', 'nonfarm payroll', 'non-farm payroll', 'nfp',
    ],
    EUR: ['euro', 'eur', 'ecb', 'european central bank', 'eurozone', 'euro area', 'lagarde'],
    GBP: [
        'pound', 'sterling', 'gbp', 'cable',
        'bank of england', 'boe', 'monetary policy committee', 'bailey',
    ],
    JPY: ['yen', 'jpy', 'bank of japan', 'boj', 'ueda'],
    CHF: ['franc', 'chf', 'swiss national bank', 'snb', 'schlegel'],
    CAD: ['canadian dollar', 'loonie', 'cad', 'bank of canada', 'boc', 'macklem'],
    AUD: ['australian dollar', 'aussie', 'aud', 'reserve bank of australia', 'rba', 'bullock'],
    NZD: [
        'new zealand dollar', 'kiwi', 'nzd', 'reserve bank of new zealand', 'rbnz', 'hawkesby',
    ],
};

/** A currency rising. */
const BULLISH = [
    'rises', 'rise', 'rally', 'rallies', 'climbs', 'climb', 'gains', 'gain', 'jumps', 'jump',
    'strengthens', 'strengthen', 'firms', 'firm', 'advances', 'advance', 'surges', 'surge',
    'soars', 'rebounds', 'rebound', 'recovers', 'higher', 'stronger', 'bullish', 'hawkish',
    'boosted', 'lifts', 'lifted', 'outperforms', 'beats', 'upside',
];

/** A currency falling. */
const BEARISH = [
    'falls', 'fall', 'slips', 'slip', 'drops', 'drop', 'declines', 'decline', 'sinks', 'sink',
    'weakens', 'weaken', 'tumbles', 'tumble', 'slides', 'slide', 'plunges', 'retreats', 'retreat',
    'lower', 'weaker', 'bearish', 'dovish', 'pressured', 'weighs', 'weighed', 'hit', 'hurt',
    'underperforms', 'misses', 'downside', 'selloff', 'sell-off',
];

/** How far either side of a mention a direction word still counts. */
const WINDOW_BEFORE = 45;
const WINDOW_AFTER = 70;

function escape(term: string): string {
    return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary matcher for a term.
 *
 * `\b` alone fails on terms ending in a dot ("u.s. dollar") and on the leading
 * side of terms starting with a letter after punctuation, so the boundary is
 * asserted explicitly against the surrounding characters.
 */
function boundedRegex(term: string): RegExp {
    return new RegExp(`(?<![a-z0-9])${escape(term)}(?![a-z0-9])`, 'gi');
}

/** Every position in `text` where any of `terms` appears. */
function positionsOf(text: string, terms: readonly (string | RegExp)[]): number[] {
    const found: number[] = [];

    for (const term of terms) {
        // A RegExp entry carries its own boundaries and exclusions; a string is
        // wrapped in the standard ones.
        const pattern =
            typeof term === 'string' ? boundedRegex(term) : new RegExp(term.source, 'gi');

        for (const match of text.matchAll(pattern)) {
            if (match.index !== undefined) found.push(match.index);
        }
    }

    return found;
}

/**
 * Which way the text leans around a given position.
 *
 * Looks both ways because English puts the verb on either side: "Pound rises"
 * has it after, "weighs on Dollar" before. The NEAREST direction word wins,
 * which is what keeps two currencies in one sentence from collapsing onto the
 * same verdict.
 *
 * Honest limitation: "Euro steadies against Yen" is bullish euro and bearish
 * yen, and nothing here understands "against". Such a headline reads neutral
 * for both rather than wrong for one.
 */
function leanAround(text: string, at: number): Lean {
    const from = Math.max(0, at - WINDOW_BEFORE);
    const window = text.slice(from, at + WINDOW_AFTER);
    const relative = at - from;

    let best: { distance: number; lean: Lean } | null = null;

    const scan = (terms: readonly string[], lean: Lean) => {
        for (const term of terms) {
            for (const match of window.matchAll(boundedRegex(term))) {
                if (match.index === undefined) continue;

                const distance = Math.abs(match.index - relative);
                if (!best || distance < best.distance) best = { distance, lean };
            }
        }
    };

    scan(BULLISH, 'bullish');
    scan(BEARISH, 'bearish');

    return best === null ? 'neutral' : (best as { lean: Lean }).lean;
}

/**
 * Currencies a headline concerns, each with its own direction.
 *
 * Returns an empty array when nothing matches, and the caller must show that
 * as "no news" rather than falling back to a general feed. A trader shown
 * three irrelevant articles under a currency will trust the fourth.
 */
export function tagArticle(title: string, summary = ''): Tag[] {
    const text = `${title} ${summary}`.toLowerCase();
    const tags: Tag[] = [];

    for (const [currency, terms] of Object.entries(CURRENCY_TERMS)) {
        const positions = positionsOf(text, terms);
        if (positions.length === 0) continue;

        // The first mention is the one the headline is built around; later ones
        // are usually the counter-currency or a passing reference.
        const leans = positions.map((at) => leanAround(text, at));
        const decided = leans.find((lean) => lean !== 'neutral') ?? 'neutral';

        tags.push({ currency, lean: decided });
    }

    return tags;
}
