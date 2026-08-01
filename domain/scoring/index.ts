// ================================================================
// PUBLIC SURFACE OF THE SCORING DOMAIN
// ================================================================

export {
    // Batch + single currency
    calculateAllScores,
    calculateInstitutionalScore,
    scoreIndicator,

    // Aggregation and normalisation
    weightedAverage,
    usedWeight,
    normalizeScore,
    familyScore,
    getScoreLabel,

    // Per-indicator scorers
    scoreRates,
    scoreInterestRateDifferential,
    scoreRateTrajectory,
    scoreCentralBankStance,
    scoreInflationValue,
    scoreUnemployment,
    scoreGdp,
    scoreSinglePmi,
    scoreNfpLevel,
    scoreZewLevel,
    scoreIfoLevel,
    scoreAnnualWages,
    scoreMonthlyWages,
    scoreWages,
    scoreTradeBalance,
    scoreTokyoCpiLevel,
    scoreChinaLevel,
    riskOffFromVix,

    // Helpers
    clamp10,
    pctScore,
    prevNum,
} from './engine';

export type { ScoringInputs, WeightedScore } from './engine';

export { getIndicatorDisplay } from './indicator-display';
export type { IndicatorDisplay } from './indicator-display';

export {
    CURRENCY_WEIGHTS,
    getCurrencyProfile,
    indicatorKind,
    totalWeight,
} from '../data/currency-weights';
export type { CurrencyProfile, WeightedIndicator } from '../data/currency-weights';

export { EMPTY_MARKET_CONTEXT, createMarketContext, MARKET_FIELDS } from '../market-context/context';
