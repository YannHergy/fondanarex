import { describe, expect, it } from 'vitest';

import {
    MIN_PER_SIDE,
    alignmentVerdict,
    macroAlignment,
    type AlignmentTradeInput,
    type ScorePoint,
} from './macro-alignment';

const OPENED = new Date('2026-06-15T10:00:00.000Z');

/** EUR à 70, USD à 50 au 1er juin : le score dit d'acheter EUR/USD. */
const HISTORY: ScorePoint[] = [
    { currencyCode: 'EUR', computedAt: new Date('2026-06-01T00:00:00.000Z'), total: 70 },
    { currencyCode: 'USD', computedAt: new Date('2026-06-01T00:00:00.000Z'), total: 50 },
];

function trade(overrides: Partial<AlignmentTradeInput> = {}): AlignmentTradeInput {
    return {
        instrument: 'EUR/USD',
        direction: 'Buy',
        openedAt: OPENED,
        closedAt: new Date('2026-06-16T10:00:00.000Z'),
        pnl: 100,
        ...overrides,
    };
}

function many(n: number, overrides: Partial<AlignmentTradeInput> = {}) {
    return Array.from({ length: n }, () => trade(overrides));
}

describe('macroAlignment', () => {
    it('sorts trades by whether they followed the score', () => {
        const report = macroAlignment(
            [trade({ direction: 'Buy' }), trade({ direction: 'Sell', pnl: -50 })],
            HISTORY,
        );
        expect(report.aligned.trades).toBe(1);
        expect(report.against.trades).toBe(1);
        expect(report.aligned.netPnl).toBe(100);
        expect(report.against.netPnl).toBe(-50);
    });

    it('reads the score AS IT WAS, never a later one', () => {
        // Un relevé postérieur au trade inverserait le biais. L'utiliser
        // reviendrait à juger la décision avec une information que le trader
        // n'avait pas — et transformerait le modèle en oracle.
        const withFuture: ScorePoint[] = [
            ...HISTORY,
            { currencyCode: 'EUR', computedAt: new Date('2026-07-01T00:00:00.000Z'), total: 20 },
        ];
        const report = macroAlignment([trade({ direction: 'Buy' })], withFuture);
        expect(report.aligned.trades).toBe(1);
        expect(report.against.trades).toBe(0);
    });

    it('skips a trade with no clear macro gap', () => {
        const flat: ScorePoint[] = [
            { currencyCode: 'EUR', computedAt: new Date('2026-06-01T00:00:00.000Z'), total: 54 },
            { currencyCode: 'USD', computedAt: new Date('2026-06-01T00:00:00.000Z'), total: 52 },
        ];
        const report = macroAlignment([trade()], flat);
        expect(report.skipped).toBe(1);
        expect(report.aligned.trades + report.against.trades).toBe(0);
    });

    it('skips what it cannot judge: open trades, non-pairs, missing history', () => {
        const report = macroAlignment(
            [
                trade({ closedAt: null, pnl: null }),
                trade({ instrument: 'XAUUSD' }),
                trade({ openedAt: new Date('2020-01-01T00:00:00.000Z') }),
            ],
            HISTORY,
        );
        expect(report.skipped).toBe(3);
    });

    it('reads a Sell as aligned when the score favours the quote', () => {
        const usdStrong: ScorePoint[] = [
            { currencyCode: 'EUR', computedAt: new Date('2026-06-01T00:00:00.000Z'), total: 40 },
            { currencyCode: 'USD', computedAt: new Date('2026-06-01T00:00:00.000Z'), total: 75 },
        ];
        const report = macroAlignment([trade({ direction: 'Sell' })], usdStrong);
        expect(report.aligned.trades).toBe(1);
    });
});

describe('alignmentVerdict', () => {
    it('refuses to conclude until BOTH sides have enough trades', () => {
        // Douze alignés contre deux : ce n'est pas une comparaison.
        const lopsided = macroAlignment(
            [...many(12), ...many(2, { direction: 'Sell', pnl: -80 })],
            HISTORY,
        );
        expect(lopsided.reliable).toBe(false);
        expect(alignmentVerdict(lopsided)).toBe('indecidable');
    });

    it('says the score helps when following it pays more', () => {
        const report = macroAlignment(
            [
                ...many(MIN_PER_SIDE, { pnl: 100 }),
                ...many(MIN_PER_SIDE, { direction: 'Sell', pnl: -80 }),
            ],
            HISTORY,
        );
        expect(alignmentVerdict(report)).toBe('aide');
    });

    it('says it harms when going against it pays more', () => {
        const report = macroAlignment(
            [
                ...many(MIN_PER_SIDE, { pnl: -80 }),
                ...many(MIN_PER_SIDE, { direction: 'Sell', pnl: 100 }),
            ],
            HISTORY,
        );
        expect(alignmentVerdict(report)).toBe('nuit');
    });

    it('says neutral when the two sides barely differ', () => {
        const report = macroAlignment(
            [
                ...many(MIN_PER_SIDE, { pnl: 100 }),
                ...many(MIN_PER_SIDE, { direction: 'Sell', pnl: 98 }),
            ],
            HISTORY,
        );
        expect(alignmentVerdict(report)).toBe('neutre');
    });
});
