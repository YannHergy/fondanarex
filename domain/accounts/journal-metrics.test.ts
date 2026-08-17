import { describe, expect, it } from 'vitest';

import { setupStats, type SetupTrade } from '../journal/setup-stats';
import {
    accountTradeMetrics,
    alertVerdict,
    journalExpectancyPct,
    journalMetrics,
    realisedPnl,
} from './journal-metrics';

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

describe('accountTradeMetrics', () => {
    const closed = (pnl: number) => ({ closedAt: new Date('2026-07-01'), pnl });

    it('mesure les trades du compte sans exiger la moindre étiquette', () => {
        // Le cas réel du bug : neuf trades importés, aucun setup déclaré,
        // aucune stratégie renseignée. L'ancien calcul filtrait sur les setups
        // autorisés et renvoyait « 0 trade mesuré » sur un compte en perte.
        const m = accountTradeMetrics([closed(-33.72), closed(74.18), closed(-55.44)]);

        expect(m.closed).toBe(3);
        expect(m.expectancy).toBe(-4.99);
    });

    it('exclut les positions encore ouvertes du capital réalisé', () => {
        const trades = [closed(-100), { closedAt: null, pnl: null }, { closedAt: null, pnl: 500 }];

        expect(realisedPnl(trades)).toBe(-100);
        expect(accountTradeMetrics(trades).closed).toBe(1);
    });

    it('retient un taux de réussite seulement sur un échantillon suffisant', () => {
        const maigre = accountTradeMetrics([closed(10), closed(-5)]);
        expect(maigre.winRatePct).toBeNull();
        expect(maigre.expectancy).toBe(2.5);

        const assez = accountTradeMetrics(
            Array.from({ length: 10 }, (_, i) => closed(i < 4 ? 20 : -10)),
        );
        expect(assez.winRatePct).toBe(40);
        expect(assez.rr).toBe(2);
    });

    it('compte un trade nul dans l échantillon mais pas dans le ratio', () => {
        const m = accountTradeMetrics([closed(50), closed(-25), closed(0)]);
        expect(m.closed).toBe(3);
        // 50 / 25 : le zéro ne fausse ni le gain moyen ni la perte moyenne.
        expect(m.rr).toBe(2);
    });
});
