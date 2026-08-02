import { describe, expect, it } from 'vitest';

import {
    cellTone,
    gaugeShare,
    indicatorPct,
    indicatorWinner,
    normaliseRadarValue,
    pointsToSvg,
    radarPoints,
    radarRing,
    relativeStrengthMatrix,
    type ComparedIndicator,
    type RadarAxisValue,
} from './comparison';

function axis(key: string, value: number): RadarAxisValue {
    return { key, label: key, value };
}

function indicator(overrides: Partial<ComparedIndicator> = {}): ComparedIndicator {
    return { label: 'CPI', base: 2, quote: 3, max: 10, ...overrides };
}

describe('normaliseRadarValue', () => {
    it('maps the family scale onto 0..100', () => {
        expect(normaliseRadarValue(-10)).toBe(0);
        expect(normaliseRadarValue(0)).toBe(50);
        expect(normaliseRadarValue(10)).toBe(100);
    });

    it('puts a neutral currency halfway out, not at the centre', () => {
        // Collapsed at the centre, two average currencies would both look like
        // nothing and be impossible to compare.
        expect(normaliseRadarValue(0)).toBeGreaterThan(0);
    });

    it('clamps beyond the scale', () => {
        expect(normaliseRadarValue(-50)).toBe(0);
        expect(normaliseRadarValue(50)).toBe(100);
    });
});

describe('radarPoints', () => {
    const axes = [axis('a', 0), axis('b', 0), axis('c', 0), axis('d', 0)];

    it('returns one vertex per axis', () => {
        expect(radarPoints(axes, 100, 70)).toHaveLength(4);
    });

    it('starts straight up so the shape reads the same every time', () => {
        const [first] = radarPoints([axis('a', 10)], 100, 70);
        expect(first!.x).toBeCloseTo(100, 6);
        expect(first!.y).toBeCloseTo(30, 6);
    });

    it('spaces axes evenly around the circle', () => {
        const points = radarPoints(axes.map((a) => ({ ...a, value: 10 })), 100, 70);
        // Four axes at full radius: up, right, down, left.
        expect(points[1]!.x).toBeCloseTo(170, 6);
        expect(points[2]!.y).toBeCloseTo(170, 6);
        expect(points[3]!.x).toBeCloseTo(30, 6);
    });

    it('places a maximal score on the outer ring and a minimal one at the centre', () => {
        const [outer] = radarPoints([axis('a', 10)], 100, 70);
        const [inner] = radarPoints([axis('a', -10)], 100, 70);
        expect(outer!.y).toBeCloseTo(30, 6);
        expect(inner!.x).toBeCloseTo(100, 6);
        expect(inner!.y).toBeCloseTo(100, 6);
    });

    it('is empty with no axes rather than throwing', () => {
        expect(radarPoints([], 100, 70)).toEqual([]);
    });
});

describe('radarRing', () => {
    it('draws a closed ring at the requested fraction', () => {
        const ring = radarRing(4, 100, 70, 0.5);
        expect(ring).toHaveLength(4);
        expect(ring[0]!.y).toBeCloseTo(65, 6);
    });
});

describe('pointsToSvg', () => {
    it('formats vertices for a polygon', () => {
        expect(pointsToSvg([{ x: 1.234, y: 5.678 }])).toBe('1.23,5.68');
    });
});

describe('indicatorPct', () => {
    it('is the magnitude against the scale', () => {
        expect(indicatorPct(5, 10)).toBe(50);
        expect(indicatorPct(-5, 10)).toBe(50);
    });

    it('clamps at the scale', () => {
        expect(indicatorPct(50, 10)).toBe(100);
    });

    it('is zero for a zero or negative scale rather than dividing by it', () => {
        expect(indicatorPct(5, 0)).toBe(0);
    });
});

describe('indicatorWinner', () => {
    it('gives it to the higher reading by default', () => {
        expect(indicatorWinner(indicator({ base: 5, quote: 3 }))).toBe('base');
        expect(indicatorWinner(indicator({ base: 3, quote: 5 }))).toBe('quote');
    });

    it('gives it to the LOWER reading when lower is better', () => {
        // The legacy comparator carried this flag on its rows but its winner
        // helper only compared magnitudes, so lower inflation lost.
        expect(indicatorWinner(indicator({ base: 2, quote: 5, lowerIsBetter: true }))).toBe('base');
        expect(indicatorWinner(indicator({ base: 5, quote: 2, lowerIsBetter: true }))).toBe('quote');
    });

    it('is a tie on equal readings', () => {
        expect(indicatorWinner(indicator({ base: 3, quote: 3 }))).toBe('tie');
        expect(indicatorWinner(indicator({ base: 3, quote: 3, lowerIsBetter: true }))).toBe('tie');
    });
});

describe('gaugeShare', () => {
    it('splits in proportion to the two readings', () => {
        const share = gaugeShare(indicator({ base: 3, quote: 1, max: 10 }));
        expect(share.base).toBeCloseTo(0.75, 6);
        expect(share.quote).toBeCloseTo(0.25, 6);
    });

    it('always sums to one', () => {
        for (const [base, quote] of [
            [1, 9],
            [7, 2],
            [4, 4],
        ]) {
            const share = gaugeShare(indicator({ base, quote, max: 10 }));
            expect(share.base + share.quote).toBeCloseTo(1, 9);
        }
    });

    it('splits evenly when both are zero rather than dividing by zero', () => {
        expect(gaugeShare(indicator({ base: 0, quote: 0 }))).toEqual({ base: 0.5, quote: 0.5 });
    });

    it('uses magnitude, so a negative reading still occupies its share', () => {
        const share = gaugeShare(indicator({ base: -3, quote: 1, max: 10 }));
        expect(share.base).toBeCloseTo(0.75, 6);
    });
});

describe('relativeStrengthMatrix', () => {
    const scores = { USD: 70, EUR: 55, JPY: 40 };
    const codes = ['USD', 'EUR', 'JPY'];

    it('produces a full square', () => {
        const rows = relativeStrengthMatrix(scores, codes);
        expect(rows).toHaveLength(3);
        expect(rows[0]!.cells).toHaveLength(3);
    });

    it('puts zero on the diagonal', () => {
        const rows = relativeStrengthMatrix(scores, codes);
        for (const row of rows) {
            expect(row.cells.find((cell) => cell.quote === row.code)?.diff).toBe(0);
        }
    });

    it('computes the pairwise difference', () => {
        const rows = relativeStrengthMatrix(scores, codes);
        const usd = rows.find((row) => row.code === 'USD')!;
        expect(usd.cells.find((cell) => cell.quote === 'JPY')?.diff).toBe(30);
    });

    it('is antisymmetric', () => {
        const rows = relativeStrengthMatrix(scores, codes);
        const usdEur = rows.find((r) => r.code === 'USD')!.cells.find((c) => c.quote === 'EUR')!;
        const eurUsd = rows.find((r) => r.code === 'EUR')!.cells.find((c) => c.quote === 'USD')!;
        expect(usdEur.diff).toBe(-eurUsd.diff);
    });

    it('orders by breadth of advantage, strongest first', () => {
        const rows = relativeStrengthMatrix(scores, codes);
        expect(rows.map((row) => row.code)).toEqual(['USD', 'EUR', 'JPY']);
        expect(rows[0]!.total).toBeGreaterThan(rows[2]!.total);
    });

    it('treats a missing score as neutral rather than zero', () => {
        // Scoring an absent currency 0 would read as maximally weak instead of
        // simply unknown.
        const rows = relativeStrengthMatrix({ USD: 50 }, ['USD', 'XXX']);
        expect(rows.find((row) => row.code === 'USD')!.total).toBe(0);
    });

    it('sums to zero across the whole matrix', () => {
        const rows = relativeStrengthMatrix(scores, codes);
        const total = rows.reduce((sum, row) => sum + row.total, 0);
        expect(total).toBeCloseTo(0, 6);
    });
});

describe('cellTone', () => {
    it('bands the difference', () => {
        expect(cellTone(40)).toBe('strong-positive');
        expect(cellTone(15)).toBe('positive');
        expect(cellTone(0)).toBe('neutral');
        expect(cellTone(-15)).toBe('negative');
        expect(cellTone(-40)).toBe('strong-negative');
    });

    it('is symmetric around zero', () => {
        expect(cellTone(9)).toBe('neutral');
        expect(cellTone(-9)).toBe('neutral');
    });
});
