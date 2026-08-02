// ================================================================
// CHART TIMEFRAMES AND SYMBOLS
//
// TradingView interval codes, the multi-timeframe capture set, and
// the rules for choosing which capture represents a setup.
//
// Pure — no I/O.
// ================================================================

export interface Timeframe {
    /** TradingView interval code. */
    value: string;
    label: string;
}

/** Intervals offered on the embedded chart, shortest first. */
export const TIMEFRAMES: readonly Timeframe[] = [
    { value: '1', label: 'M1' },
    { value: '5', label: 'M5' },
    { value: '15', label: 'M15' },
    { value: '60', label: 'H1' },
    { value: '240', label: 'H4' },
    { value: 'D', label: 'D' },
    { value: 'W', label: 'W' },
    { value: 'M', label: 'M' },
];

export interface CaptureTimeframe extends Timeframe {
    /** What this timeframe is for — shown on the empty drop zone. */
    purpose: string;
}

/**
 * The multi-timeframe capture set, TOP-DOWN.
 *
 * Ordered monthly to M1 on purpose: it is the order the analysis is meant to
 * be done in, and the panel reads as the checklist it replaces.
 */
export const CAPTURE_TIMEFRAMES: readonly CaptureTimeframe[] = [
    { value: 'M', label: 'Monthly', purpose: 'Tendance macro, direction long terme' },
    { value: 'W', label: 'Weekly', purpose: 'Structure intermédiaire, offre et demande' },
    { value: 'D', label: 'Daily', purpose: 'Setup principal, order blocks, BOS' },
    { value: '240', label: 'H4', purpose: 'Confirmation, retracement, rebond EMA' },
    { value: '60', label: 'H1', purpose: 'Entrée, order block, EMA 50/200' },
    { value: '15', label: 'M15', purpose: "Précision d'entrée, confirmation" },
    { value: '1', label: 'M1', purpose: "Timing d'exécution (optionnel)" },
];

const CAPTURE_LABELS = new Map(CAPTURE_TIMEFRAMES.map((tf) => [tf.value, tf.label]));

export function timeframeLabel(value: string): string {
    return CAPTURE_LABELS.get(value) ?? value;
}

/**
 * TradingView symbol for a pair.
 *
 * The FX: prefix is the spot-forex feed. Returns null for anything that is not
 * a recognisable pair, so a bad value renders an empty chart frame rather than
 * TradingView's own error inside our layout.
 */
export function toTradingViewSymbol(pair: string): string | null {
    const match = /^([A-Z]{3})\/([A-Z]{3})$/.exec(pair.trim().toUpperCase());
    if (!match) return null;
    return `FX:${match[1]}${match[2]}`;
}

/** Fallback order when no capture was marked as the entry. */
const FALLBACK_ORDER = ['60', 'D', 'W', 'M', '240', '15', '1'];

export interface Capture {
    timeframe: string;
    isEntry: boolean;
}

/**
 * The capture that represents the setup.
 *
 * The marked entry wins. Failing that, the fallback order runs H1 first — the
 * timeframe an entry is normally taken on — rather than simply taking whatever
 * was uploaded first, which would often be the monthly context shot.
 */
export function primaryCapture<T extends Capture>(captures: readonly T[]): T | null {
    const marked = captures.find((capture) => capture.isEntry);
    if (marked) return marked;

    for (const timeframe of FALLBACK_ORDER) {
        const match = captures.find((capture) => capture.timeframe === timeframe);
        if (match) return match;
    }

    return captures[0] ?? null;
}

/** Capture timeframes present, in top-down order, as labels. */
export function capturedLabels(captures: readonly Capture[]): string[] {
    const present = new Set(captures.map((capture) => capture.timeframe));
    return CAPTURE_TIMEFRAMES.filter((tf) => present.has(tf.value)).map((tf) => tf.label);
}

/**
 * The note written onto a setup created from a multi-timeframe analysis.
 *
 * Records which timeframes were actually captured and where the entry was
 * taken, so the setup still says what it was built from once the panel is gone.
 */
export function buildSetupNote(input: {
    captures: readonly Capture[];
    base: string;
    quote: string;
    baseScore: number;
    quoteScore: number;
}): string {
    const entry = input.captures.find((capture) => capture.isEntry);
    const labels = capturedLabels(input.captures);

    return [
        entry ? `Entrée sur ${timeframeLabel(entry.timeframe)}.` : null,
        `Analyse multi-TF — ${labels.length > 0 ? labels.join(', ') : 'aucune capture'}.`,
        `${input.base} ${input.baseScore} contre ${input.quote} ${input.quoteScore}.`,
    ]
        .filter(Boolean)
        .join(' ');
}

export type Verdict = 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';

/** Score band label, matching the one used across the analysis screens. */
export function scoreVerdict(score: number): Verdict {
    if (score >= 80) return 'Strong Buy';
    if (score >= 65) return 'Buy';
    if (score >= 45) return 'Neutral';
    if (score >= 25) return 'Sell';
    return 'Strong Sell';
}
