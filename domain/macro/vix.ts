// ================================================================
// VIX — CBOE VOLATILITY INDEX
//
// The `risque` indicator is the single heaviest line in two of the
// eight profiles (CHF 28%, JPY 22%) and worth 10% for the AUD and
// the NZD. The scoring side already exists and is tested:
// riskOffFromVix() in the engine turns a VIX LEVEL into a risk-off
// intensity, and the engine then keeps that intensity for the safe
// havens and flips its sign for the pro-cyclicals. Nothing here
// needs to know about that — this module's only job is to produce
// an honest VIX level and the one it should be compared against.
//
// The month-reduction it relies on is shared with the oil barrel,
// which behaves the same way, and lives in market-series.ts.
// ================================================================

import { toMonthlyReading, type DailyClose, type MonthlyReading } from "./market-series";

export type VixDailyClose = DailyClose;
export type VixReading = MonthlyReading;

export { monthlyCloses } from "./market-series";

/** Latest month's VIX close and the month before it. Null when there is no usable data. */
export function toVixReading(daily: readonly VixDailyClose[]): VixReading | null {
    return toMonthlyReading(daily);
}
