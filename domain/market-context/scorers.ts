// ================================================================
// SCORING RULES OF THE SPECIFIC INDICATORS
//
// Every function returns a directional score [-10, +10] seen from the
// point of view of the currency concerned, or `null` when the data is
// unavailable (-> the indicator is excluded from the computation and
// its weight leaves the denominator).
//
// WARNING — the thresholds below are REASONED ESTIMATES, not official
// references. They are ported verbatim from the legacy engine.
// ================================================================

import type { MarketContext } from '../types';
import { clamp10, pctScore } from '../scoring/math';

/**
 * OIL (CAD, positive correlation).
 * Canada is a net oil exporter: a higher barrel means better terms of
 * trade, inbound flows and a bullish CAD.
 * Saturation at ±15% change.
 */
export function scoreOil(ctx: MarketContext): number | null {
    if (ctx.oilChangePct === null) return null;
    return pctScore(ctx.oilChangePct, 15);
}

/**
 * IRON ORE / COAL (AUD, positive correlation).
 * Iron ore is Australia's first export line. Same logic as oil for the
 * CAD. Saturation at ±15%.
 */
export function scoreIronOre(ctx: MarketContext): number | null {
    if (ctx.ironOreChangePct === null) return null;
    return pctScore(ctx.ironOreChangePct, 15);
}

/**
 * DAIRY — GDT Fonterra auctions (NZD, positive correlation).
 * Dairy is ~25% of New Zealand's exports. GDT auctions typically move
 * by ±5-10%, hence the saturation at ±10%.
 */
export function scoreDairy(ctx: MarketContext): number | null {
    if (ctx.dairyGdtChangePct === null) return null;
    return pctScore(ctx.dairyGdtChangePct, 10);
}

/**
 * CHINA DATA (AUD + NZD, positive correlation).
 * China is the first trading partner of both countries.
 * Score = PMI level (50 = expansion/contraction threshold) + momentum.
 */
export function scoreChina(ctx: MarketContext): number | null {
    if (ctx.chinaPmi === null) return null;

    // Level: every point above/below 50 is worth 2 points of score
    const level = clamp10((ctx.chinaPmi - 50) * 2);

    // Momentum: acceleration or deceleration of the activity
    let momentum = 0;
    if (ctx.chinaPmiPrev !== null) {
        const delta = ctx.chinaPmi - ctx.chinaPmiPrev;
        momentum = delta > 0.5 ? 2 : delta < -0.5 ? -2 : 0;
    }

    return clamp10(level + momentum);
}

/**
 * RISK-OFF INTENSITY — shared base of the risk sentiment.
 * Returns [-10, +10] where:
 *   +10 = maximum panic (extreme risk-off, VIX very high and rising)
 *   -10 = maximum complacency (extreme risk-on, VIX low and falling)
 *
 * VIX landmarks: <15 = calm · 15-20 = normal · 20-30 = stress · >30 = panic
 */
function riskOffIntensity(ctx: MarketContext): number | null {
    if (ctx.vix === null) return null;

    // Level: 20 is the neutral pivot of the VIX
    let level: number;
    if (ctx.vix > 35)      level = 10;
    else if (ctx.vix > 28) level = 7;
    else if (ctx.vix > 22) level = 4;
    else if (ctx.vix > 18) level = 0;
    else if (ctx.vix > 14) level = -4;
    else                   level = -8;

    // Momentum: a climbing VIX amplifies the risk-off
    let momentum = 0;
    if (ctx.vixPrev !== null) {
        const delta = ctx.vix - ctx.vixPrev;
        momentum = delta > 2 ? 2 : delta < -2 ? -2 : 0;
    }

    return clamp10(level + momentum);
}

/**
 * RISK SENTIMENT — SAFE HAVEN (JPY, CHF).
 * In risk-off, capital takes shelter in the yen and the Swiss franc.
 * -> risk-off = BULLISH for these currencies.
 */
export function scoreRiskSafeHaven(ctx: MarketContext): number | null {
    return riskOffIntensity(ctx);
}

/**
 * RISK SENTIMENT — PRO-CYCLICAL (AUD, NZD).
 * Currencies tied to global growth and commodities: they are sold in
 * stress periods.
 * -> risk-off = BEARISH. The exact OPPOSITE of the safe havens.
 */
export function scoreRiskProCyclical(ctx: MarketContext): number | null {
    const intensity = riskOffIntensity(ctx);
    return intensity === null ? null : -intensity;
}

/**
 * US ECONOMY SPILLOVER (CAD).
 * ~75% of Canadian exports go to the United States, so a solid US
 * economy pulls the CAD up.
 *
 * @param usdRawScore Raw weighted score of the USD [-10, +10]
 */
export function scoreUsSpillover(usdRawScore: number | null): number | null {
    if (usdRawScore === null) return null;
    // Damped transmission: the CAD does not capture 100% of the US strength
    return clamp10(usdRawScore * 0.8);
}

/**
 * EUR-CHF CAPITAL FLOWS (CHF).
 * A DROP of EUR/CHF means the franc is appreciating: capital flowing
 * into Switzerland = bullish CHF.
 * -> NEGATIVE correlation with the change of the pair.
 * Saturation at ±3% (FX moves are smaller than commodity moves).
 */
export function scoreEurChfFlows(ctx: MarketContext): number | null {
    if (ctx.eurChfChangePct === null) return null;
    return -pctScore(ctx.eurChfChangePct, 3);
}

/**
 * SNB INTERVENTIONS (CHF).
 * The SNB historically intervenes to WEAKEN the franc (buying foreign
 * currency) in order to protect Swiss exporters.
 *   - 'affaiblir_chf'  -> the SNB sells CHF = bearish
 *   - 'renforcer_chf'  -> rare case, fighting inflation = bullish
 *   - 'aucune'         -> neutral
 */
export function scoreSnbIntervention(ctx: MarketContext): number | null {
    if (ctx.snbIntervention === null) return null;
    switch (ctx.snbIntervention) {
        case 'affaiblir_chf':  return -7;
        case 'renforcer_chf':  return 7;
        case 'aucune':         return 0;
        default:               return 0;
    }
}

/**
 * NFP — Non-Farm Payrolls (USD).
 * The most watched number of the global economic calendar.
 * Landmark: ~150k/month = US demographic equilibrium pace.
 */
export function scoreNfp(ctx: MarketContext): number | null {
    if (ctx.usNfp === null) return null;

    let level: number;
    if (ctx.usNfp > 300)      level = 10;
    else if (ctx.usNfp > 200) level = 7;
    else if (ctx.usNfp > 150) level = 4;
    else if (ctx.usNfp > 100) level = 0;
    else if (ctx.usNfp > 50)  level = -4;
    else if (ctx.usNfp > 0)   level = -7;
    else                      level = -10; // net job destructions

    // Momentum vs the previous month
    let momentum = 0;
    if (ctx.usNfpPrev !== null) {
        const delta = ctx.usNfp - ctx.usNfpPrev;
        momentum = delta > 50 ? 2 : delta < -50 ? -2 : 0;
    }

    return clamp10(level + momentum);
}

/**
 * EMPLOYMENT CHANGE (AUD, CAD) — net job creations in thousands.
 * Smaller economies than the US: the thresholds are scaled down
 * proportionally.
 */
export function scoreEmploymentChangeValue(value: number): number {
    if (value > 50)  return 10;
    if (value > 25)  return 7;
    if (value > 10)  return 4;
    if (value > 0)   return 1;
    if (value > -10) return -3;
    if (value > -25) return -7;
    return -10;
}

/** Nullable wrapper of scoreEmploymentChangeValue — null = data unavailable */
export function scoreEmploymentChange(value: number | null): number | null {
    return value === null ? null : scoreEmploymentChangeValue(value);
}

/**
 * NZ QUARTERLY EMPLOYMENT — change in % (not in thousands).
 */
export function scoreNzEmployment(ctx: MarketContext): number | null {
    if (ctx.nzEmploymentChange === null) return null;
    // ±1% per quarter is a strong move for New Zealand
    return pctScore(ctx.nzEmploymentChange, 1);
}

/**
 * ZEW / IFO ECONOMIC SENTIMENT (EUR).
 * The ZEW oscillates around 0: positive = investor optimism.
 */
export function scoreZew(ctx: MarketContext): number | null {
    if (ctx.euZew === null) return null;

    // Level: ±40 points of ZEW saturate the score
    const level = pctScore(ctx.euZew, 40);

    let momentum = 0;
    if (ctx.euZewPrev !== null) {
        const delta = ctx.euZew - ctx.euZewPrev;
        momentum = delta > 5 ? 2 : delta < -5 ? -2 : 0;
    }

    return clamp10(level + momentum);
}

/**
 * IVEY PMI (CAD) and KOF (CHF) — threshold-based activity indices.
 * Ivey: pivot at 50 · KOF: pivot at 100 (long-term average).
 */
export function scoreIvey(ctx: MarketContext): number | null {
    if (ctx.caIveyPmi === null) return null;
    return clamp10((ctx.caIveyPmi - 50) * 1.5);
}

export function scoreKof(ctx: MarketContext): number | null {
    if (ctx.chKof === null) return null;
    return clamp10((ctx.chKof - 100) * 0.8);
}

/**
 * TOKYO CPI (JPY) — leading indicator of the Japanese national CPI,
 * published 3 weeks earlier. Scored from the BoJ point of view:
 * inflation climbing back towards 2% justifies a monetary
 * normalisation = bullish JPY.
 */
export function scoreTokyoCpi(ctx: MarketContext): number | null {
    if (ctx.jpTokyoCpi === null) return null;
    const target = 2.0;
    const gap = ctx.jpTokyoCpi - target;

    // In Japan, overshooting the target is BULLISH (anticipated end of the YCC)
    if (gap > 1.0)  return 8;
    if (gap > 0.3)  return 5;
    if (gap > -0.3) return 0;
    if (gap > -1.0) return -5;
    return -8;
}

/**
 * JAPANESE CURRENT ACCOUNT (JPY) — bn JPY.
 * The structural Japanese surplus supports the yen through repatriations.
 */
export function scoreJpCurrentAccount(ctx: MarketContext): number | null {
    if (ctx.jpCurrentAccount === null) return null;

    if (ctx.jpCurrentAccount > 2500)  return 10;
    if (ctx.jpCurrentAccount > 1500)  return 6;
    if (ctx.jpCurrentAccount > 0)     return 2;
    if (ctx.jpCurrentAccount > -1000) return -4;
    return -9;
}

/**
 * UK WAGE GROWTH (GBP) — % YoY.
 * The BoE watches wages as a signal of persistent inflation.
 * High wages = hawkish BoE = bullish GBP.
 */
export function scoreGbWages(ctx: MarketContext): number | null {
    if (ctx.gbWageGrowth === null) return null;

    if (ctx.gbWageGrowth > 6)   return 9;
    if (ctx.gbWageGrowth > 4.5) return 6;
    if (ctx.gbWageGrowth > 3)   return 2;
    if (ctx.gbWageGrowth > 2)   return -2;
    return -7;
}

/**
 * RETAIL SALES (USD, GBP) — % MoM.
 * Direct measure of the strength of consumption.
 */
export function scoreRetail(value: number | null): number | null {
    if (value === null) return null;
    // ±1% MoM is a significant move
    return pctScore(value, 1);
}

// ── Local risk sentiment ───────────────────────────────────────────────────

export type RiskStatus = 'Risk On' | 'Risk Off' | 'Neutre';

export interface LocalRiskSentiment {
    status: RiskStatus;
    /** -10..+10, positive meaning risk-off. */
    intensity: number;
    vix: number;
    vixPrev: number | null;
    rationale: string;
}

/**
 * Risk sentiment derived from the VIX we already hold.
 *
 * The overview reads this from FXMacroData, whose subscription is revoked, so
 * the panel has been blank. The VIX is the input that decides risk-on/risk-off
 * in the first place, and it is already part of the market context the scoring
 * engine consumes — so when it has been entered, there is no reason to leave
 * the panel empty waiting on a third party.
 *
 * Returns null when no VIX has been entered. That is honestly "unknown", not
 * "neutral": claiming a neutral market on no data is worse than saying nothing.
 */
export function localRiskSentiment(ctx: MarketContext): LocalRiskSentiment | null {
    const intensity = riskOffIntensity(ctx);
    if (intensity === null || ctx.vix === null) return null;

    const status: RiskStatus = intensity >= 4 ? 'Risk Off' : intensity <= -4 ? 'Risk On' : 'Neutre';

    const direction =
        ctx.vixPrev === null
            ? ''
            : ctx.vix - ctx.vixPrev > 2
              ? ', en hausse rapide'
              : ctx.vix - ctx.vixPrev < -2
                ? ', en repli rapide'
                : '';

    return {
        status,
        intensity,
        vix: ctx.vix,
        vixPrev: ctx.vixPrev,
        rationale: `VIX à ${ctx.vix.toFixed(1)}${direction}`,
    };
}
