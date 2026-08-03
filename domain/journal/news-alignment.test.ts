import { describe, expect, it } from 'vitest';

import {
    alignTrades,
    impactScore,
    MIN_SAMPLE,
    pairNewsScore,
    summariseAlignment,
    type AlignmentTrade,
    type DayEvent,
} from './news-alignment';

function trade(overrides: Partial<AlignmentTrade> = {}): AlignmentTrade {
    return {
        id: 't1',
        instrument: 'EUR/USD',
        direction: 'Buy',
        date: '2026-08-05',
        pnl: 100,
        ...overrides,
    };
}

function event(currencyCode: string, impact: DayEvent['impact'], date = '2026-08-05'): DayEvent {
    return { date, currencyCode, impact };
}

describe('impactScore', () => {
    it('grades impact symmetrically', () => {
        expect(impactScore('BULLISH_STRONG')).toBe(2);
        expect(impactScore('BEARISH_STRONG')).toBe(-2);
        expect(impactScore('NEUTRAL')).toBe(0);
        expect(impactScore(null)).toBe(0);
    });
});

describe('pairNewsScore', () => {
    it('counts base-currency news positively', () => {
        expect(pairNewsScore('EUR/USD', [event('EUR', 'BULLISH')])).toBe(1);
    });

    it('counts quote-currency news NEGATIVELY', () => {
        // This is the correction. Summing both sides without a sign made a
        // strong EUR print and a strong USD print indistinguishable on
        // EUR/USD, when they push the price in opposite directions.
        expect(pairNewsScore('EUR/USD', [event('USD', 'BULLISH')])).toBe(-1);
    });

    it('nets opposing news on the two legs', () => {
        expect(
            pairNewsScore('EUR/USD', [event('EUR', 'BULLISH'), event('USD', 'BULLISH')]),
        ).toBe(0);
    });

    it('accumulates same-side news', () => {
        expect(
            pairNewsScore('EUR/USD', [event('EUR', 'BULLISH'), event('EUR', 'BULLISH_STRONG')]),
        ).toBe(3);
    });

    it('ignores currencies not in the pair', () => {
        expect(pairNewsScore('EUR/USD', [event('JPY', 'BULLISH_STRONG')])).toBe(0);
    });

    it('is case-insensitive on both sides', () => {
        expect(pairNewsScore('eur/usd', [event('eur', 'BULLISH')])).toBe(1);
    });

    it('returns zero for a malformed instrument rather than throwing', () => {
        expect(pairNewsScore('EURUSD', [event('EUR', 'BULLISH')])).toBe(0);
    });
});

describe('alignTrades', () => {
    it('marks a long on bullish pair news as trading WITH the news', () => {
        const [result] = alignTrades([trade({ direction: 'Buy' })], [event('EUR', 'BULLISH')]);
        expect(result!.tradedWithNews).toBe(true);
    });

    it('marks a short on bullish pair news as trading against it', () => {
        const [result] = alignTrades([trade({ direction: 'Sell' })], [event('EUR', 'BULLISH')]);
        expect(result!.tradedWithNews).toBe(false);
    });

    it('counts a winning SHORT on bearish news as aligned', () => {
        // The legacy formula compared the P&L sign to the news sign and ignored
        // direction, so this case was recorded as unaligned.
        const [result] = alignTrades(
            [trade({ direction: 'Sell', pnl: 250 })],
            [event('EUR', 'BEARISH')],
        );
        expect(result!.tradedWithNews).toBe(true);
        expect(result!.won).toBe(true);
    });

    it('excludes trades on days with no graded news', () => {
        // They say nothing about whether following the news helps, and would
        // drag every rate toward 50 %.
        expect(alignTrades([trade()], [])).toEqual([]);
        expect(alignTrades([trade()], [event('EUR', 'NEUTRAL')])).toEqual([]);
    });

    it('excludes days where the two legs cancel out', () => {
        expect(
            alignTrades([trade()], [event('EUR', 'BULLISH'), event('USD', 'BULLISH')]),
        ).toEqual([]);
    });

    it('excludes trades that are still open', () => {
        expect(alignTrades([trade({ pnl: null })], [event('EUR', 'BULLISH')])).toEqual([]);
    });

    it('matches news to the trade date only', () => {
        const other = event('EUR', 'BULLISH', '2026-08-06');
        expect(alignTrades([trade({ date: '2026-08-05' })], [other])).toEqual([]);
    });
});

describe('summariseAlignment', () => {
    function sample(withNewsWins: number, withNewsTotal: number, againstWins: number, againstTotal: number) {
        const events = [event('EUR', 'BULLISH')];
        const trades: AlignmentTrade[] = [];

        for (let i = 0; i < withNewsTotal; i += 1) {
            trades.push(trade({ id: `w${i}`, direction: 'Buy', pnl: i < withNewsWins ? 100 : -50 }));
        }
        for (let i = 0; i < againstTotal; i += 1) {
            trades.push(trade({ id: `a${i}`, direction: 'Sell', pnl: i < againstWins ? 100 : -50 }));
        }

        return summariseAlignment(alignTrades(trades, events));
    }

    it('reports the two win rates separately', () => {
        // One "alignment percentage" conflates how often you followed the news
        // with whether doing so worked, and only the second is actionable.
        const result = sample(8, 10, 2, 10);
        expect(result.withNewsWinRate).toBe(80);
        expect(result.againstNewsWinRate).toBe(20);
        expect(result.edge).toBe(60);
    });

    it('counts each side', () => {
        const result = sample(5, 10, 3, 6);
        expect(result.withNews).toBe(10);
        expect(result.againstNews).toBe(6);
        expect(result.total).toBe(16);
    });

    it('withholds a win rate below the minimum sample', () => {
        // Three trades producing "100 %" is not a finding.
        const result = sample(3, 3, 6, 6);
        expect(result.withNewsWinRate).toBeNull();
        expect(result.againstNewsWinRate).toBe(100);
        expect(result.edge).toBeNull();
    });

    it('needs the minimum on both sides for an edge', () => {
        const result = sample(MIN_SAMPLE, MIN_SAMPLE, MIN_SAMPLE, MIN_SAMPLE);
        expect(result.edge).not.toBeNull();
    });

    it('sums P&L per side', () => {
        const result = sample(2, 2, 0, 0);
        expect(result.withNewsPnl).toBe(200);
        expect(result.againstNewsPnl).toBe(0);
    });

    it('is all zeroes for no aligned trades', () => {
        const result = summariseAlignment([]);
        expect(result).toMatchObject({ total: 0, withNews: 0, againstNews: 0, edge: null });
    });
});
