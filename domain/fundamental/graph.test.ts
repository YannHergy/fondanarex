import { describe, expect, it } from 'vitest';

import { FUNDAMENTAL_INDICATORS } from '../data/fundamental-indicators';
import type { FundamentalConnection } from '../data/fundamental-connections';
import {
    LEVEL_ORDER,
    activeConnections,
    computeLayout,
    connectionsWithin,
    findDanglingConnections,
    indicatorsForCurrency,
    reachableFrom,
} from './graph';

/** Small hand-built graph: a -> b -> c, and d -> b. */
const TOY: FundamentalConnection[] = [
    { from: 'a', to: 'b', weight: 3, direction: 'positive', delay: 'days', description: '' },
    { from: 'b', to: 'c', weight: 3, direction: 'positive', delay: 'days', description: '' },
    { from: 'd', to: 'b', weight: 2, direction: 'inverse', delay: 'weeks', description: '' },
];

describe('graph integrity', () => {
    it('has no connection pointing at a missing indicator', () => {
        // A dangling edge draws a line to nowhere and silently breaks cascade
        // propagation, so this is asserted rather than eyeballed.
        expect(findDanglingConnections()).toEqual([]);
    });

    it('gives every indicator a level in the known order', () => {
        for (const indicator of FUNDAMENTAL_INDICATORS) {
            expect(LEVEL_ORDER).toContain(indicator.level);
        }
    });

    it('gives every indicator a unique id', () => {
        const ids = FUNDAMENTAL_INDICATORS.map(i => i.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('indicatorsForCurrency', () => {
    it('includes the currency plus the shared GLOBAL indicators', () => {
        const usd = indicatorsForCurrency('USD');
        expect(usd.some(i => i.currency === 'USD')).toBe(true);
        expect(usd.some(i => i.currency === 'GLOBAL')).toBe(true);
        expect(usd.some(i => i.currency === 'EUR')).toBe(false);
    });

    it('returns only GLOBAL for an unknown currency', () => {
        const unknown = indicatorsForCurrency('XXX');
        expect(unknown.every(i => i.currency === 'GLOBAL')).toBe(true);
    });
});

describe('computeLayout', () => {
    it('places every indicator of the currency', () => {
        const positions = computeLayout('CAD');
        expect(positions).toHaveLength(indicatorsForCurrency('CAD').length);
    });

    it('orders rows king first, root last', () => {
        const positions = computeLayout('USD');
        const kingRow = positions.find(p => p.level === 'king')?.row;
        const rootRow = positions.find(p => p.level === 'root')?.row;
        expect(kingRow).toBe(0);
        expect(rootRow).toBe(LEVEL_ORDER.length - 1);
    });

    it('keeps x within the row and away from the edges', () => {
        for (const position of computeLayout('EUR')) {
            expect(position.x).toBeGreaterThan(0);
            expect(position.x).toBeLessThan(1);
        }
    });

    it('centres a row containing a single node', () => {
        const positions = computeLayout('USD');
        const kings = positions.filter(p => p.level === 'king');
        expect(kings).toHaveLength(1);
        expect(kings[0]?.x).toBe(0.5);
    });

    it('spreads a row of several nodes evenly', () => {
        const positions = computeLayout('USD').filter(p => p.level === 'pillar');
        const xs = positions.map(p => p.x);
        expect(new Set(xs).size).toBe(xs.length);
    });
});

describe('connectionsWithin', () => {
    it('keeps only edges with both endpoints in the set', () => {
        const usdIds = new Set(indicatorsForCurrency('USD').map(i => i.id));
        for (const connection of connectionsWithin(usdIds)) {
            expect(usdIds.has(connection.from)).toBe(true);
            expect(usdIds.has(connection.to)).toBe(true);
        }
    });
});

describe('reachableFrom', () => {
    it('includes the starting node', () => {
        expect(reachableFrom('a', 'both', 1, TOY).has('a')).toBe(true);
    });

    it('follows edges forwards when downstream', () => {
        const reached = reachableFrom('a', 'downstream', 1, TOY);
        expect([...reached].sort()).toEqual(['a', 'b']);
    });

    it('follows edges backwards when upstream', () => {
        const reached = reachableFrom('b', 'upstream', 1, TOY);
        expect([...reached].sort()).toEqual(['a', 'b', 'd']);
    });

    it('follows both directions by default', () => {
        expect([...reachableFrom('b', 'both', 1, TOY)].sort()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('walks the cascade at greater depth', () => {
        // Depth 1 from a reaches only b; depth 2 reaches c through it.
        expect(reachableFrom('a', 'downstream', 1, TOY).has('c')).toBe(false);
        expect(reachableFrom('a', 'downstream', 2, TOY).has('c')).toBe(true);
    });

    it('stops early when the frontier is exhausted', () => {
        // Depth far beyond the graph must terminate, not loop.
        expect([...reachableFrom('a', 'downstream', 50, TOY)].sort()).toEqual(['a', 'b', 'c']);
    });

    it('terminates on a cycle', () => {
        const cyclic: FundamentalConnection[] = [
            { from: 'x', to: 'y', weight: 1, direction: 'positive', delay: 'days', description: '' },
            { from: 'y', to: 'x', weight: 1, direction: 'positive', delay: 'days', description: '' },
        ];
        expect([...reachableFrom('x', 'both', 10, cyclic)].sort()).toEqual(['x', 'y']);
    });

    it('returns just the node when nothing connects', () => {
        expect([...reachableFrom('lonely', 'both', 3, TOY)]).toEqual(['lonely']);
    });
});

describe('activeConnections', () => {
    it('selects outgoing edges downstream', () => {
        expect(activeConnections('b', 'downstream', TOY).map(c => c.to)).toEqual(['c']);
    });

    it('selects incoming edges upstream', () => {
        expect(activeConnections('b', 'upstream', TOY).map(c => c.from).sort()).toEqual(['a', 'd']);
    });

    it('selects both when unfiltered', () => {
        expect(activeConnections('b', 'both', TOY)).toHaveLength(3);
    });
});
