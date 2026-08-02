// ================================================================
// RISK AND POSITION SIZING
//
// Turns "risk 0.4% of this account" into a lot size, and reports the
// limits that follow from it.
//
// Pip value is derived from the INSTRUMENT, never assumed. The legacy
// journal hardcoded "1 pip = $10 per lot" and a
// `symbol.includes('JPY') ? 100 : 10000` divisor, which is wrong for
// every instrument whose contract size or pip size differs — and
// silently so, because a wrong lot size still looks like a number.
// ================================================================

export interface RiskInputs {
    /** Account capital in the account currency. */
    capital: number;
    /** Risk per trade, as a percentage (0.4 means 0.4%). */
    riskPct: number;
    /** Reward-to-risk ratio of the target. */
    rr: number;
}

export interface RiskOutcome {
    /** Amount at risk on one trade. */
    riskAmount: number;
    /** Amount gained if the target is hit. */
    gainAmount: number;
    /** Capital after one loss, and after one win. */
    capitalAfterLoss: number;
    capitalAfterWin: number;
    /** Risk amount for the NEXT trade, after a loss or a win, at the same %. */
    nextRiskAfterLoss: number;
    nextRiskAfterWin: number;
    /** Daily loss ceiling, taken as twice the per-trade risk. */
    dailyMaxLoss: number;
    /** Losing trades that fit inside the daily ceiling. */
    dailyMaxTrades: number;
    /** Consecutive losses before an 8% account drawdown is breached. */
    tradesToBreach: number;
}

/**
 * Risk arithmetic for one trade.
 *
 * Note that `nextRiskAfterLoss` is smaller than `riskAmount`: risking a fixed
 * PERCENTAGE means the absolute amount shrinks after a loss, which is what
 * makes a fixed-fractional scheme survivable.
 */
export function calculateRisk({ capital, riskPct, rr }: RiskInputs): RiskOutcome {
    const safeCapital = Math.max(0, capital);
    const fraction = riskPct / 100;

    const riskAmount = safeCapital * fraction;
    const gainAmount = riskAmount * rr;

    const capitalAfterLoss = safeCapital - riskAmount;
    const capitalAfterWin = safeCapital + gainAmount;

    const dailyMaxLoss = safeCapital * (riskPct * 2) / 100;

    return {
        riskAmount,
        gainAmount,
        capitalAfterLoss,
        capitalAfterWin,
        nextRiskAfterLoss: capitalAfterLoss * fraction,
        nextRiskAfterWin: capitalAfterWin * fraction,
        dailyMaxLoss,
        dailyMaxTrades: riskAmount > 0 ? Math.floor(dailyMaxLoss / riskAmount) : 0,
        tradesToBreach: riskAmount > 0 ? Math.floor((safeCapital * 0.08) / riskAmount) : 0,
    };
}

// ================================================================
// POSITION SIZING
// ================================================================

export interface InstrumentSpec {
    symbol: string;
    /** Price increment of one pip, e.g. 0.0001 for majors, 0.01 for JPY pairs. */
    pipSize: number;
    /** Units of base currency in one standard lot. */
    contractSize: number;
}

export interface PositionSize {
    /** Value of one pip for one standard lot, in the QUOTE currency. */
    pipValuePerLot: number;
    /** Lots to trade, unrounded. */
    lots: number;
    /** Lots rounded down to the broker's step — never up, which would over-risk. */
    lotsRounded: number;
    /** Actual amount risked at the rounded size. */
    actualRisk: number;
}

/**
 * Lots for a given risk amount and stop distance.
 *
 * Rounding is always DOWN to the lot step. Rounding to nearest would let the
 * position exceed the intended risk, which defeats the purpose of sizing it.
 *
 * The pip value returned is in the quote currency. For an account denominated
 * in a different currency the caller must convert — this function deliberately
 * does not guess an exchange rate.
 */
export function calculatePositionSize(
    riskAmount: number,
    stopLossPips: number,
    instrument: InstrumentSpec,
    lotStep = 0.01,
): PositionSize {
    const pipValuePerLot = instrument.pipSize * instrument.contractSize;

    if (stopLossPips <= 0 || pipValuePerLot <= 0 || riskAmount <= 0) {
        return { pipValuePerLot, lots: 0, lotsRounded: 0, actualRisk: 0 };
    }

    const lots = riskAmount / (stopLossPips * pipValuePerLot);
    const lotsRounded = Math.floor(lots / lotStep) * lotStep;
    // Re-derived from the rounded size, not the requested risk, so the number
    // shown is the risk actually taken.
    const actualRisk = lotsRounded * stopLossPips * pipValuePerLot;

    return {
        pipValuePerLot,
        lots,
        lotsRounded: Number(lotsRounded.toFixed(2)),
        actualRisk: Number(actualRisk.toFixed(2)),
    };
}

/**
 * Pip distance between two prices for an instrument.
 *
 * Uses the instrument's own pip size rather than inferring it from the symbol
 * name, which is what made the legacy calculation wrong for anything unusual.
 */
export function priceToPips(
    from: number,
    to: number,
    instrument: InstrumentSpec,
): number {
    if (instrument.pipSize <= 0) return 0;
    return Number(((to - from) / instrument.pipSize).toFixed(2));
}
