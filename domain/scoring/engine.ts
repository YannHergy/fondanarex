// ================================================================
// SCORING ENGINE — PER-CURRENCY PROFILE
//
// Principle: every currency owns its OWN list of weighted indicators
// (see domain/data/currency-weights.ts). The final score is a weighted
// average of the directional scores of those indicators.
//
//   Weighted score = Σ(s_i × w_i) / Σ(w_i)      -> range [-10, +10]
//   Final score    = ((weighted + 10) / 20) × 100 -> range [0, 100]
//
// An indicator whose data is unavailable is EXCLUDED from the
// computation: its weight is removed from the denominator Σ(w_i)
// instead of being counted as 0, which would drag the score towards
// neutral artificially.
//
// PURITY: this module is free of I/O. The market context, the list of
// policy rates and the USD raw score are all passed IN as arguments.
// ================================================================

import type {
    CurrencyData,
    CurrencyWithScore,
    IndicatorScore,
    MarketContext,
    ScoreData,
} from '../types';
import { indicatorKind, getCurrencyProfile } from '../data/currency-weights';
import { EMPTY_MARKET_CONTEXT } from '../market-context/context';
import {
    scoreOil, scoreIronOre, scoreDairy, scoreChina,
    scoreRiskSafeHaven, scoreRiskProCyclical, scoreUsSpillover,
    scoreEurChfFlows, scoreSnbIntervention, scoreNfp,
    scoreEmploymentChange, scoreEmploymentChangeValue, scoreNzEmployment,
    scoreZew, scoreIvey, scoreKof, scoreTokyoCpi,
    scoreGbWages, scoreRetail,
} from '../market-context/scorers';
import { scoreOilLevel } from '../macro/oil';
import { clamp10, pctScore } from './math';

export { clamp10, pctScore };

// ================================================================
// PER-COUNTRY CONSTANTS
// ================================================================

/** Central bank inflation targets (%) */
const BC_TARGETS: Record<string, number> = {
    USD: 2.0,
    GBP: 2.0,
    EUR: 2.0,
    AUD: 2.5,  // RBA: 2-3% band, 2.5% median target
    CAD: 2.0,
    NZD: 2.0,
    CHF: 1.0,  // SNB: 0-2% band, 1% median target
    JPY: 2.0,
};

/** Estimated natural rate of unemployment (NAIRU) per country (%) */
const NAIRU: Record<string, number> = {
    USD: 4.0,  // Fed NAIRU estimate
    GBP: 4.5,  // BoE NAIRU estimate
    EUR: 6.5,  // ECB NAIRU estimate
    AUD: 4.5,  // RBA NAIRU estimate
    CAD: 6.0,  // BoC NAIRU estimate
    NZD: 4.5,  // RBNZ NAIRU estimate
    CHF: 2.5,  // SNB
    JPY: 2.5,  // BoJ
};

/** Currencies considered safe havens (risk-off = bullish) */
const SAFE_HAVEN_CODES = ['JPY', 'CHF'];

// ================================================================
// HELPERS
// ================================================================

/** Reads a numeric value from previousData, falling back to the current value */
export function prevNum(curr: CurrencyData, key: string, fallback: number): number {
    const v = curr.previousData?.[key];
    return typeof v === 'number' ? v : fallback;
}

/**
 * Tokyo CPI (JPY) — leading indicator of the national CPI, published
 * ~3 weeks earlier. Scored from the BoJ point of view: overshooting the
 * 2% target is BULLISH for the yen because it accelerates the exit
 * from the YCC.
 */
export function scoreTokyoCpiLevel(tokyo: number): number {
    const gap = tokyo - 2.0;
    if (gap > 1.0)  return 8;
    if (gap > 0.3)  return 5;
    if (gap > -0.3) return 0;
    if (gap > -1.0) return -5;
    return -8;
}

/**
 * Chinese demand derived from the level of the China PMI.
 * 50 = expansion/contraction threshold · every point is worth 2 of score.
 */
export function scoreChinaLevel(pmi: number, prevPmi: number): number {
    const level    = clamp10((pmi - 50) * 2);
    const delta    = pmi - prevPmi;
    const momentum = delta > 0.5 ? 2 : delta < -0.5 ? -2 : 0;
    return clamp10(level + momentum);
}

/**
 * Risk-off intensity derived from the VIX.
 *   +10 = maximum panic (risk-off) · -10 = complacency (risk-on)
 * Landmarks: <15 calm · 15-20 normal · 20-30 stress · >30 panic
 *
 * Safe-haven currencies (JPY, CHF) receive this value as is, the
 * pro-cyclical ones (AUD, NZD) receive its opposite.
 */
export function riskOffFromVix(vix: number, prevVix: number): number {
    let level: number;
    if (vix > 35)      level = 10;
    else if (vix > 28) level = 7;
    else if (vix > 22) level = 4;
    else if (vix > 18) level = 0;
    else if (vix > 14) level = -4;
    else               level = -8;

    const delta    = vix - prevVix;
    const momentum = delta > 2 ? 2 : delta < -2 ? -2 : 0;

    return clamp10(level + momentum);
}

// ================================================================
// SCORING FUNCTIONS — COMMON INDICATORS
// Each returns a directional score inside [-10, +10]
// ================================================================

/**
 * NFP (Non-Farm Payrolls): absolute level + momentum.
 * Landmark: ~150k/month = US demographic equilibrium pace.
 * Used in priority on curr.nfp; scoreNfp(ctx) remains a fallback for
 * the other currencies that would only have the market context.
 */
export function scoreNfpLevel(nfp: number, prevNfp: number): number {
    let level: number;
    if (nfp > 300)      level = 10;
    else if (nfp > 200) level = 7;
    else if (nfp > 150) level = 4;
    else if (nfp > 100) level = 0;
    else if (nfp > 50)  level = -4;
    else if (nfp > 0)   level = -7;
    else                level = -10; // net job destructions

    const delta    = nfp - prevNfp;
    const momentum = delta > 50 ? 2 : delta < -50 ? -2 : 0;

    return clamp10(level + momentum);
}

/** GDP QoQ: absolute level + acceleration momentum */
export function scoreGdp(gdpQoQ: number, prevGdpQoQ: number): number {
    let level: number;
    if (gdpQoQ > 3)        level = 10;
    else if (gdpQoQ > 2)   level = 7;
    else if (gdpQoQ > 1)   level = 3;
    else if (gdpQoQ >= 0)  level = 0;
    else if (gdpQoQ >= -1) level = -3;
    else if (gdpQoQ >= -2) level = -7;
    else                   level = -10;

    const delta    = gdpQoQ - prevGdpQoQ;
    const momentum = delta > 0.5 ? 2 : delta < -0.5 ? -2 : 0;

    return clamp10(level + momentum);
}

/** PMI (manufacturing, services or composite): level vs 50 + momentum */
export function scoreSinglePmi(value: number, prev: number): number {
    let level: number;
    if (value > 57)      level = 10;
    else if (value > 54) level = 7;
    else if (value > 52) level = 5;
    else if (value > 50) level = 2;
    else if (value > 48) level = -2;
    else if (value > 45) level = -5;
    else                 level = -10;

    const delta    = value - prev;
    const momentum = delta > 1 ? 2 : delta < -1 ? -2 : 0;

    return clamp10(level + momentum);
}

/**
 * Rate differential: rank among the 8 currencies.
 * The highest rate = rank 1 = maximum score.
 */
export function scoreInterestRateDifferential(rate: number, allRates: number[]): number {
    const rank = allRates.filter(r => r > rate).length + 1;
    if (rank === 1) return 5;
    if (rank <= 3)  return 3;
    if (rank <= 5)  return 0;
    if (rank <= 7)  return -3;
    return -5;
}

/** Expected rate trajectory, derived from the central bank stance */
export function scoreRateTrajectory(stance: CurrencyData['stance']): number {
    switch (stance) {
        case 'Very Hawkish': return 5;
        case 'Hawkish':      return 3;
        case 'Neutral':      return 0;
        case 'Dovish':       return -3;
        case 'Very Dovish':  return -5;
        default:             return 0;
    }
}

/** Central bank orientation: -10 (Very Dovish) -> +10 (Very Hawkish) */
export function scoreCentralBankStance(stance: CurrencyData['stance']): number {
    switch (stance) {
        case 'Very Hawkish': return 10;
        case 'Hawkish':      return 5;
        case 'Neutral':      return 0;
        case 'Dovish':       return -5;
        case 'Very Dovish':  return -10;
        default:             return 0;
    }
}

/**
 * Full rate score = rank differential + expected trajectory.
 * It also factors in the attractiveness of the real rate
 * (nominal - inflation), which drives international capital flows.
 */
export function scoreRates(curr: CurrencyData, allRates: number[]): number {
    const diff = scoreInterestRateDifferential(curr.interestRate, allRates); // -5..+5
    const traj = scoreRateTrajectory(curr.stance);                           // -5..+5

    // Real rate: a positive real yield attracts capital
    const realRate = curr.interestRate - curr.cpi;
    let realScore: number;
    if (realRate > 2)        realScore = 10;
    else if (realRate >= 1)  realScore = 7;
    else if (realRate >= 0)  realScore = 3;
    else if (realRate >= -1) realScore = -3;
    else if (realRate >= -2) realScore = -7;
    else                     realScore = -10;

    // The differential/trajectory weighs 60%, the real rate 40%
    return clamp10((diff + traj) * 0.6 + realScore * 0.4);
}

/**
 * Inflation — three-way matrix seen from the central bank.
 * High AND rising inflation = hawkish CB = bullish for the currency.
 * Low AND falling inflation = dovish CB = bearish.
 */
export function scoreInflationValue(value: number, prev: number, target: number): number {
    const buffer = 0.5;
    const variation = value - prev;

    let level: 'HIGH' | 'TARGET' | 'LOW';
    if (value > target + buffer)      level = 'HIGH';
    else if (value < target - buffer) level = 'LOW';
    else                              level = 'TARGET';

    if (variation > 0.1) {
        if (level === 'HIGH')   return 10;  // accelerating from a high level = MAX HAWKISH
        if (level === 'TARGET') return 5;   // moderate acceleration
        return 2;                           // rebound towards the target
    }
    if (variation < -0.1) {
        if (level === 'HIGH')   return 3;   // disinflation from a high level
        if (level === 'TARGET') return -5;  // healthy disinflation = dovish
        return -10;                         // risky disinflation = MAX DOVISH
    }
    // Stable
    if (level === 'HIGH')   return 6;
    if (level === 'TARGET') return 0;       // goldilocks
    return -7;                              // low stagnation
}

/** Unemployment: gap to the NAIRU + momentum (falling = improving) */
export function scoreUnemployment(curr: CurrencyData): number {
    const nairu = NAIRU[curr.code] ?? 5.0;

    // Positive gap = tight labour market = wage pressure = hawkish
    const gap = nairu - curr.unemployment;
    let level: number;
    if (gap > 1.5)       level = 10;
    else if (gap > 0.5)  level = 5;
    else if (gap > -0.5) level = 0;
    else if (gap > -1.5) level = -5;
    else                 level = -10;

    const prev     = prevNum(curr, 'unemployment', curr.unemployment);
    const trend    = prev - curr.unemployment; // positive = unemployment is falling
    const momentum = trend > 0.2 ? 2 : trend < -0.2 ? -2 : 0;

    return clamp10(level + momentum);
}

/**
 * ZEW — German economic expectations (EUR).
 * Opinion index oscillating around 0: positive = investors expect an
 * improvement over 6 months. ±40 points saturate the score.
 */
export function scoreZewLevel(zew: number, prevZew: number): number {
    const level = clamp10((zew / 40) * 10);

    const delta    = zew - prevZew;
    const momentum = delta > 5 ? 2 : delta < -5 ? -2 : 0;

    return clamp10(level + momentum);
}

/**
 * ifo — German business climate (EUR).
 * Index with base 2015=100. The pivot is taken at 95: the post-2022
 * regime oscillates between 85 (marked weakness) and 95 (normalisation).
 */
export function scoreIfoLevel(ifo: number, prevIfo: number): number {
    const level = clamp10((ifo - 95) * 0.8);

    const delta    = ifo - prevIfo;
    const momentum = delta > 1 ? 2 : delta < -1 ? -2 : 0;

    return clamp10(level + momentum);
}

/**
 * UNIT OF THE wagePPI FIELD PER CURRENCY.
 *
 * This field does NOT carry the same unit everywhere: some countries
 * publish a MONTHLY change (~0.2-0.6%), others a YEARLY change
 * (~2-5%). Applying the monthly thresholds to yearly data saturates
 * the score at its maximum whatever the real value — hence this
 * explicit declaration, to be updated if a currency changes source.
 */
const WAGE_UNITS: Record<string, 'monthly' | 'annual'> = {
    USD: 'annual',   // Average Hourly Earnings, % YoY
    EUR: 'annual',   // ECB negotiated wages, quarterly in % YoY
    GBP: 'monthly',
    JPY: 'monthly',
    AUD: 'monthly',
    CAD: 'monthly',
    NZD: 'monthly',
    CHF: 'monthly',
};

/**
 * Wages as a YEARLY change, scored RELATIVE to the central bank target.
 *
 * A central bank tolerates a wage growth equal to its inflation target
 * plus productivity gains (~1%). Above that, wages feed inflation ->
 * hawkish CB -> bullish for the currency.
 *
 * Example: 2% target + 1% productivity = 3% of "neutral" wages.
 * USD at 3.5% -> slightly above · EUR at 2.46% -> below.
 */
export function scoreAnnualWages(wage: number, prevWage: number, target: number): number {
    const PRODUCTIVITY = 1.0;
    const neutral = target + PRODUCTIVITY;
    const gap     = wage - neutral;

    let level: number;
    if (gap > 2)         level = 9;   // wage-price spiral
    else if (gap > 1)    level = 6;
    else if (gap > 0.3)  level = 2;   // slightly inflationary
    else if (gap > -0.3) level = 0;   // comfort zone
    else if (gap > -1)   level = -3;  // lets the central bank ease
    else                 level = -7;  // marked wage weakness

    const trend = wage > prevWage ? 1 : wage < prevWage ? -1 : 0;

    return clamp10(level + trend);
}

/** Wages as a MONTHLY change: level + trend */
export function scoreMonthlyWages(wage: number, prevWage: number): number {
    let level: number;
    if (wage > 0.6)      level = 8;   // strong growth = tight market
    else if (wage > 0.4) level = 4;
    else if (wage > 0.2) level = 0;
    else if (wage >= 0)  level = -3;
    else                 level = -8;  // wage deflation

    const trend = wage > prevWage ? 1 : wage < prevWage ? -1 : 0;

    return clamp10(level + trend);
}

/** Wage growth — dispatches on the unit declared for the currency */
export function scoreWages(curr: CurrencyData, target: number): number {
    const prev = prevNum(curr, 'wagePPI', curr.wagePPI);
    return WAGE_UNITS[curr.code] === 'annual'
        ? scoreAnnualWages(curr.wagePPI, prev, target)
        : scoreMonthlyWages(curr.wagePPI, prev);
}

/**
 * Une balance extérieure mensuelle ramenée en % du PIB, annualisée.
 *
 * C'est ce qui rend deux devises comparables. Les balances sont stockées en
 * milliards de MONNAIE LOCALE : -363 pour le Japon (des yens) et -73 pour les
 * États-Unis (des dollars) décrivent des réalités trente fois différentes, et
 * une échelle absolue commune les mettait au même plancher. Rapportées au
 * PIB, elles deviennent -0,7% et -2,9% : sans unité, donc comparables, et
 * sans avoir besoin du moindre taux de change puisque la balance et le PIB
 * sont dans la même monnaie — le rapport l'élimine.
 *
 * Null quand le PIB manque : mieux vaut retirer l'indicateur du dénominateur
 * (voir weightedAverage) que le noter sur une échelle qui ne veut rien dire.
 */
export function externalBalancePctGdp(monthly: number, curr: CurrencyData): number | null {
    const gdp = curr.nominalGdp;
    if (typeof gdp !== 'number' || !Number.isFinite(gdp) || gdp <= 0) return null;
    return ((monthly * 12) / gdp) * 100;
}

/**
 * Note une balance extérieure déjà exprimée en % du PIB.
 *
 * Seuils calibrés sur ce que ces pourcentages valent réellement : la Suisse
 * tourne autour de +5,5%, les États-Unis autour de -2,9%, et la plupart des
 * autres entre -1% et +1,5%. Le momentum se compte désormais en POINTS de
 * pourcentage — un demi-point de PIB en un mois est déjà un mouvement franc,
 * là où l'ancien seuil de ±2 était exprimé en milliards bruts.
 */
export function scoreBalancePctGdp(pct: number, prevPct: number): number {
    let level: number;
    if (pct > 5)       level = 10;
    else if (pct > 2)  level = 6;
    else if (pct > 0)  level = 2;
    else if (pct > -2) level = -2;
    else if (pct > -5) level = -6;
    else               level = -10;

    const delta    = pct - prevPct;
    const momentum = delta > 0.5 ? 2 : delta < -0.5 ? -2 : 0;

    return clamp10(level + momentum);
}

/** Trade balance: niveau + momentum, en % du PIB */
export function scoreTradeBalance(curr: CurrencyData): number | null {
    const pct = externalBalancePctGdp(curr.tradeBalance, curr);
    if (pct === null) return null;

    const prevPct = externalBalancePctGdp(prevNum(curr, 'tradeBalance', curr.tradeBalance), curr);
    return scoreBalancePctGdp(pct, prevPct ?? pct);
}

// ================================================================
// RESOLVER — maps every indicator to its scoring function
// ================================================================

export interface ScoringInputs {
    curr: CurrencyData;
    allRates: number[];
    ctx: MarketContext;
    /** Raw USD score, needed by the CAD spillover (null on the 1st pass) */
    usdRawScore: number | null;
}

/**
 * Computes the directional score of a given indicator.
 * @returns [-10, +10] or `null` when the data is not available.
 */
export function scoreIndicator(id: string, inputs: ScoringInputs): number | null {
    const { curr, allRates, ctx, usdRawScore } = inputs;
    const kind   = indicatorKind(id);
    const target = BC_TARGETS[curr.code] ?? 2.0;

    switch (kind) {

        // ── Monetary policy ──────────────────────────────────────
        case 'taux':
            return scoreRates(curr, allRates);

        case 'orientation':
            return scoreCentralBankStance(curr.stance);

        // ── Inflation ────────────────────────────────────────────
        case 'cpi':
        case 'hicp':
            return scoreInflationValue(curr.cpi, prevNum(curr, 'cpi', curr.cpi), target);

        case 'core_cpi':
        case 'core_hicp': {
            const coreCpiScore = scoreInflationValue(curr.coreCpi, prevNum(curr, 'coreCpi', curr.coreCpi), target);
            // USD: this line combines Core CPI and Core PCE (the Fed's preferred gauge)
            if (typeof curr.corePce === 'number') {
                const corePceScore = scoreInflationValue(curr.corePce, prevNum(curr, 'corePce', curr.corePce), target);
                return clamp10((coreCpiScore + corePceScore) / 2);
            }
            return coreCpiScore;
        }

        case 'cpi_tokyo':
            // In Japan, inflation climbing back towards 2% justifies the exit
            // from ultra-low rates -> bullish for the yen.
            return typeof curr.tokyoCpi === 'number'
                ? scoreTokyoCpiLevel(curr.tokyoCpi)
                : scoreTokyoCpi(ctx);

        // ── Growth ───────────────────────────────────────────────
        case 'pib':
            return scoreGdp(curr.gdpQoQ, prevNum(curr, 'gdpQoQ', curr.gdpQoQ));

        case 'pmi_manu':
            return scoreSinglePmi(curr.pmiManufacturing, prevNum(curr, 'pmiManufacturing', curr.pmiManufacturing));

        case 'pmi_serv':
            return scoreSinglePmi(curr.pmiServices, prevNum(curr, 'pmiServices', curr.pmiServices));

        case 'pmi': {
            // Composite = average of manufacturing + services
            const composite     = (curr.pmiManufacturing + curr.pmiServices) / 2;
            const prevComposite = (prevNum(curr, 'pmiManufacturing', curr.pmiManufacturing)
                                 + prevNum(curr, 'pmiServices', curr.pmiServices)) / 2;
            return scoreSinglePmi(composite, prevComposite);
        }

        case 'ivey':
            return scoreIvey(ctx);

        case 'kof':
            return scoreKof(ctx);

        case 'zew':
            return typeof curr.zew === 'number'
                ? scoreZewLevel(curr.zew, prevNum(curr, 'zew', curr.zew))
                : scoreZew(ctx);

        case 'ifo':
            return typeof curr.ifo === 'number'
                ? scoreIfoLevel(curr.ifo, prevNum(curr, 'ifo', curr.ifo))
                : null;

        case 'sentiment':
            // ZEW/IFO when provided, otherwise fall back on consumer confidence
            return scoreZew(ctx) ?? clamp10(curr.consumerConfidence / 5);

        // ── Employment ───────────────────────────────────────────
        case 'chomage':
            return scoreUnemployment(curr);

        case 'nfp':
            return typeof curr.nfp === 'number'
                ? scoreNfpLevel(curr.nfp, prevNum(curr, 'nfp', curr.nfp))
                : scoreNfp(ctx);

        case 'salaires':
            // The GBP has a dedicated (yearly) wage figure in the market context
            if (curr.code === 'GBP') return scoreGbWages(ctx) ?? scoreWages(curr, target);
            return scoreWages(curr, target);

        case 'emploi':
            // The currency's own Employment Change first, then the market
            // context, then a fallback on the unemployment rate.
            if (typeof curr.employmentChange === 'number') {
                return curr.code === 'NZD'
                    ? pctScore(curr.employmentChange, 1)            // NZ publishes a %
                    : scoreEmploymentChangeValue(curr.employmentChange); // AU/CA in thousands
            }
            if (curr.code === 'AUD') return scoreEmploymentChange(ctx.auEmploymentChange) ?? scoreUnemployment(curr);
            if (curr.code === 'CAD') return scoreEmploymentChange(ctx.caEmploymentChange) ?? scoreUnemployment(curr);
            if (curr.code === 'NZD') return scoreNzEmployment(ctx) ?? scoreUnemployment(curr);
            return scoreUnemployment(curr);

        // ── External trade ───────────────────────────────────────
        case 'balance':
            // Le Japon est piloté par son compte courant plus que par sa
            // balance commerciale — mais il passe par la MÊME échelle en % du
            // PIB que les sept autres. Il avait sa propre échelle en
            // milliards de yens (2500 / 1500 / -1000), correctement calibrée
            // mais incomparable avec celle des autres devises : le yen s'en
            // sortait par exception, pas par principe.
            if (curr.code === 'JPY' && ctx.jpCurrentAccount !== null) {
                const pct = externalBalancePctGdp(ctx.jpCurrentAccount, curr);
                if (pct !== null) return scoreBalancePctGdp(pct, pct);
            }
            return scoreTradeBalance(curr);

        case 'retail': {
            if (curr.code === 'USD') return scoreRetail(ctx.usRetailOverride) ?? scoreRetail(curr.retailSales);
            if (curr.code === 'GBP') return scoreRetail(ctx.gbRetail) ?? scoreRetail(curr.retailSales);
            return scoreRetail(curr.retailSales);
        }

        // ── Commodities ──────────────────────────────────────────
        // The currency's own data comes first; the global market context
        // is the fallback for as long as the API is not wired in.
        case 'petrole':
            // The barrel PRICE first: a level ladder plus momentum, like every
            // other scorer here. Reading only the % change (which is all the
            // market-context fallback below can offer) made a $45 barrel
            // rebounding 15% outrank a $90 one easing 8%.
            if (typeof curr.oilPrice === 'number') {
                return scoreOilLevel(curr.oilPrice, prevNum(curr, 'oilPrice', curr.oilPrice));
            }
            return typeof curr.commodityPrice === 'number'
                ? pctScore(curr.commodityPrice, 15)
                : scoreOil(ctx);

        case 'fer':
            return typeof curr.commodityPrice === 'number'
                ? pctScore(curr.commodityPrice, 15)
                : scoreIronOre(ctx);

        case 'laitiers':
            return typeof curr.commodityPrice === 'number'
                ? pctScore(curr.commodityPrice, 10)
                : scoreDairy(ctx);

        // ── External factors ─────────────────────────────────────
        case 'chine':
            return typeof curr.chinaDemand === 'number'
                ? scoreChinaLevel(curr.chinaDemand, prevNum(curr, 'chinaDemand', curr.chinaDemand))
                : scoreChina(ctx);

        case 'risque': {
            // Safe havens: risk-off = bullish · pro-cyclicals: the opposite
            if (typeof curr.riskSentiment === 'number') {
                const intensity = riskOffFromVix(curr.riskSentiment, prevNum(curr, 'riskSentiment', curr.riskSentiment));
                return SAFE_HAVEN_CODES.includes(curr.code) ? intensity : -intensity;
            }
            return SAFE_HAVEN_CODES.includes(curr.code)
                ? scoreRiskSafeHaven(ctx)
                : scoreRiskProCyclical(ctx);
        }

        case 'us':
            // A US activity index takes priority; failing that, transmission
            // from the raw USD score (always available).
            return typeof curr.usSpillover === 'number'
                ? pctScore(curr.usSpillover, 50)
                : scoreUsSpillover(usdRawScore);

        case 'eurchf':
            // NEGATIVE correlation: a DROP of EUR/CHF means the franc is
            // appreciating (inbound flows) -> bullish for the CHF.
            return typeof curr.eurChf === 'number'
                ? -pctScore(curr.eurChf, 3)
                : scoreEurChfFlows(ctx);

        case 'interventions': {
            // Combines the SNB orientation and its action on the FX market.
            // The stance is always known; the intervention refines it when
            // the data is available.
            const stanceScore = scoreCentralBankStance(curr.stance);
            const interv      = scoreSnbIntervention(ctx);
            return interv === null ? stanceScore : clamp10(stanceScore * 0.5 + interv * 0.5);
        }

        default:
            return null;
    }
}

// ================================================================
// AGGREGATION FOR THE RADAR CHART (Comparator)
//
// The radar expects 7 fixed axes. They are rebuilt by grouping the
// indicators of the profile by family, each axis being the weighted
// average of the available indicators of its family.
// ================================================================

const RADAR_FAMILIES = {
    growth:     ['pib'],
    inflation:  ['cpi', 'hicp', 'core_cpi', 'core_hicp', 'cpi_tokyo'],
    employment: ['chomage', 'emploi', 'salaires', 'nfp'],
    trade:      ['balance', 'petrole', 'fer', 'laitiers', 'eurchf'],
    monetary:   ['taux', 'orientation', 'interventions'],
    pmi:        ['pmi', 'pmi_manu', 'pmi_serv', 'ivey', 'kof'],
    sentiment:  ['risque', 'chine', 'us', 'sentiment', 'retail', 'zew', 'ifo'],
} as const;

/** Weighted average of the indicators of a family (0 when none is available) */
export function familyScore(breakdown: IndicatorScore[], kinds: readonly string[]): number {
    let sum = 0;
    let weight = 0;
    breakdown.forEach(ind => {
        if (!ind.disponible || ind.score === null) return;
        if (!kinds.includes(indicatorKind(ind.id))) return;
        sum    += ind.score * ind.poids;
        weight += ind.poids;
    });
    return weight === 0 ? 0 : Math.round(sum / weight);
}

// ================================================================
// WEIGHTED AVERAGE — THE EXCLUSION RULE
// ================================================================

/** Minimal shape needed to take part in the weighted average */
export interface WeightedScore {
    score: number | null;
    poids: number;
    disponible: boolean;
}

/**
 * Weighted average of the available indicators only.
 *
 * THE most important rule of the engine: an indicator whose data is
 * unavailable is EXCLUDED, i.e. its weight never enters the
 * denominator. Counting it as 0 instead would drag every score
 * towards the neutral point.
 *
 * Σw = 0 means no usable data at all -> neutral score (0).
 */
export function weightedAverage(items: readonly WeightedScore[]): number {
    let weightedSum = 0;
    let totalWeightUsed = 0;
    items.forEach(ind => {
        if (!ind.disponible || ind.score === null) return;
        weightedSum    += ind.score * ind.poids;
        totalWeightUsed += ind.poids;
    });
    return totalWeightUsed === 0 ? 0 : weightedSum / totalWeightUsed;
}

/** Sum of the weights of the available indicators */
export function usedWeight(items: readonly WeightedScore[]): number {
    return items.reduce(
        (sum, ind) => (ind.disponible && ind.score !== null ? sum + ind.poids : sum),
        0,
    );
}

/**
 * Normalisation of a raw [-10, +10] score towards 0-100.
 * -10 -> 0 · 0 -> 50 · +10 -> 100
 */
export function normalizeScore(rawTotal: number): number {
    return Math.max(0, Math.min(100, Math.round(((rawTotal + 10) / 20) * 100)));
}

// ================================================================
// SCORE OF A SINGLE CURRENCY
// ================================================================

/**
 * Computes the full score of a currency according to ITS OWN
 * weighting profile.
 *
 * @param curr        Macro data of the currency
 * @param allRates    Policy rates of the 8 currencies (for the differential rank)
 * @param ctx         Market context (specific indicators)
 * @param usdRawScore Raw USD score — required by the CAD spillover
 */
export function calculateInstitutionalScore(
    curr: CurrencyData,
    allRates: number[],
    ctx: MarketContext = EMPTY_MARKET_CONTEXT,
    usdRawScore: number | null = null,
): ScoreData {
    const profile = getCurrencyProfile(curr.code);
    const inputs: ScoringInputs = { curr, allRates, ctx, usdRawScore };

    // ── Score of every indicator of the profile ──────────────────
    const breakdown: IndicatorScore[] = (profile?.indicateurs ?? []).map(ind => {
        const score = scoreIndicator(ind.id, inputs);
        return {
            id:         ind.id,
            nom:        ind.nom,
            poids:      ind.poids,
            specifique: ind.specifique ?? false,
            score:      score === null ? null : Math.round(score * 100) / 100,
            disponible: score !== null,
        };
    });

    // Sorted by descending weight — the display order in the UI
    breakdown.sort((a, b) => b.poids - a.poids);

    // ── Weighted average, unavailable indicators excluded ────────
    const rawTotal   = weightedAverage(breakdown);
    const sommePoids = usedWeight(breakdown);

    // ── Normalisation towards 0-100 ──────────────────────────────
    const total = normalizeScore(rawTotal);

    // ── Real rate (for display) ──────────────────────────────────
    const realRate = parseFloat((curr.interestRate - curr.cpi).toFixed(2));

    return {
        // Radar chart axes, rebuilt from the breakdown
        growth:     familyScore(breakdown, RADAR_FAMILIES.growth),
        inflation:  familyScore(breakdown, RADAR_FAMILIES.inflation),
        employment: familyScore(breakdown, RADAR_FAMILIES.employment),
        trade:      familyScore(breakdown, RADAR_FAMILIES.trade),
        monetary:   familyScore(breakdown, RADAR_FAMILIES.monetary),
        pmi:        familyScore(breakdown, RADAR_FAMILIES.pmi),
        sentiment:  familyScore(breakdown, RADAR_FAMILIES.sentiment),

        // Totals
        rawTotal: Math.round(rawTotal * 100) / 100,
        total,
        realRate,

        // Per-indicator detail — feeds the score table
        breakdown,
        moteurN1:        profile?.moteurN1 ?? '',
        particularite:   profile?.particularite,
        banqueCentrale:  profile?.banqueCentrale ?? '',
        poidsUtilise:    sommePoids,
        poidsTotal:      (profile?.indicateurs ?? []).reduce((s, i) => s + i.poids, 0),
    };
}

// ================================================================
// BATCH COMPUTATION — EVERY CURRENCY
//
// Two passes are required:
//   1. Compute the USD (no external dependency)
//   2. Compute the 7 others, the CAD consuming the raw USD score for
//      its economic spillover indicator.
// ================================================================

export function calculateAllScores(
    currencies: Record<string, CurrencyData>,
    ctx: MarketContext = EMPTY_MARKET_CONTEXT,
): Record<string, CurrencyWithScore> {
    const allRates = Object.values(currencies).map(c => c.interestRate);

    // ── Pass 1: the USD, which the CAD depends on ────────────────
    let usdRawScore: number | null = null;
    const usd = Object.values(currencies).find(c => c.code === 'USD');
    if (usd) {
        usdRawScore = calculateInstitutionalScore(usd, allRates, ctx, null).rawTotal;
    }

    // ── Pass 2: every currency ───────────────────────────────────
    const result: Record<string, CurrencyWithScore> = {};
    Object.entries(currencies).forEach(([key, currency]) => {
        result[key] = {
            ...currency,
            scores: calculateInstitutionalScore(currency, allRates, ctx, usdRawScore),
        };
    });

    return result;
}

// ================================================================
// VERDICT
//
// Seuils de la méthodologie (CLAUDE.md) :
//   80-100 Strong Buy · 65-79 Buy · 45-64 Neutral · 25-44 Sell · 0-24 Strong Sell
//
// Ils valaient 70/60/45/30 jusqu'au 2026-08-19, et deux tables se
// contredisaient dans le même projet : celle-ci, qui alimente le tableau de
// bord, les pages devise, le comparateur et les profils, et celle de
// `domain/charts/timeframes.ts`, conforme à la méthodologie mais utilisée par
// le seul écran Graphiques.
//
// Le symptôme était visible sous la courbe d'une devise à 71 : la légende
// annonçait « Achat fort » quand les bandes du même graphique plaçaient 71
// dans « Achat ». Quatre devises sur huit changeaient de verdict selon
// l'écran consulté — sur un tableau dont la seule raison d'être est de dire
// quoi acheter et quoi vendre.
//
// Arbitré en faveur de la méthodologie écrite, qui est la référence.
// ================================================================

export function getScoreLabel(score: number): string {
    if (score >= 80) return 'Strong Buy';
    if (score >= 65) return 'Buy';
    if (score >= 45) return 'Neutral';
    if (score >= 25) return 'Sell';
    return 'Strong Sell';
}
