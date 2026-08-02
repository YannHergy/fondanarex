import { describe, expect, it } from 'vitest';

import {
    buildSetupNote,
    CAPTURE_TIMEFRAMES,
    capturedLabels,
    primaryCapture,
    scoreVerdict,
    TIMEFRAMES,
    timeframeLabel,
    toTradingViewSymbol,
} from './timeframes';

function capture(timeframe: string, isEntry = false) {
    return { timeframe, isEntry };
}

describe('toTradingViewSymbol', () => {
    it('builds the spot-forex symbol', () => {
        expect(toTradingViewSymbol('EUR/USD')).toBe('FX:EURUSD');
        expect(toTradingViewSymbol('GBP/NOK')).toBe('FX:GBPNOK');
    });

    it('normalises case and surrounding space', () => {
        expect(toTradingViewSymbol('  eur/usd ')).toBe('FX:EURUSD');
    });

    it('returns null for anything that is not a pair', () => {
        // A bad value must render an empty frame, not TradingView's own error
        // page inside our layout.
        expect(toTradingViewSymbol('EURUSD')).toBeNull();
        expect(toTradingViewSymbol('EUR/US')).toBeNull();
        expect(toTradingViewSymbol('')).toBeNull();
        expect(toTradingViewSymbol('EUR/USD/JPY')).toBeNull();
    });

    it('rejects an attempt to inject another symbol', () => {
        expect(toTradingViewSymbol('EUR/USD","symbol":"X')).toBeNull();
    });
});

describe('timeframe tables', () => {
    it('offers the standard intervals on the chart', () => {
        expect(TIMEFRAMES.map((tf) => tf.label)).toEqual([
            'M1',
            'M5',
            'M15',
            'H1',
            'H4',
            'D',
            'W',
            'M',
        ]);
    });

    it('orders the capture set top-down, the way the analysis is done', () => {
        expect(CAPTURE_TIMEFRAMES.map((tf) => tf.label)).toEqual([
            'Monthly',
            'Weekly',
            'Daily',
            'H4',
            'H1',
            'M15',
            'M1',
        ]);
    });

    it('labels a known interval and falls back to the raw code', () => {
        expect(timeframeLabel('240')).toBe('H4');
        expect(timeframeLabel('99')).toBe('99');
    });
});

describe('primaryCapture', () => {
    it('prefers the capture marked as the entry', () => {
        const captures = [capture('M'), capture('15', true), capture('D')];
        expect(primaryCapture(captures)?.timeframe).toBe('15');
    });

    it('falls back to H1 rather than to whatever was uploaded first', () => {
        // Uploading top-down means the first capture is usually the monthly
        // context shot, which is the worst choice to represent an entry.
        const captures = [capture('M'), capture('W'), capture('60')];
        expect(primaryCapture(captures)?.timeframe).toBe('60');
    });

    it('walks the fallback order when H1 is absent', () => {
        expect(primaryCapture([capture('M'), capture('D')])?.timeframe).toBe('D');
        expect(primaryCapture([capture('M'), capture('W')])?.timeframe).toBe('W');
    });

    it('takes anything left rather than returning nothing', () => {
        expect(primaryCapture([capture('unknown')])?.timeframe).toBe('unknown');
    });

    it('is null with no captures', () => {
        expect(primaryCapture([])).toBeNull();
    });

    it('honours the marked entry even when it is the shortest timeframe', () => {
        const captures = [capture('60'), capture('1', true)];
        expect(primaryCapture(captures)?.timeframe).toBe('1');
    });
});

describe('capturedLabels', () => {
    it('lists present timeframes top-down regardless of upload order', () => {
        const captures = [capture('60'), capture('M'), capture('D')];
        expect(capturedLabels(captures)).toEqual(['Monthly', 'Daily', 'H1']);
    });

    it('is empty for no captures', () => {
        expect(capturedLabels([])).toEqual([]);
    });

    it('ignores an unrecognised timeframe', () => {
        expect(capturedLabels([capture('nonsense')])).toEqual([]);
    });
});

describe('buildSetupNote', () => {
    const scores = { base: 'EUR', quote: 'USD', baseScore: 62, quoteScore: 48 };

    it('records the entry timeframe and what was captured', () => {
        const note = buildSetupNote({
            ...scores,
            captures: [capture('D'), capture('60', true)],
        });
        expect(note).toContain('Entrée sur H1');
        expect(note).toContain('Daily, H1');
        expect(note).toContain('EUR 62 contre USD 48');
    });

    it('omits the entry sentence when none was marked', () => {
        const note = buildSetupNote({ ...scores, captures: [capture('D')] });
        expect(note).not.toContain('Entrée sur');
        expect(note).toContain('Daily');
    });

    it('says so when there is nothing captured', () => {
        expect(buildSetupNote({ ...scores, captures: [] })).toContain('aucune capture');
    });
});

describe('scoreVerdict', () => {
    it('bands the score', () => {
        expect(scoreVerdict(90)).toBe('Strong Buy');
        expect(scoreVerdict(70)).toBe('Buy');
        expect(scoreVerdict(50)).toBe('Neutral');
        expect(scoreVerdict(30)).toBe('Sell');
        expect(scoreVerdict(10)).toBe('Strong Sell');
    });

    it('is monotonic across the range', () => {
        const order = ['Strong Sell', 'Sell', 'Neutral', 'Buy', 'Strong Buy'];
        let rank = -1;
        for (let score = 0; score <= 100; score += 1) {
            const next = order.indexOf(scoreVerdict(score));
            expect(next).toBeGreaterThanOrEqual(rank);
            rank = next;
        }
    });
});
