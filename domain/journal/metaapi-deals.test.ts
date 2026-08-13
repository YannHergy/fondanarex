import { describe, expect, it } from 'vitest';

import { foldDealsIntoPositions, type RawDeal } from './metaapi-deals';

function deal(overrides: Partial<RawDeal> = {}): RawDeal {
    return {
        positionId: 'p1',
        symbol: 'EURUSD',
        type: 'DEAL_TYPE_BUY',
        entryType: 'DEAL_ENTRY_IN',
        volume: 1,
        price: 1.1,
        profit: 0,
        commission: 0,
        swap: 0,
        time: '2026-08-01T10:00:00.000Z',
        ...overrides,
    };
}

describe('foldDealsIntoPositions', () => {
    it('folds an entry and an exit into one position', () => {
        const [position] = foldDealsIntoPositions([
            deal({ entryType: 'DEAL_ENTRY_IN', price: 1.1, time: '2026-08-01T10:00:00.000Z' }),
            deal({
                entryType: 'DEAL_ENTRY_OUT',
                type: 'DEAL_TYPE_SELL',
                price: 1.12,
                profit: 200,
                commission: -7,
                time: '2026-08-01T14:00:00.000Z',
            }),
        ]);

        expect(position).toMatchObject({
            positionId: 'p1',
            symbol: 'EURUSD',
            direction: 'Buy',
            entryPrice: 1.1,
            exitPrice: 1.12,
            lotSize: 1,
            profit: 200,
            commission: -7,
        });
        expect(position!.openedAt.toISOString()).toBe('2026-08-01T10:00:00.000Z');
        expect(position!.closedAt.toISOString()).toBe('2026-08-01T14:00:00.000Z');
    });

    it('takes the direction from the entry, not from the closing deal', () => {
        const [position] = foldDealsIntoPositions([
            deal({ type: 'DEAL_TYPE_SELL', entryType: 'DEAL_ENTRY_IN' }),
            deal({ type: 'DEAL_TYPE_BUY', entryType: 'DEAL_ENTRY_OUT', time: '2026-08-01T12:00:00.000Z' }),
        ]);
        expect(position!.direction).toBe('Sell');
    });

    it('sums partial exits and dates the position by the LAST of them', () => {
        const [position] = foldDealsIntoPositions([
            deal({ entryType: 'DEAL_ENTRY_IN', volume: 2, commission: -4 }),
            deal({
                entryType: 'DEAL_ENTRY_OUT',
                price: 1.11,
                profit: 50,
                commission: -2,
                swap: -1,
                time: '2026-08-01T12:00:00.000Z',
            }),
            deal({
                entryType: 'DEAL_ENTRY_OUT',
                price: 1.13,
                profit: 130,
                commission: -2,
                swap: -1,
                time: '2026-08-01T16:00:00.000Z',
            }),
        ]);

        expect(position!.profit).toBe(180);
        // Frais de TOUTES les opérations, entrée comprise.
        expect(position!.commission).toBe(-8);
        expect(position!.swap).toBe(-2);
        // Prix et date de la DERNIÈRE sortie, pas de la première.
        expect(position!.exitPrice).toBe(1.13);
        expect(position!.closedAt.toISOString()).toBe('2026-08-01T16:00:00.000Z');
    });

    it('ignores a position still open — no exit deal', () => {
        expect(foldDealsIntoPositions([deal({ entryType: 'DEAL_ENTRY_IN' })])).toEqual([]);
    });

    it('ignores balance operations, which move capital without being trades', () => {
        const folded = foldDealsIntoPositions([
            deal({ positionId: 'dep', type: 'DEAL_TYPE_BALANCE', symbol: undefined, profit: 5000 }),
            deal({ entryType: 'DEAL_ENTRY_IN' }),
            deal({ entryType: 'DEAL_ENTRY_OUT', time: '2026-08-01T12:00:00.000Z' }),
        ]);
        expect(folded).toHaveLength(1);
        expect(folded[0]!.positionId).toBe('p1');
    });

    it('keeps positions apart and returns them oldest close first', () => {
        const folded = foldDealsIntoPositions([
            deal({ positionId: 'late', entryType: 'DEAL_ENTRY_IN' }),
            deal({ positionId: 'late', entryType: 'DEAL_ENTRY_OUT', time: '2026-08-05T10:00:00.000Z' }),
            deal({ positionId: 'early', entryType: 'DEAL_ENTRY_IN' }),
            deal({ positionId: 'early', entryType: 'DEAL_ENTRY_OUT', time: '2026-08-02T10:00:00.000Z' }),
        ]);
        expect(folded.map(p => p.positionId)).toEqual(['early', 'late']);
    });
});
