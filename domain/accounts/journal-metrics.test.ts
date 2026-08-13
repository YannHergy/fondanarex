import { describe, expect, it } from 'vitest';

import { setupStats, type SetupTrade } from '../journal/setup-stats';
import { alertVerdict, journalExpectancyPct, journalMetrics } from './journal-metrics';

function closed(strategy: string, pnl: number): SetupTrade {
    return { strategy, closedAt: new Date('2026-08-01T12:00:00.000Z'), pnl };
}

/** n gagnants à +win et m perdants à -loss sur un setup. */
function series(setup: string, wins: number, win: number, losses: number, loss: number) {
    return [
        ...Array.from({ length: wins }, () => closed(setup, win)),
        ...Array.from({ length: losses }, () => closed(setup, -loss)),
    ];
}

describe('journalMetrics', () => {
    it('pools the allowed setups instead of averaging their averages', () => {
        // « rare » a un RR flatteur mais deux trades ; « courant » en a
        // cinquante. Moyenner les moyennes donnerait le même poids aux deux.
        const stats = setupStats([
            ...series('rare', 2, 1000, 0, 0),
            ...series('courant', 20, 100, 30, 100),
        ]);

        const m = journalMetrics(['rare', 'courant'], stats);
        expect(m.closed).toBe(52);
        // 22 gagnants sur 52.
        expect(m.winRatePct).toBeCloseTo(42.3, 1);
        // Gains bruts 2000 + 2000 = 4000 sur 22 gagnants ; pertes 3000 sur 30.
        expect(m.rr).toBeCloseTo(1.8, 1);
    });

    it('ignores setups the account does not allow', () => {
        const stats = setupStats([...series('autorisé', 10, 100, 0, 0), ...series('exclu', 0, 0, 10, 100)]);
        const m = journalMetrics(['autorisé'], stats);
        expect(m.closed).toBe(10);
        expect(m.winRatePct).toBe(100);
    });

    it('withholds the rate below the minimum sample, but still counts the trades', () => {
        const m = journalMetrics(['M2'], setupStats(series('M2', 3, 100, 0, 0)));
        expect(m.closed).toBe(3);
        expect(m.winRatePct).toBeNull();
        expect(m.reliable).toBe(false);
        expect(m.expectancy).toBe(100);
    });

    it('returns no RR without both a win and a loss to compare', () => {
        expect(journalMetrics(['M2'], setupStats(series('M2', 10, 100, 0, 0))).rr).toBeNull();
        expect(journalMetrics(['M2'], setupStats(series('M2', 0, 0, 10, 100))).rr).toBeNull();
    });

    it('is empty, not wrong, when no allowed setup was ever traded', () => {
        const m = journalMetrics(['jamais joué'], setupStats(series('autre', 10, 100, 0, 0)));
        expect(m.closed).toBe(0);
        expect(m.winRatePct).toBeNull();
        expect(m.expectancy).toBeNull();
    });
});

describe('journalExpectancyPct', () => {
    it('scales the expectancy to the account, so sizes stay comparable', () => {
        const m = journalMetrics(['M2'], setupStats(series('M2', 10, 100, 0, 0)));
        expect(journalExpectancyPct(m, 5000)).toBe(2);
        expect(journalExpectancyPct(m, 100000)).toBe(0.1);
    });

    it('refuses to divide by a capital of zero', () => {
        const m = journalMetrics(['M2'], setupStats(series('M2', 10, 100, 0, 0)));
        expect(journalExpectancyPct(m, 0)).toBeNull();
    });
});

describe('alertVerdict', () => {
    const base = { initialCapital: 5000, maxDDPct: 8, alertThresholdPct: 4 };

    it('stays quiet while the loss is below the chosen threshold', () => {
        const v = alertVerdict({ ...base, currentCapital: 4900 });
        expect(v.state).toBe('ok');
        expect(v.lossPct).toBe(2);
    });

    it('warns once the trader’s own limit is reached, well before the prop firm’s', () => {
        const v = alertVerdict({ ...base, currentCapital: 4800 });
        expect(v.state).toBe('warning');
        expect(v.lossPct).toBe(4);
        expect(v.thresholdPct).toBe(4);
    });

    it('reports a breach at the prop firm limit, which outranks the warning', () => {
        const v = alertVerdict({ ...base, currentCapital: 4600 });
        expect(v.state).toBe('breached');
        expect(v.lossPct).toBe(8);
    });

    it('never warns when the trader set no threshold', () => {
        const v = alertVerdict({ ...base, alertThresholdPct: null, currentCapital: 4800 });
        expect(v.state).toBe('ok');
    });

    it('treats a profitable account as a negative loss, not an alert', () => {
        const v = alertVerdict({ ...base, currentCapital: 5500 });
        expect(v.state).toBe('ok');
        expect(v.lossPct).toBe(-10);
    });
});
