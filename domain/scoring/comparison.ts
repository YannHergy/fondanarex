// ================================================================
// PAIR COMPARISON GEOMETRY AND RANKING
//
// The maths behind the comparator's alternative visualisations:
// radar polygon points, gauge shares, and the relative-strength
// matrix.
//
// Pure — no I/O.
// ================================================================

export interface RadarAxisValue {
    key: string;
    label: string;
    /** Family score on the -10..+10 scale. */
    value: number;
}

export interface Point {
    x: number;
    y: number;
}

/**
 * Maps a family score onto the 0..100 radar scale.
 *
 * -10 becomes 0, 0 becomes the midpoint, +10 becomes 100. A neutral currency
 * therefore draws a polygon halfway out rather than collapsed at the centre,
 * which is what makes two average currencies visually comparable instead of
 * both looking like nothing.
 */
export function normaliseRadarValue(value: number): number {
    return Math.max(0, Math.min(100, 50 + value * 5));
}

/**
 * Vertices of the radar polygon for a set of axis values.
 *
 * The first axis points straight up (-90 degrees) so the shape reads the same
 * way every time, and axes are spaced evenly around the circle.
 */
export function radarPoints(
    axes: readonly RadarAxisValue[],
    centre: number,
    radius: number,
): Point[] {
    if (axes.length === 0) return [];

    return axes.map((axis, index) => {
        const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
        const r = (normaliseRadarValue(axis.value) / 100) * radius;

        return {
            x: centre + r * Math.cos(angle),
            y: centre + r * Math.sin(angle),
        };
    });
}

/** The web ring at a given fraction of the full radius. */
export function radarRing(axisCount: number, centre: number, radius: number, fraction: number): Point[] {
    return Array.from({ length: axisCount }, (_, index) => {
        const angle = (Math.PI * 2 * index) / axisCount - Math.PI / 2;
        return {
            x: centre + radius * fraction * Math.cos(angle),
            y: centre + radius * fraction * Math.sin(angle),
        };
    });
}

export function pointsToSvg(points: readonly Point[]): string {
    return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
}

export interface ComparedIndicator {
    label: string;
    base: number;
    quote: number;
    /** Scale the bars are drawn against. */
    max: number;
    unit?: string;
    /** True when a LOWER reading is the better one — inflation, unemployment. */
    lowerIsBetter?: boolean;
}

/** Share of the drawn length, 0..100, from a value's magnitude against the scale. */
export function indicatorPct(value: number, max: number): number {
    if (max <= 0) return 0;
    return Math.min(100, Math.max(0, (Math.abs(value) / max) * 100));
}

export type Winner = 'base' | 'quote' | 'tie';

/**
 * Which side of the pair wins an indicator.
 *
 * Honours `lowerIsBetter`, so a lower inflation print wins rather than losing.
 * The legacy comparator carried the same flag on its rows but its winner
 * helper only ever compared raw magnitudes.
 */
export function indicatorWinner(indicator: ComparedIndicator): Winner {
    if (indicator.base === indicator.quote) return 'tie';

    const baseWins = indicator.lowerIsBetter
        ? indicator.base < indicator.quote
        : indicator.base > indicator.quote;

    return baseWins ? 'base' : 'quote';
}

/**
 * How a semicircular gauge splits between the two currencies.
 *
 * Both shares are magnitudes, so the gauge leans toward whichever side carries
 * the larger reading. With both at zero it splits evenly rather than dividing
 * by zero.
 */
export function gaugeShare(indicator: ComparedIndicator): { base: number; quote: number } {
    const basePct = indicatorPct(indicator.base, indicator.max);
    const quotePct = indicatorPct(indicator.quote, indicator.max);
    const total = basePct + quotePct;

    if (total === 0) return { base: 0.5, quote: 0.5 };

    const base = basePct / total;
    return { base, quote: 1 - base };
}

export interface MatrixCell {
    base: string;
    quote: string;
    /** base score minus quote score. */
    diff: number;
}

export interface MatrixRow {
    code: string;
    /** Sum of this currency's edge over every other. */
    total: number;
    cells: MatrixCell[];
}

/**
 * Every currency against every other, strongest first.
 *
 * The row total is the sum of a currency's edge over all the others, which is
 * what orders the matrix: the top row is the currency with the broadest
 * advantage rather than merely the highest single score.
 */
export function relativeStrengthMatrix(
    scores: Readonly<Record<string, number>>,
    codes: readonly string[],
): MatrixRow[] {
    const scoreOf = (code: string) => scores[code] ?? 50;

    return codes
        .map((base) => {
            const cells = codes.map((quote) => ({
                base,
                quote,
                // A currency against itself is 0, not its own score — the
                // diagonal is a reference point, not a comparison.
                diff: base === quote ? 0 : Math.round((scoreOf(base) - scoreOf(quote)) * 10) / 10,
            }));

            return {
                code: base,
                total: Math.round(cells.reduce((sum, cell) => sum + cell.diff, 0) * 10) / 10,
                cells,
            };
        })
        .sort((a, b) => b.total - a.total);
}

export type CellTone = 'strong-positive' | 'positive' | 'neutral' | 'negative' | 'strong-negative';

/** Colour band for a matrix cell. */
export function cellTone(diff: number): CellTone {
    if (diff >= 25) return 'strong-positive';
    if (diff >= 10) return 'positive';
    if (diff > -10) return 'neutral';
    if (diff > -25) return 'negative';
    return 'strong-negative';
}
