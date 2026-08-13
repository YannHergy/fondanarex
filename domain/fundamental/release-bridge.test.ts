import { describe, expect, it } from 'vitest';

import { FUNDAMENTAL_INDICATORS } from '../data/fundamental-indicators';
import { changeScore, litNodesFor, nodeIdFor, type ReleasedIndicator } from './release-bridge';

const NOW = new Date('2026-08-13T12:00:00.000Z');
const SINCE = new Date('2026-08-06T12:00:00.000Z');

function release(overrides: Partial<ReleasedIndicator> = {}): ReleasedIndicator {
    return {
        currencyCode: 'USD',
        indicatorKey: 'nfp',
        label: 'NFP',
        at: new Date('2026-08-08T12:30:00.000Z'),
        previous: 150,
        actual: -23,
        ...overrides,
    };
}

describe('nodeIdFor', () => {
    it('follows the convention for a plain key', () => {
        expect(nodeIdFor('USD', 'nfp')).toBe('usd_nfp');
        expect(nodeIdFor('USD', 'cpi')).toBe('usd_cpi');
    });

    it('maps the keys whose node is named differently', () => {
        expect(nodeIdFor('USD', 'corePce')).toBe('usd_pce');
        expect(nodeIdFor('USD', 'gdpQoQ')).toBe('usd_growth');
        expect(nodeIdFor('USD', 'interestRate')).toBe('usd_monetary_policy');
    });

    it('resolves to nodes that actually exist in the graph', () => {
        // Le pont ne sert à rien s'il pointe vers des nœuds absents : ce test
        // casse dès qu'un identifiant est renommé d'un côté sans l'autre.
        const known = new Set(FUNDAMENTAL_INDICATORS.map((i) => i.id));
        for (const key of ['nfp', 'cpi', 'corePce', 'gdpQoQ', 'unemployment', 'tradeBalance']) {
            expect(known.has(nodeIdFor('USD', key)!)).toBe(true);
        }
    });
});

describe('changeScore', () => {
    it('scales relative to the previous print, not in absolute terms', () => {
        // 2 dixièmes sur une inflation à 2 % : un événement.
        expect(changeScore(2.2, 2)).toBe(1);
        // 2 dixièmes sur un NFP à 150 : rien du tout.
        expect(changeScore(150.2, 150)).toBeCloseTo(0, 1);
    });

    it('is negative when the print falls', () => {
        expect(changeScore(-23, 150)).toBeLessThan(0);
    });

    it('clamps instead of exploding on a near-zero previous', () => {
        const score = changeScore(3, 0);
        expect(score).not.toBeNull();
        expect(Math.abs(score!)).toBeLessThanOrEqual(5);
    });

    it('has no opinion without both figures', () => {
        expect(changeScore(null, 150)).toBeNull();
        expect(changeScore(-23, null)).toBeNull();
    });
});

describe('litNodesFor', () => {
    it('lights up a released indicator of the chosen currency', () => {
        const lit = litNodesFor([release()], 'USD', SINCE, NOW);
        expect(lit).toHaveLength(1);
        expect(lit[0]!.nodeId).toBe('usd_nfp');
        expect(lit[0]!.actual).toBe(-23);
        expect(lit[0]!.surprise).toBeLessThan(0);
    });

    it('ignores another currency', () => {
        expect(litNodesFor([release({ currencyCode: 'EUR' })], 'USD', SINCE, NOW)).toEqual([]);
    });

    it('ignores a release still ahead — nothing has propagated yet', () => {
        const ahead = release({ at: new Date('2026-08-20T12:30:00.000Z') });
        expect(litNodesFor([ahead], 'USD', SINCE, NOW)).toEqual([]);
    });

    it('ignores a release with no figure', () => {
        expect(litNodesFor([release({ actual: null })], 'USD', SINCE, NOW)).toEqual([]);
    });

    it('ignores anything older than the window', () => {
        const old = release({ at: new Date('2026-07-01T12:30:00.000Z') });
        expect(litNodesFor([old], 'USD', SINCE, NOW)).toEqual([]);
    });

    it('keeps the most recent when two releases hit the same node', () => {
        const lit = litNodesFor(
            [
                release({ indicatorKey: 'cpi', label: 'vieux', at: new Date('2026-08-07T00:00:00.000Z'), actual: 1 }),
                release({ indicatorKey: 'coreCpi', label: 'récent', at: new Date('2026-08-11T00:00:00.000Z'), actual: 2 }),
            ],
            'USD',
            SINCE,
            NOW,
        );
        expect(lit).toHaveLength(1);
        expect(lit[0]!.label).toBe('récent');
    });
});
