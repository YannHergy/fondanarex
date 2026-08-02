// ================================================================
// TRADING ACCOUNT METRICS
//
// Risk, drawdown headroom, and the expectancy implied by the entry
// types an account is allowed to take.
//
// Pure: account configuration in, numbers out.
// ================================================================

import {
    ENTRY_RR,
    ENTRY_WIN_RATES,
    appearancesPerWeek,
    type EntryType,
} from '../data/entry-types';

export interface AccountConfig {
    initialCapital: number;
    currentCapital: number;
    /**
     * Notional capital used for sizing when useRealCapital is false — a funded
     * account traded as a smaller one.
     */
    tradingCapital: number;
    useRealCapital: boolean;
    riskPct: number;
    maxDDPct: number;
    targetPct: number | null;
    allowedEntries: readonly EntryType[];
}

/**
 * Amount risked per trade.
 *
 * Sized off `tradingCapital` when the account is traded as a smaller one, which
 * is the whole reason that field exists: a 10k funded account run as a 5k
 * account must risk 5k-sized amounts, not 10k-sized ones.
 */
export function riskPerTrade(config: AccountConfig): number {
    const base = config.useRealCapital ? config.currentCapital : config.tradingCapital;
    return base * (config.riskPct / 100);
}

/** Percentage of the allowed drawdown already consumed, 0 when in profit. */
export function drawdownUsedPct(config: AccountConfig): number {
    const maxDrawdown = config.initialCapital * (config.maxDDPct / 100);
    if (maxDrawdown <= 0) return 0;

    const lost = config.initialCapital - config.currentCapital;
    return Math.max(0, (lost / maxDrawdown) * 100);
}

/** Currency amount that can still be lost before the account breaches. */
export function drawdownRemaining(config: AccountConfig): number {
    return config.currentCapital - config.initialCapital * (1 - config.maxDDPct / 100);
}

/** Losing trades at the current risk before the drawdown limit is breached. */
export function tradesUntilBreach(config: AccountConfig): number {
    const risk = riskPerTrade(config);
    if (risk <= 0) return 0;
    return Math.max(0, Math.floor(drawdownRemaining(config) / risk));
}

/** Progress towards the profit target, 0..100, or null when no target is set. */
export function targetProgressPct(config: AccountConfig): number | null {
    if (config.targetPct === null || config.targetPct <= 0) return null;

    const gained = config.currentCapital - config.initialCapital;
    const targetAmount = config.initialCapital * (config.targetPct / 100);
    if (targetAmount <= 0) return null;

    return Math.max(0, Math.min(100, (gained / targetAmount) * 100));
}

/** Expected setups per week across the account's permitted entries. */
export function setupsPerWeek(config: AccountConfig): number {
    return config.allowedEntries.reduce((sum, entry) => sum + appearancesPerWeek(entry), 0);
}

/**
 * Win rate across permitted entries, weighted by how often each appears.
 *
 * Weighting by frequency rather than taking a plain mean matters: an entry that
 * shows up daily contributes far more to the account's realised results than
 * one appearing weekly, so a flat average would misrepresent the account.
 *
 * Entries with no measured win rate are EXCLUDED, not counted as zero — the
 * same rule the scoring engine uses for missing indicators.
 */
export function weightedWinRate(config: AccountConfig): number | null {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const entry of config.allowedEntries) {
        const winRate = ENTRY_WIN_RATES[entry];
        const weight = appearancesPerWeek(entry);
        if (winRate === undefined || weight <= 0) continue;

        totalWeight += weight;
        weightedSum += winRate * weight;
    }

    if (totalWeight === 0) return null;
    return Math.round((weightedSum / totalWeight) * 10) / 10;
}

/** Reward-to-risk across permitted entries, weighted the same way. */
export function weightedRR(config: AccountConfig): number | null {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const entry of config.allowedEntries) {
        const rr = ENTRY_RR[entry];
        const weight = appearancesPerWeek(entry);
        if (rr === undefined || weight <= 0) continue;

        totalWeight += weight;
        weightedSum += rr * weight;
    }

    if (totalWeight === 0) return null;
    return Math.round((weightedSum / totalWeight) * 10) / 10;
}

/**
 * Expectancy per trade, as a percentage of capital.
 *
 * Returns null when the win rate cannot be established, rather than a number
 * derived from a guess. The legacy version fell back to a hardcoded RR of 6
 * when no entry had a measured value, which produced a confident-looking
 * expectancy for an account nobody had data on.
 */
export function expectancyPct(config: AccountConfig): number | null {
    const winRate = weightedWinRate(config);
    const rr = weightedRR(config);
    if (winRate === null || rr === null) return null;

    const wr = winRate / 100;
    const gain = config.riskPct * rr;
    const loss = config.riskPct;

    return Math.round((wr * gain - (1 - wr) * loss) * 100) / 100;
}

export type AccountHealth = 'healthy' | 'warning' | 'critical' | 'breached';

/** Overall state of an account, by how much of its drawdown is gone. */
export function accountHealth(config: AccountConfig): AccountHealth {
    if (drawdownRemaining(config) <= 0) return 'breached';

    const used = drawdownUsedPct(config);
    if (used >= 75) return 'critical';
    if (used >= 40) return 'warning';
    return 'healthy';
}
