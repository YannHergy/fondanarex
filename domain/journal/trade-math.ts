// ================================================================
// TRADE ARITHMETIC
//
// Pips and P&L from prices, using the instrument's own spec.
//
// The legacy version guessed both. Pips came from
// `pair.includes('JPY') ? 100 : 10000`, and P&L from a flat
// "1 pip ≈ 10 USD par lot standard" — accurate only for a
// USD-quoted major on a USD account, and quietly wrong for
// everything else in the pair list.
//
// Pure — no I/O.
// ================================================================

import type { InstrumentSpec } from '../risk/position';

export type Direction = 'Buy' | 'Sell';

/**
 * Signed pip result of a trade.
 *
 * A sell profits when price falls, so the raw difference is negated. Returns 0
 * when either price is missing rather than a large bogus number — an open
 * trade has no result yet, and treating a blank exit as 0.0 would post the
 * entire entry price as a loss.
 */
export function tradePips(
    direction: Direction,
    entryPrice: number,
    exitPrice: number | null,
    instrument: InstrumentSpec,
): number {
    if (!entryPrice || !exitPrice || instrument.pipSize <= 0) return 0;

    const raw = (exitPrice - entryPrice) / instrument.pipSize;
    return round(direction === 'Buy' ? raw : -raw, 1);
}

/**
 * Value of one pip for one lot, in the instrument's QUOTE currency.
 *
 * For EUR/USD that is USD; for EUR/GBP it is GBP. An account denominated in
 * something else needs a conversion the caller must supply — this deliberately
 * does not invent a rate, which is the whole reason the flat $10 was wrong.
 */
export function pipValuePerLot(instrument: InstrumentSpec): number {
    return instrument.pipSize * instrument.contractSize;
}

/**
 * Gross P&L in the quote currency, before costs.
 *
 * `quoteToAccountRate` converts the quote currency into the account currency;
 * 1 means they are the same, which is the common case and the only one the
 * legacy code could express.
 */
export function tradePnl(
    pips: number,
    lotSize: number,
    instrument: InstrumentSpec,
    quoteToAccountRate = 1,
): number {
    return round(pips * lotSize * pipValuePerLot(instrument) * quoteToAccountRate, 2);
}

/** Net result after the broker's costs. */
export function netPnl(
    grossPnl: number,
    commission: number | null,
    swap: number | null,
): number {
    return round(grossPnl + (commission ?? 0) + (swap ?? 0), 2);
}

/**
 * Realised reward-to-risk, from the prices actually used.
 *
 * Measured against the ORIGINAL stop, not the exit: a trade closed early for a
 * small gain did not become a better trade because the loss it risked never
 * happened. Returns null with no stop, since there is no risk to divide by.
 */
export function realisedRR(
    direction: Direction,
    entryPrice: number,
    exitPrice: number | null,
    stopLoss: number | null,
    instrument: InstrumentSpec,
): number | null {
    if (!stopLoss || !exitPrice) return null;

    const riskPips = Math.abs(tradePips(direction, entryPrice, stopLoss, instrument));
    if (riskPips === 0) return null;

    const resultPips = tradePips(direction, entryPrice, exitPrice, instrument);
    return round(resultPips / riskPips, 2);
}

/**
 * Planned reward-to-risk, from the stop and target set at entry.
 *
 * Available before the trade closes, which is when it is actually useful.
 */
export function plannedRR(
    direction: Direction,
    entryPrice: number,
    stopLoss: number | null,
    takeProfit: number | null,
    instrument: InstrumentSpec,
): number | null {
    if (!stopLoss || !takeProfit) return null;

    const riskPips = Math.abs(tradePips(direction, entryPrice, stopLoss, instrument));
    if (riskPips === 0) return null;

    const rewardPips = Math.abs(tradePips(direction, entryPrice, takeProfit, instrument));
    return round(rewardPips / riskPips, 2);
}

/**
 * Whether the stop and target sit on the correct sides of the entry.
 *
 * A buy with its stop above the entry is a typo, not a strategy. Worth
 * catching at entry: it inverts every RR figure computed from it.
 */
export function stopAndTargetSane(
    direction: Direction,
    entryPrice: number,
    stopLoss: number | null,
    takeProfit: number | null,
): { stopOk: boolean; targetOk: boolean } {
    const buy = direction === 'Buy';

    return {
        stopOk: stopLoss === null || (buy ? stopLoss < entryPrice : stopLoss > entryPrice),
        targetOk: takeProfit === null || (buy ? takeProfit > entryPrice : takeProfit < entryPrice),
    };
}

export type TradeOutcome = 'win' | 'loss' | 'breakeven' | 'open';

/** Classification used everywhere a trade is counted. */
export function tradeOutcome(closedAt: Date | null, netResult: number | null): TradeOutcome {
    if (!closedAt) return 'open';
    if (netResult === null) return 'open';
    if (netResult > 0) return 'win';
    if (netResult < 0) return 'loss';
    return 'breakeven';
}

function round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
