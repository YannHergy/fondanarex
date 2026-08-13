import { describe, expect, it } from 'vitest';

import {
    MIN_TRADES_FOR_RATE,
    UNLABELLED,
    overallStat,
    setupStats,
    setupsUsedInJournal,
    type SetupTrade,
} from './setup-stats';

function trade(overrides: Partial<SetupTrade> = {}): SetupTrade {
    return {
        strategy: 'M2',
        closedAt: new Date('2026-08-01T12:00:00.000Z'),
        pnl: 100,
        ...overrides,
    };
}

/** n trades gagnants et m perdants sur le même setup. */
function sample(setup: string, wins: number, losses: number): SetupTrade[] {
    return [
        ...Array.from({ length: wins }, () => trade({ strategy: setup, pnl: 100 })),
        ...Array.from({ length: losses }, () => trade({ strategy: setup, pnl: -50 })),
    ];
}

describe('setupStats', () => {
    it('measures the win rate once the sample is big enough', () => {
        const [stat] = setupStats(sample('M2', 7, 3));
        expect(stat!.closed).toBe(10);
        expect(stat!.wins).toBe(7);
        expect(stat!.losses).toBe(3);
        expect(stat!.winRatePct).toBe(70);
        expect(stat!.reliable).toBe(true);
    });

    it('refuses a rate on a tiny sample rather than printing a flattering one', () => {
        // Trois gagnants d'affilée : 100 % est vrai et parfaitement trompeur.
        const [stat] = setupStats(sample('M2', 3, 0));
        expect(stat!.closed).toBe(3);
        expect(stat!.wins).toBe(3);
        expect(stat!.winRatePct).toBeNull();
        expect(stat!.reliable).toBe(false);
        // Le P&L, lui, reste vrai quel que soit l'échantillon.
        expect(stat!.netPnl).toBe(300);
    });

    it('counts a breakeven in the denominator but not as a win', () => {
        const trades = [
            ...sample('M2', 5, 0),
            ...Array.from({ length: 5 }, () => trade({ pnl: 0 })),
        ];
        const [stat] = setupStats(trades);
        expect(stat!.closed).toBe(10);
        expect(stat!.breakeven).toBe(5);
        // 5 gagnants sur 10, pas 5 sur 5.
        expect(stat!.winRatePct).toBe(50);
    });

    it('ignores open trades — they have no result yet', () => {
        const trades = [...sample('M2', 10, 0), trade({ closedAt: null, pnl: null })];
        const [stat] = setupStats(trades);
        expect(stat!.closed).toBe(10);
    });

    it('groups unlabelled trades rather than dropping them', () => {
        const stats = setupStats([trade({ strategy: null }), trade({ strategy: '  ' })]);
        expect(stats).toHaveLength(1);
        expect(stats[0]!.setup).toBe(UNLABELLED);
        expect(stats[0]!.closed).toBe(2);
    });

    it('sorts by net P&L, most profitable first', () => {
        const stats = setupStats([
            ...sample('perdant', 0, 3),
            ...sample('gagnant', 3, 0),
        ]);
        expect(stats.map((s) => s.setup)).toEqual(['gagnant', 'perdant']);
    });

    it('needs exactly MIN_TRADES_FOR_RATE closed trades to report a rate', () => {
        expect(setupStats(sample('M2', MIN_TRADES_FOR_RATE - 1, 0))[0]!.winRatePct).toBeNull();
        expect(setupStats(sample('M2', MIN_TRADES_FOR_RATE, 0))[0]!.winRatePct).toBe(100);
    });
});

describe('overallStat', () => {
    it('aggregates every setup into one figure', () => {
        const stat = overallStat([...sample('M2', 6, 2), ...sample('A2', 2, 2)]);
        expect(stat.closed).toBe(12);
        expect(stat.wins).toBe(8);
        expect(stat.winRatePct).toBeCloseTo(66.7, 1);
    });
});

describe('setupsUsedInJournal', () => {
    it('lists the distinct labels already in use, sorted', () => {
        const names = setupsUsedInJournal([
            trade({ strategy: 'M2' }),
            trade({ strategy: 'A2' }),
            trade({ strategy: 'M2' }),
            trade({ strategy: null }),
            trade({ strategy: '   ' }),
        ]);
        expect(names).toEqual(['A2', 'M2']);
    });
});
