import { describe, it, expect } from 'vitest';

import type { CurrencyData, IndicatorScore, MarketContext, ScoreData } from '../types';
import { EMPTY_MARKET_CONTEXT, createMarketContext } from '../market-context/context';
import { CURRENCY_WEIGHTS, totalWeight } from '../data/currency-weights';
import {
    calculateAllScores,
    calculateInstitutionalScore,
    clamp10,
    familyScore,
    getScoreLabel,
    normalizeScore,
    pctScore,
    prevNum,
    riskOffFromVix,
    scoreAnnualWages,
    scoreCentralBankStance,
    scoreChinaLevel,
    scoreGdp,
    scoreIfoLevel,
    scoreIndicator,
    scoreInflationValue,
    scoreInterestRateDifferential,
    scoreMonthlyWages,
    scoreNfpLevel,
    scoreRateTrajectory,
    scoreRates,
    scoreSinglePmi,
    scoreTokyoCpiLevel,
    scoreTradeBalance,
    scoreUnemployment,
    scoreWages,
    scoreZewLevel,
    usedWeight,
    weightedAverage,
} from './engine';

// ================================================================
// FIXTURES
// ================================================================

/** Policy rates of 8 currencies, strictly decreasing — used for the rank */
const RATES = [5, 4.5, 4, 3.5, 3, 2, 1, 0.5];

function makeCurrency(overrides: Partial<CurrencyData> = {}): CurrencyData {
    return {
        code: 'USD',
        name: 'US Dollar',
        countryCode: '',
        interestRate: 3,
        stance: 'Neutral',
        category: 'Neutral',
        gdpQoQ: 0.5,
        pmiManufacturing: 50,
        pmiServices: 50,
        cpi: 2,
        coreCpi: 2,
        ppi: 0,
        unemployment: 4,
        retailSales: 0,
        wagePPI: 0.3,
        tradeBalance: 0,
        currentAccount: 0,
        consumerConfidence: 0,
        // Échelle des balances, pas indicateur noté : présente pour les huit
        // devises en production, donc présente ici aussi. 1200 rend la
        // lecture directe — une balance de X milliards vaut X% du PIB.
        nominalGdp: 1200,
        geopoliticalRisks: '',
        eventsToWatch: [],
        qualitativeAnalysis: '',
        lastUpdate: '',
        nextReleases: {},
        previousData: {},
        dataSources: {},
        staleFields: {},
        checks: {},
        ...overrides,
    };
}

/** A currency populated with every optional indicator the engine can read */
function makeFullCurrency(code: string, overrides: Partial<CurrencyData> = {}): CurrencyData {
    return makeCurrency({
        code,
        nfp: 180,
        corePce: 2.4,
        zew: 12,
        ifo: 92,
        employmentChange: code === 'NZD' ? 0.4 : 30,
        commodityPrice: 5,
        chinaDemand: 51,
        riskSentiment: 24,
        usSpillover: 10,
        tokyoCpi: 2.6,
        eurChf: -0.5,
        ...overrides,
    });
}

/** A market context in which every specific indicator is available */
function makeFullContext(overrides: Partial<MarketContext> = {}): MarketContext {
    return createMarketContext({
        oilChangePct: 7.5,
        ironOreChangePct: -3,
        dairyGdtChangePct: 4,
        chinaPmi: 51.5,
        chinaPmiPrev: 50.5,
        vix: 24,
        vixPrev: 19,
        eurChfChangePct: -1.5,
        snbIntervention: 'aucune',
        usNfp: 210,
        usNfpPrev: 150,
        usRetailOverride: 0.4,
        euZew: 20,
        euZewPrev: 10,
        gbWageGrowth: 5,
        gbRetail: -0.2,
        jpTokyoCpi: 2.8,
        jpCurrentAccount: 1800,
        auEmploymentChange: 35,
        caEmploymentChange: -12,
        caIveyPmi: 54,
        nzEmploymentChange: 0.6,
        chKof: 103,
        ...overrides,
    });
}

/** Reads the breakdown without a non-null assertion */
function breakdownOf(scores: ScoreData): IndicatorScore[] {
    const breakdown = scores.breakdown;
    if (breakdown === undefined) throw new Error('breakdown is missing');
    return breakdown;
}

function indicatorOf(scores: ScoreData, id: string): IndicatorScore {
    const found = breakdownOf(scores).find(i => i.id === id);
    if (found === undefined) throw new Error(`indicator ${id} is missing from the breakdown`);
    return found;
}

function scoreOf(scores: ScoreData, id: string): number {
    const score = indicatorOf(scores, id).score;
    if (score === null) throw new Error(`indicator ${id} has no score`);
    return score;
}

/** Set of the 8 currencies, keyed by code, ready for calculateAllScores */
function makeAllCurrencies(overrides: Record<string, Partial<CurrencyData>> = {}): Record<string, CurrencyData> {
    const codes = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF'];
    const result: Record<string, CurrencyData> = {};
    codes.forEach((code, i) => {
        result[code] = makeCurrency({ code, interestRate: RATES[i] ?? 0, ...overrides[code] });
    });
    return result;
}

// ================================================================
// HELPERS
// ================================================================

describe('clamp10 / pctScore', () => {
    it('bounds the score inside [-10, +10]', () => {
        expect(clamp10(0)).toBe(0);
        expect(clamp10(10)).toBe(10);
        expect(clamp10(-10)).toBe(-10);
        expect(clamp10(999)).toBe(10);
        expect(clamp10(-999)).toBe(-10);
    });

    it('scales a % change against its full scale and saturates at ±10', () => {
        expect(pctScore(0, 15)).toBe(0);
        expect(pctScore(7.5, 15)).toBe(5);
        expect(pctScore(15, 15)).toBe(10);
        expect(pctScore(30, 15)).toBe(10);
        expect(pctScore(-15, 15)).toBe(-10);
        expect(pctScore(-30, 15)).toBe(-10);
    });
});

describe('prevNum', () => {
    it('reads a numeric previous value', () => {
        const curr = makeCurrency({ previousData: { cpi: 1.8 } });
        expect(prevNum(curr, 'cpi', 99)).toBe(1.8);
    });

    it('falls back when the key is absent or not numeric', () => {
        const curr = makeCurrency({ previousData: { cpi: 'n/a' } });
        expect(prevNum(curr, 'cpi', 99)).toBe(99);
        expect(prevNum(curr, 'unknown', 42)).toBe(42);
    });
});

// ================================================================
// INDIVIDUAL SCORERS
// ================================================================

describe('scoreGdp', () => {
    it('scores below the range, at the neutral point and above the range', () => {
        expect(scoreGdp(-3, -3)).toBe(-10);   // deep contraction
        expect(scoreGdp(0, 0)).toBe(0);       // neutral point of the ladder
        expect(scoreGdp(4, 4)).toBe(10);      // strong expansion
    });

    it('walks every rung of the ladder', () => {
        expect(scoreGdp(3.5, 3.5)).toBe(10);
        expect(scoreGdp(2.5, 2.5)).toBe(7);
        expect(scoreGdp(1.5, 1.5)).toBe(3);
        expect(scoreGdp(1, 1)).toBe(0);
        expect(scoreGdp(-0.5, -0.5)).toBe(-3);
        expect(scoreGdp(-1.5, -1.5)).toBe(-7);
        expect(scoreGdp(-2.5, -2.5)).toBe(-10);
    });

    it('adds ±2 of momentum and clamps at the boundaries', () => {
        expect(scoreGdp(1.5, 0.5)).toBe(5);    // 3 + 2
        expect(scoreGdp(1.5, 2.5)).toBe(1);    // 3 - 2
        expect(scoreGdp(4, 1)).toBe(10);       // 10 + 2 clamped
        expect(scoreGdp(-3, 0)).toBe(-10);     // -10 - 2 clamped
    });
});

describe('scoreSinglePmi', () => {
    it('scores below, at and above the 50 threshold', () => {
        expect(scoreSinglePmi(44, 44)).toBe(-10);
        // 50 exactly is NOT counted as neutral: the ladder uses a strict > 50
        expect(scoreSinglePmi(50, 50)).toBe(-2);
        expect(scoreSinglePmi(58, 58)).toBe(10);
    });

    it('walks every rung of the ladder', () => {
        expect(scoreSinglePmi(55, 55)).toBe(7);
        expect(scoreSinglePmi(53, 53)).toBe(5);
        expect(scoreSinglePmi(51, 51)).toBe(2);
        expect(scoreSinglePmi(49, 49)).toBe(-2);
        expect(scoreSinglePmi(46, 46)).toBe(-5);
    });

    it('adds ±2 of momentum and clamps', () => {
        expect(scoreSinglePmi(53, 51)).toBe(7);     // 5 + 2
        expect(scoreSinglePmi(53, 55)).toBe(3);     // 5 - 2
        expect(scoreSinglePmi(58, 50)).toBe(10);    // clamped
        expect(scoreSinglePmi(44, 50)).toBe(-10);   // clamped
    });
});

describe('scoreNfpLevel', () => {
    it('scores below, around the 150k equilibrium pace and above', () => {
        expect(scoreNfpLevel(-20, -20)).toBe(-10);  // net job destructions
        expect(scoreNfpLevel(120, 120)).toBe(0);    // equilibrium band
        expect(scoreNfpLevel(350, 350)).toBe(10);
    });

    it('walks every rung of the ladder', () => {
        expect(scoreNfpLevel(250, 250)).toBe(7);
        expect(scoreNfpLevel(160, 160)).toBe(4);
        expect(scoreNfpLevel(80, 80)).toBe(-4);
        expect(scoreNfpLevel(20, 20)).toBe(-7);
        expect(scoreNfpLevel(0, 0)).toBe(-10);
    });

    it('adds ±2 of momentum beyond a 50k swing and clamps', () => {
        expect(scoreNfpLevel(160, 100)).toBe(6);    // 4 + 2
        expect(scoreNfpLevel(160, 220)).toBe(2);    // 4 - 2
        expect(scoreNfpLevel(350, 100)).toBe(10);   // clamped
        expect(scoreNfpLevel(-20, 200)).toBe(-10);  // clamped
    });
});

describe('scoreInflationValue', () => {
    const TARGET = 2;

    it('is a three-way matrix of level x direction', () => {
        // HIGH
        expect(scoreInflationValue(3, 2.5, TARGET)).toBe(10);   // rising from a high level
        expect(scoreInflationValue(3, 3, TARGET)).toBe(6);      // stable and high
        expect(scoreInflationValue(3, 3.5, TARGET)).toBe(3);    // disinflation from a high level
        // TARGET
        expect(scoreInflationValue(2.4, 2.2, TARGET)).toBe(5);
        expect(scoreInflationValue(2, 2, TARGET)).toBe(0);      // goldilocks
        expect(scoreInflationValue(2, 2.3, TARGET)).toBe(-5);
        // LOW
        expect(scoreInflationValue(1, 0.5, TARGET)).toBe(2);    // rebound towards the target
        expect(scoreInflationValue(1, 1, TARGET)).toBe(-7);     // low stagnation
        expect(scoreInflationValue(1, 1.5, TARGET)).toBe(-10);  // risky disinflation
    });

    it('uses a ±0.5 buffer around the target', () => {
        expect(scoreInflationValue(2.5, 2.5, TARGET)).toBe(0);   // still TARGET
        expect(scoreInflationValue(2.51, 2.51, TARGET)).toBe(6); // HIGH
        expect(scoreInflationValue(1.5, 1.5, TARGET)).toBe(0);   // still TARGET
        expect(scoreInflationValue(1.49, 1.49, TARGET)).toBe(-7);// LOW
    });

    it('ignores variations smaller than 0.1', () => {
        expect(scoreInflationValue(2.05, 2, TARGET)).toBe(0);
        expect(scoreInflationValue(2, 2.05, TARGET)).toBe(0);
    });

    it('honours a non-2% target (CHF = 1%)', () => {
        expect(scoreInflationValue(1, 1, 1)).toBe(0);     // at the SNB target
        expect(scoreInflationValue(2, 2, 1)).toBe(6);     // high for the SNB
    });
});

describe('scoreUnemployment', () => {
    it('scores against the NAIRU of the country', () => {
        // USD NAIRU = 4.0
        expect(scoreUnemployment(makeCurrency({ code: 'USD', unemployment: 2 }))).toBe(10);
        expect(scoreUnemployment(makeCurrency({ code: 'USD', unemployment: 4 }))).toBe(0);
        expect(scoreUnemployment(makeCurrency({ code: 'USD', unemployment: 6 }))).toBe(-10);
        // EUR NAIRU = 6.5 -> the very same 5.5% is a tight market there
        expect(scoreUnemployment(makeCurrency({ code: 'EUR', unemployment: 5.5 }))).toBe(5);
        // ... while for the USD (NAIRU 4.0) it is a loose one
        expect(scoreUnemployment(makeCurrency({ code: 'USD', unemployment: 5.5 }))).toBe(-10);
    });

    it('walks the intermediate rungs', () => {
        expect(scoreUnemployment(makeCurrency({ unemployment: 3.4 }))).toBe(5);
        expect(scoreUnemployment(makeCurrency({ unemployment: 5 }))).toBe(-5);
    });

    it('adds momentum when unemployment moves by more than 0.2', () => {
        const falling = makeCurrency({ unemployment: 3.4, previousData: { unemployment: 3.8 } });
        expect(scoreUnemployment(falling)).toBe(7);   // 5 + 2
        const rising = makeCurrency({ unemployment: 3.4, previousData: { unemployment: 3 } });
        expect(scoreUnemployment(rising)).toBe(3);    // 5 - 2
    });

    it('clamps at the boundaries and defaults the NAIRU for unknown codes', () => {
        const worst = makeCurrency({ unemployment: 8, previousData: { unemployment: 7 } });
        expect(scoreUnemployment(worst)).toBe(-10);
        const best = makeCurrency({ unemployment: 1, previousData: { unemployment: 2 } });
        expect(scoreUnemployment(best)).toBe(10);
        // Unknown code -> NAIRU fallback of 5.0
        expect(scoreUnemployment(makeCurrency({ code: 'XXX', unemployment: 5 }))).toBe(0);
    });
});

describe('scoreCentralBankStance / scoreRateTrajectory', () => {
    it('maps the five stances symmetrically', () => {
        expect(scoreCentralBankStance('Very Hawkish')).toBe(10);
        expect(scoreCentralBankStance('Hawkish')).toBe(5);
        expect(scoreCentralBankStance('Neutral')).toBe(0);
        expect(scoreCentralBankStance('Dovish')).toBe(-5);
        expect(scoreCentralBankStance('Very Dovish')).toBe(-10);

        expect(scoreRateTrajectory('Very Hawkish')).toBe(5);
        expect(scoreRateTrajectory('Hawkish')).toBe(3);
        expect(scoreRateTrajectory('Neutral')).toBe(0);
        expect(scoreRateTrajectory('Dovish')).toBe(-3);
        expect(scoreRateTrajectory('Very Dovish')).toBe(-5);
    });
});

describe('scoreInterestRateDifferential', () => {
    it('ranks the currency against every other policy rate', () => {
        expect(scoreInterestRateDifferential(5, RATES)).toBe(5);      // rank 1
        expect(scoreInterestRateDifferential(4.5, RATES)).toBe(3);    // rank 2
        expect(scoreInterestRateDifferential(4, RATES)).toBe(3);      // rank 3
        expect(scoreInterestRateDifferential(3.5, RATES)).toBe(0);    // rank 4
        expect(scoreInterestRateDifferential(3, RATES)).toBe(0);      // rank 5
        expect(scoreInterestRateDifferential(2, RATES)).toBe(-3);     // rank 6
        expect(scoreInterestRateDifferential(1, RATES)).toBe(-3);     // rank 7
        expect(scoreInterestRateDifferential(0.5, RATES)).toBe(-5);   // rank 8
    });

    it('gives tied rates the same (best) rank', () => {
        const tied = [5, 5, 4, 3, 2, 1, 0.5, 0.25];
        expect(scoreInterestRateDifferential(5, tied)).toBe(5);
        expect(scoreInterestRateDifferential(4, tied)).toBe(3);
    });

    it('is relative: the same rate scores differently in a different set', () => {
        expect(scoreInterestRateDifferential(3, [1, 2, 3])).toBe(5);   // top of the set
        expect(scoreInterestRateDifferential(3, RATES)).toBe(0);       // mid-table
    });
});

describe('scoreRates', () => {
    it('blends the rank differential, the trajectory and the real rate', () => {
        // rank 5 -> 0 · Neutral -> 0 · real rate 1% -> 7
        const mid = makeCurrency({ interestRate: 3, cpi: 2, stance: 'Neutral' });
        expect(scoreRates(mid, RATES)).toBeCloseTo(0 * 0.6 + 7 * 0.4, 10);
    });

    it('saturates at +10 for the best possible configuration', () => {
        const best = makeCurrency({ interestRate: 5, cpi: 0, stance: 'Very Hawkish' });
        expect(scoreRates(best, RATES)).toBe(10);
    });

    it('saturates at -10 for the worst possible configuration', () => {
        const worst = makeCurrency({ interestRate: 0.5, cpi: 6, stance: 'Very Dovish' });
        expect(scoreRates(worst, RATES)).toBe(-10);
    });

    it('walks the real-rate ladder', () => {
        const at = (rate: number, cpi: number): number =>
            scoreRates(makeCurrency({ interestRate: rate, cpi, stance: 'Neutral' }), [rate, rate, rate, rate, rate]);
        // Every peer holds the same rate -> rank 1 -> diff = 5, traj = 0
        expect(at(3, 0.5)).toBeCloseTo(5 * 0.6 + 10 * 0.4, 10);   // real 2.5
        expect(at(3, 2)).toBeCloseTo(5 * 0.6 + 7 * 0.4, 10);      // real 1
        expect(at(3, 2.5)).toBeCloseTo(5 * 0.6 + 3 * 0.4, 10);    // real 0.5
        expect(at(3, 3.5)).toBeCloseTo(5 * 0.6 - 3 * 0.4, 10);    // real -0.5
        expect(at(3, 4.5)).toBeCloseTo(5 * 0.6 - 7 * 0.4, 10);    // real -1.5
        expect(at(3, 6)).toBeCloseTo(5 * 0.6 - 10 * 0.4, 10);     // real -3
    });
});

describe('scoreZewLevel', () => {
    it('saturates at ±40 index points', () => {
        expect(scoreZewLevel(0, 0)).toBe(0);
        expect(scoreZewLevel(40, 40)).toBe(10);
        expect(scoreZewLevel(-40, -40)).toBe(-10);
        expect(scoreZewLevel(100, 100)).toBe(10);
        expect(scoreZewLevel(-100, -100)).toBe(-10);
        expect(scoreZewLevel(20, 20)).toBe(5);
    });

    it('adds momentum beyond a 5 point swing', () => {
        expect(scoreZewLevel(20, 10)).toBe(7);
        expect(scoreZewLevel(20, 30)).toBe(3);
        expect(scoreZewLevel(20, 25)).toBe(5);   // exactly 5 -> no momentum
    });
});

describe('scoreIfoLevel', () => {
    it('pivots at 95 and saturates', () => {
        expect(scoreIfoLevel(95, 95)).toBe(0);
        expect(scoreIfoLevel(100, 100)).toBe(4);
        expect(scoreIfoLevel(85, 85)).toBe(-8);
        expect(scoreIfoLevel(120, 120)).toBe(10);
        expect(scoreIfoLevel(70, 70)).toBe(-10);
    });

    it('adds momentum beyond a 1 point swing and clamps', () => {
        expect(scoreIfoLevel(100, 98)).toBe(6);
        expect(scoreIfoLevel(100, 102)).toBe(2);
        expect(scoreIfoLevel(120, 100)).toBe(10);
        expect(scoreIfoLevel(70, 90)).toBe(-10);
    });
});

describe('wages', () => {
    it('scores annual wages relative to target + 1% of productivity', () => {
        // target 2 -> neutral wage growth = 3%
        expect(scoreAnnualWages(3, 3, 2)).toBe(0);        // comfort zone
        expect(scoreAnnualWages(5.5, 5.5, 2)).toBe(9);    // wage-price spiral
        expect(scoreAnnualWages(4.5, 4.5, 2)).toBe(6);
        expect(scoreAnnualWages(3.5, 3.5, 2)).toBe(2);
        expect(scoreAnnualWages(2.5, 2.5, 2)).toBe(-3);
        expect(scoreAnnualWages(1, 1, 2)).toBe(-7);
    });

    it('adds ±1 of trend to annual wages', () => {
        expect(scoreAnnualWages(5.5, 5, 2)).toBe(10);     // 9 + 1
        expect(scoreAnnualWages(5.5, 6, 2)).toBe(8);      // 9 - 1
        expect(scoreAnnualWages(1, 0.5, 2)).toBe(-6);     // -7 + 1
    });

    it('scores monthly wages on their own ladder', () => {
        expect(scoreMonthlyWages(0.7, 0.7)).toBe(8);
        expect(scoreMonthlyWages(0.5, 0.5)).toBe(4);
        expect(scoreMonthlyWages(0.3, 0.3)).toBe(0);
        expect(scoreMonthlyWages(0.1, 0.1)).toBe(-3);
        expect(scoreMonthlyWages(-0.1, -0.1)).toBe(-8);   // wage deflation
        expect(scoreMonthlyWages(0.7, 0.5)).toBe(9);
        expect(scoreMonthlyWages(-0.1, 0.5)).toBe(-9);
    });

    it('dispatches on the declared unit of the currency', () => {
        // USD publishes a YEARLY figure: 3.5% is only slightly inflationary
        const usd = makeCurrency({ code: 'USD', wagePPI: 3.5, previousData: { wagePPI: 3.5 } });
        expect(scoreWages(usd, 2)).toBe(2);
        // The same 3.5 read as a MONTHLY figure saturates the monthly ladder
        const gbp = makeCurrency({ code: 'GBP', wagePPI: 3.5, previousData: { wagePPI: 3.5 } });
        expect(scoreWages(gbp, 2)).toBe(8);
    });
});

describe('scoreTradeBalance', () => {
    // Un PIB de 1200 rend la lecture directe : une balance mensuelle de X
    // milliards vaut X% du PIB annualisé (X * 12 / 1200 * 100 = X).
    const GDP = 1200;

    it('walks the ladder and applies momentum', () => {
        expect(scoreTradeBalance(makeCurrency({ tradeBalance: 6, nominalGdp: GDP }))).toBe(10);
        expect(scoreTradeBalance(makeCurrency({ tradeBalance: 3, nominalGdp: GDP }))).toBe(6);
        expect(scoreTradeBalance(makeCurrency({ tradeBalance: 1, nominalGdp: GDP }))).toBe(2);
        expect(scoreTradeBalance(makeCurrency({ tradeBalance: 0, nominalGdp: GDP }))).toBe(-2);
        expect(scoreTradeBalance(makeCurrency({ tradeBalance: -3, nominalGdp: GDP }))).toBe(-6);
        expect(scoreTradeBalance(makeCurrency({ tradeBalance: -6, nominalGdp: GDP }))).toBe(-10);

        expect(scoreTradeBalance(makeCurrency({ tradeBalance: 3, nominalGdp: GDP, previousData: { tradeBalance: 1 } }))).toBe(8);
        expect(scoreTradeBalance(makeCurrency({ tradeBalance: 3, nominalGdp: GDP, previousData: { tradeBalance: 5 } }))).toBe(4);
        // clamped at both ends
        expect(scoreTradeBalance(makeCurrency({ tradeBalance: 6, nominalGdp: GDP, previousData: { tradeBalance: 0 } }))).toBe(10);
        expect(scoreTradeBalance(makeCurrency({ tradeBalance: -6, nominalGdp: GDP, previousData: { tradeBalance: 0 } }))).toBe(-10);
    });

    it('compares currencies on the same scale whatever their own money', () => {
        // Le cas qui motive tout : -363 milliards de YENS est un déficit
        // BEAUCOUP plus petit que -73 milliards de DOLLARS. L'ancienne échelle
        // absolue mettait les deux au plancher de -10.
        const japon = makeCurrency({ tradeBalance: -363.7, nominalGdp: 663757 });   // -0,66% du PIB
        const usa   = makeCurrency({ tradeBalance: -73.3, nominalGdp: 30769.7 });   // -2,86% du PIB
        expect(scoreTradeBalance(japon)).toBe(-2);
        expect(scoreTradeBalance(usa)).toBe(-6);
        expect(scoreTradeBalance(japon)!).toBeGreaterThan(scoreTradeBalance(usa)!);
    });

    it('is unavailable rather than wrong when the GDP is missing', () => {
        expect(scoreTradeBalance(makeCurrency({ tradeBalance: -20, nominalGdp: undefined }))).toBeNull();
        expect(scoreTradeBalance(makeCurrency({ tradeBalance: -20, nominalGdp: 0 }))).toBeNull();
    });
});

describe('scoreTokyoCpiLevel', () => {
    it('treats overshooting the 2% target as bullish for the yen', () => {
        expect(scoreTokyoCpiLevel(3.5)).toBe(8);
        expect(scoreTokyoCpiLevel(2.5)).toBe(5);
        expect(scoreTokyoCpiLevel(2)).toBe(0);
        expect(scoreTokyoCpiLevel(1.5)).toBe(-5);
        expect(scoreTokyoCpiLevel(0.5)).toBe(-8);
    });
});

describe('scoreChinaLevel', () => {
    it('pivots at 50 with 2 points of score per PMI point', () => {
        expect(scoreChinaLevel(50, 50)).toBe(0);
        expect(scoreChinaLevel(52, 52)).toBe(4);
        expect(scoreChinaLevel(48, 48)).toBe(-4);
        expect(scoreChinaLevel(60, 60)).toBe(10);     // clamped
        expect(scoreChinaLevel(40, 40)).toBe(-10);    // clamped
    });

    it('adds momentum beyond a 0.5 point swing', () => {
        expect(scoreChinaLevel(52, 51)).toBe(6);
        expect(scoreChinaLevel(52, 53)).toBe(2);
        expect(scoreChinaLevel(52, 51.6)).toBe(4);    // below the momentum threshold
    });
});

describe('riskOffFromVix', () => {
    it('maps the VIX level onto a risk-off intensity', () => {
        expect(riskOffFromVix(40, 40)).toBe(10);   // panic
        expect(riskOffFromVix(30, 30)).toBe(7);
        expect(riskOffFromVix(25, 25)).toBe(4);
        expect(riskOffFromVix(20, 20)).toBe(0);    // neutral pivot
        expect(riskOffFromVix(16, 16)).toBe(-4);
        expect(riskOffFromVix(12, 12)).toBe(-8);   // complacency
    });

    it('adds momentum beyond 2 points and clamps', () => {
        expect(riskOffFromVix(25, 20)).toBe(6);
        expect(riskOffFromVix(25, 30)).toBe(2);
        expect(riskOffFromVix(40, 20)).toBe(10);
        expect(riskOffFromVix(12, 20)).toBe(-10);
    });
});

// ================================================================
// NORMALISATION
// ================================================================

describe('normalizeScore', () => {
    it('maps the raw [-10, +10] range onto [0, 100]', () => {
        expect(normalizeScore(-10)).toBe(0);
        expect(normalizeScore(0)).toBe(50);
        expect(normalizeScore(10)).toBe(100);
        expect(normalizeScore(5)).toBe(75);
        expect(normalizeScore(-5)).toBe(25);
        expect(normalizeScore(2.5)).toBe(63);   // rounded
    });

    it('clamps values coming from outside the raw range', () => {
        expect(normalizeScore(50)).toBe(100);
        expect(normalizeScore(-50)).toBe(0);
    });
});

describe('getScoreLabel', () => {
    it('applies the verdict thresholds', () => {
        expect(getScoreLabel(70)).toBe('Strong Buy');
        expect(getScoreLabel(69)).toBe('Buy');
        expect(getScoreLabel(60)).toBe('Buy');
        expect(getScoreLabel(59)).toBe('Neutral');
        expect(getScoreLabel(45)).toBe('Neutral');
        expect(getScoreLabel(44)).toBe('Sell');
        expect(getScoreLabel(30)).toBe('Sell');
        expect(getScoreLabel(29)).toBe('Strong Sell');
    });
});

// ================================================================
// THE EXCLUSION RULE — the single most important invariant
// ================================================================

describe('weight exclusion rule', () => {
    const a = { score: 6, poids: 40, disponible: true };
    const b = { score: -2, poids: 30, disponible: true };

    it('an unavailable indicator is identical to an indicator absent from the profile', () => {
        const missing = { score: null, poids: 30, disponible: false };
        expect(weightedAverage([a, b, missing])).toBe(weightedAverage([a, b]));
        expect(normalizeScore(weightedAverage([a, b, missing])))
            .toBe(normalizeScore(weightedAverage([a, b])));
    });

    it('the weight of a missing indicator leaves the denominator', () => {
        const missing = { score: null, poids: 30, disponible: false };
        expect(weightedAverage([a, b, missing])).toBeCloseTo((6 * 40 - 2 * 30) / 70, 10);
        expect(usedWeight([a, b, missing])).toBe(70);
    });

    it('is NOT the same as scoring the missing indicator 0', () => {
        const missing = { score: null, poids: 30, disponible: false };
        const asZero = { score: 0, poids: 30, disponible: true };
        expect(weightedAverage([a, b, missing])).not.toBeCloseTo(weightedAverage([a, b, asZero]), 6);
        // Counting it as 0 would drag the score towards neutral
        expect(Math.abs(weightedAverage([a, b, asZero]))).toBeLessThan(Math.abs(weightedAverage([a, b, missing])));
    });

    it('holds whatever the weight of the missing indicator', () => {
        for (const poids of [1, 5, 12, 22, 50, 99]) {
            const missing = { score: null, poids, disponible: false };
            expect(weightedAverage([a, b, missing])).toBe(weightedAverage([a, b]));
        }
    });

    it('treats disponible:false as excluded even if a score leaked in', () => {
        const inconsistent = { score: 10, poids: 60, disponible: false };
        expect(weightedAverage([a, b, inconsistent])).toBe(weightedAverage([a, b]));
        expect(usedWeight([a, b, inconsistent])).toBe(70);
    });

    it('returns a neutral 0 when nothing is available at all', () => {
        expect(weightedAverage([{ score: null, poids: 100, disponible: false }])).toBe(0);
        expect(weightedAverage([])).toBe(0);
        expect(normalizeScore(weightedAverage([]))).toBe(50);
    });

    it('end to end: the EUR excludes ZEW and ifo when neither is provided', () => {
        const eur = makeCurrency({ code: 'EUR' });
        const scores = calculateInstitutionalScore(eur, RATES, EMPTY_MARKET_CONTEXT);

        const unavailable = breakdownOf(scores).filter(i => !i.disponible).map(i => i.id).sort();
        expect(unavailable).toEqual(['eu_ifo', 'eu_zew']);

        expect(scores.poidsTotal).toBe(100);
        expect(scores.poidsUtilise).toBe(93);   // 100 - 4 (ZEW) - 3 (ifo)

        // The engine's own total equals the average over the AVAILABLE indicators only
        const available = breakdownOf(scores).filter(i => i.disponible);
        expect(scores.total).toBe(normalizeScore(weightedAverage(available)));

        // ... and differs from what counting the missing ones as 0 would give
        const asZero = breakdownOf(scores).map(i =>
            i.disponible ? i : { ...i, score: 0, disponible: true });
        expect(scores.total).not.toBe(normalizeScore(weightedAverage(asZero)));
    });

    it('end to end: providing the missing data brings the full weight back', () => {
        const bare = calculateInstitutionalScore(makeCurrency({ code: 'EUR' }), RATES, EMPTY_MARKET_CONTEXT);
        const rich = calculateInstitutionalScore(
            makeCurrency({ code: 'EUR', zew: 12, ifo: 92 }), RATES, EMPTY_MARKET_CONTEXT);

        expect(bare.poidsUtilise).toBe(93);
        expect(rich.poidsUtilise).toBe(100);
        expect(breakdownOf(rich).every(i => i.disponible)).toBe(true);
    });

    it('every currency drops exactly the indicators it has no data for', () => {
        const expected: Record<string, [string[], number]> = {
            USD: [['us_nfp'], 88],
            EUR: [['eu_ifo', 'eu_zew'], 93],
            GBP: [[], 100],
            JPY: [['jp_cpi_tokyo', 'jp_risque'], 66],
            AUD: [['au_chine', 'au_fer', 'au_risque'], 57],
            CAD: [['ca_petrole', 'ca_us'], 67],
            NZD: [['nz_chine', 'nz_laitiers', 'nz_risque'], 57],
            CHF: [['ch_eurchf', 'ch_risque'], 52],
        };

        for (const [code, entry] of Object.entries(expected)) {
            const [ids, poidsUtilise] = entry;
            const scores = calculateInstitutionalScore(makeCurrency({ code }), RATES, EMPTY_MARKET_CONTEXT);
            expect(breakdownOf(scores).filter(i => !i.disponible).map(i => i.id).sort()).toEqual(ids);
            expect(scores.poidsUtilise).toBe(poidsUtilise);
            expect(scores.poidsTotal).toBe(100);
        }
    });

    it('a fully fed currency uses 100% of its weights', () => {
        const ctx = makeFullContext();
        for (const code of Object.keys(CURRENCY_WEIGHTS)) {
            const scores = calculateInstitutionalScore(makeFullCurrency(code), RATES, ctx, 4);
            expect(breakdownOf(scores).filter(i => !i.disponible)).toEqual([]);
            expect(scores.poidsUtilise).toBe(totalWeight(code));
        }
    });
});

// ================================================================
// calculateInstitutionalScore
// ================================================================

describe('calculateInstitutionalScore', () => {
    it('exposes the profile metadata of the currency', () => {
        const scores = calculateInstitutionalScore(makeCurrency({ code: 'CAD' }), RATES);
        expect(scores.banqueCentrale).toBe('BoC');
        expect(scores.moteurN1).toBe('Pétrole');
        expect(scores.particularite).toBeDefined();
    });

    it('sorts the breakdown by descending weight', () => {
        const scores = calculateInstitutionalScore(makeCurrency({ code: 'AUD' }), RATES);
        const weights = breakdownOf(scores).map(i => i.poids);
        expect(weights).toEqual([...weights].sort((x, y) => y - x));
        expect(weights[0]).toBe(18);
    });

    it('rounds indicator scores and the raw total to 2 decimals', () => {
        const scores = calculateInstitutionalScore(makeCurrency({ code: 'USD' }), RATES);
        for (const ind of breakdownOf(scores)) {
            if (ind.score !== null) expect(ind.score).toBe(Math.round(ind.score * 100) / 100);
        }
        expect(scores.rawTotal).toBe(Math.round(scores.rawTotal * 100) / 100);
    });

    it('computes the real rate for display', () => {
        const scores = calculateInstitutionalScore(makeCurrency({ interestRate: 4.25, cpi: 2.1 }), RATES);
        expect(scores.realRate).toBe(2.15);
    });

    it('returns a neutral profile-less score for an unknown currency code', () => {
        const scores = calculateInstitutionalScore(makeCurrency({ code: 'XXX' }), RATES);
        expect(scores.breakdown).toEqual([]);
        expect(scores.poidsTotal).toBe(0);
        expect(scores.poidsUtilise).toBe(0);
        expect(scores.rawTotal).toBe(0);
        expect(scores.total).toBe(50);
        expect(scores.banqueCentrale).toBe('');
    });

    it('rebuilds the radar axes from the breakdown families', () => {
        const scores = calculateInstitutionalScore(makeCurrency({ code: 'USD', gdpQoQ: 2.5 }), RATES);
        // growth = ['pib'] and the USD profile has exactly one GDP indicator
        expect(scores.growth).toBe(Math.round(scoreOf(scores, 'us_pib')));
        // an axis with no available indicator falls back to 0
        const chf = calculateInstitutionalScore(makeCurrency({ code: 'CHF' }), RATES);
        expect(chf.growth).toBe(0);
    });

    it('familyScore ignores unavailable indicators', () => {
        const breakdown: IndicatorScore[] = [
            { id: 'eu_pib', nom: 'PIB', poids: 10, specifique: false, score: 6, disponible: true },
            { id: 'eu_zew', nom: 'ZEW', poids: 90, specifique: true, score: null, disponible: false },
        ];
        expect(familyScore(breakdown, ['pib', 'zew'])).toBe(6);
        expect(familyScore(breakdown, ['balance'])).toBe(0);
    });
});

// ================================================================
// scoreIndicator — dispatch rules
// ================================================================

describe('scoreIndicator dispatch', () => {
    const base = { allRates: RATES, ctx: EMPTY_MARKET_CONTEXT, usdRawScore: null };

    it('prefers the currency data over the market context', () => {
        const ctx = makeFullContext({ usNfp: -50 });   // the context says: job destructions
        const curr = makeCurrency({ code: 'USD', nfp: 350 }); // the currency says: boom
        expect(scoreIndicator('us_nfp', { ...base, ctx, curr })).toBe(10);
    });

    it('falls back on the market context when the currency has no data', () => {
        const ctx = makeFullContext({ usNfp: 350, usNfpPrev: 350 });
        expect(scoreIndicator('us_nfp', { ...base, ctx, curr: makeCurrency({ code: 'USD' }) })).toBe(10);
    });

    it('returns null when neither source has the data', () => {
        expect(scoreIndicator('us_nfp', { ...base, curr: makeCurrency({ code: 'USD' }) })).toBeNull();
        expect(scoreIndicator('eu_ifo', { ...base, curr: makeCurrency({ code: 'EUR' }) })).toBeNull();
        expect(scoreIndicator('ca_petrole', { ...base, curr: makeCurrency({ code: 'CAD' }) })).toBeNull();
    });

    it('returns null for an unknown indicator kind', () => {
        expect(scoreIndicator('us_unknown_thing', { ...base, curr: makeCurrency() })).toBeNull();
    });

    it('averages Core CPI and Core PCE for the USD only', () => {
        const curr = makeCurrency({ code: 'USD', coreCpi: 3, corePce: 1, previousData: { coreCpi: 3, corePce: 1 } });
        // Core CPI 3% stable -> HIGH stable -> 6 · Core PCE 1% stable -> LOW stable -> -7
        expect(scoreIndicator('us_core_cpi', { ...base, curr })).toBeCloseTo((6 - 7) / 2, 10);
        // Without a Core PCE only the Core CPI counts
        const noPce = makeCurrency({ code: 'GBP', coreCpi: 3, previousData: { coreCpi: 3 } });
        expect(scoreIndicator('gb_core_cpi', { ...base, curr: noPce })).toBe(6);
    });

    it('averages the two PMIs for a composite indicator', () => {
        const curr = makeCurrency({ code: 'CAD', pmiManufacturing: 46, pmiServices: 56 });
        // composite = 51 -> level 2, no momentum
        expect(scoreIndicator('ca_pmi', { ...base, curr })).toBe(2);
    });

    it('inverts the risk score between safe havens and pro-cyclicals', () => {
        const ctx = makeFullContext({ vix: 40, vixPrev: 40 });
        const jpy = scoreIndicator('jp_risque', { ...base, ctx, curr: makeCurrency({ code: 'JPY' }) });
        const aud = scoreIndicator('au_risque', { ...base, ctx, curr: makeCurrency({ code: 'AUD' }) });
        expect(jpy).toBe(10);
        expect(aud).toBe(-10);

        // Same inversion when the VIX comes from the currency itself
        const jpyOwn = scoreIndicator('jp_risque', { ...base, curr: makeCurrency({ code: 'JPY', riskSentiment: 40 }) });
        const audOwn = scoreIndicator('au_risque', { ...base, curr: makeCurrency({ code: 'AUD', riskSentiment: 40 }) });
        expect(jpyOwn).toBe(10);
        expect(audOwn).toBe(-10);
    });

    it('reads the EUR/CHF pair with a NEGATIVE correlation', () => {
        // A falling EUR/CHF means a strengthening franc -> bullish CHF
        const curr = makeCurrency({ code: 'CHF', eurChf: -1.5 });
        expect(scoreIndicator('ch_eurchf', { ...base, curr })).toBe(5);
        expect(scoreIndicator('ch_eurchf', { ...base, curr: makeCurrency({ code: 'CHF', eurChf: 1.5 }) })).toBe(-5);
    });

    it('blends the SNB stance with the intervention, and stands alone without it', () => {
        const hawkish = makeCurrency({ code: 'CHF', stance: 'Very Hawkish' });
        // No intervention data -> the stance alone
        expect(scoreIndicator('ch_interventions', { ...base, curr: hawkish })).toBe(10);
        // Weakening the franc halves it
        const ctx = createMarketContext({ snbIntervention: 'affaiblir_chf' });
        expect(scoreIndicator('ch_interventions', { ...base, ctx, curr: hawkish })).toBe(10 * 0.5 - 7 * 0.5);
    });

    it('reads the NZ employment change as a % and the AU/CA one in thousands', () => {
        const nzd = makeCurrency({ code: 'NZD', employmentChange: 0.5 });
        expect(scoreIndicator('nz_emploi', { ...base, curr: nzd })).toBe(5);
        const aud = makeCurrency({ code: 'AUD', employmentChange: 30 });
        expect(scoreIndicator('au_emploi', { ...base, curr: aud })).toBe(7);
    });

    it('falls back from employment to the unemployment rate', () => {
        const aud = makeCurrency({ code: 'AUD', unemployment: 2.5 });   // NAIRU AUD = 4.5
        expect(scoreIndicator('au_emploi', { ...base, curr: aud })).toBe(scoreUnemployment(aud));
    });

    it('drives the JPY balance from the current account when available', () => {
        // Le Japon passe par la même échelle en % du PIB que les autres :
        // -1200 Md¥/mois sur un PIB de 600 000 Md¥ = -2,4% -> -6, tandis que
        // le compte courant de +3000 Md¥/mois = +6% -> +10.
        const jpy = makeCurrency({ code: 'JPY', tradeBalance: -1200, nominalGdp: 600_000 });
        expect(scoreIndicator('jp_balance', { ...base, curr: jpy })).toBe(-6);   // trade balance fallback
        const ctx = createMarketContext({ jpCurrentAccount: 3000 });
        expect(scoreIndicator('jp_balance', { ...base, ctx, curr: jpy })).toBe(10);
    });

    it('drops the balance from the weighting when the GDP is unknown', () => {
        const jpy = makeCurrency({ code: 'JPY', tradeBalance: -1200, nominalGdp: undefined });
        expect(scoreIndicator('jp_balance', { ...base, curr: jpy })).toBeNull();
    });

    it('lets the market context override the US and UK retail sales', () => {
        const usd = makeCurrency({ code: 'USD', retailSales: -1 });
        expect(scoreIndicator('us_retail', { ...base, curr: usd })).toBe(-10);
        const ctx = createMarketContext({ usRetailOverride: 0.5 });
        expect(scoreIndicator('us_retail', { ...base, ctx, curr: usd })).toBe(5);
    });

    it('prefers the dedicated UK wage figure for the GBP', () => {
        const gbp = makeCurrency({ code: 'GBP', wagePPI: 0.1, previousData: { wagePPI: 0.1 } });
        expect(scoreIndicator('gb_salaires', { ...base, curr: gbp })).toBe(-3);   // monthly ladder
        const ctx = createMarketContext({ gbWageGrowth: 6.5 });
        expect(scoreIndicator('gb_salaires', { ...base, ctx, curr: gbp })).toBe(9);
    });

    it('applies the commodity full scales: 15% for oil and iron, 10% for dairy', () => {
        const curr = makeCurrency({ commodityPrice: 7.5 });
        expect(scoreIndicator('ca_petrole', { ...base, curr })).toBe(5);
        expect(scoreIndicator('au_fer', { ...base, curr })).toBe(5);
        expect(scoreIndicator('nz_laitiers', { ...base, curr })).toBe(7.5);
    });

    it('transmits the raw USD score to the CAD spillover, damped by 0.8', () => {
        const cad = makeCurrency({ code: 'CAD' });
        expect(scoreIndicator('ca_us', { ...base, curr: cad, usdRawScore: 5 })).toBe(4);
        expect(scoreIndicator('ca_us', { ...base, curr: cad, usdRawScore: null })).toBeNull();
        // A raw US activity index takes priority over the transmission
        const withIndex = makeCurrency({ code: 'CAD', usSpillover: 25 });
        expect(scoreIndicator('ca_us', { ...base, curr: withIndex, usdRawScore: 5 })).toBe(5);
    });
});

// ================================================================
// calculateAllScores — the two-pass batch
// ================================================================

describe('calculateAllScores', () => {
    it('scores every currency of the map and keeps its data', () => {
        const result = calculateAllScores(makeAllCurrencies());
        expect(Object.keys(result).sort()).toEqual(['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'NZD', 'USD']);
        const usd = result.USD;
        if (usd === undefined) throw new Error('USD missing');
        expect(usd.code).toBe('USD');
        expect(usd.scores.total).toBeGreaterThanOrEqual(0);
        expect(usd.scores.total).toBeLessThanOrEqual(100);
    });

    it('ranks the interest rate differential GLOBALLY across the currencies', () => {
        const currencies = makeAllCurrencies();
        const before = calculateAllScores(currencies);
        const audBefore = before.AUD;
        if (audBefore === undefined) throw new Error('AUD missing');

        // The AUD itself does not change; only a PEER lifts its policy rate
        // above the AUD one. The AUD rate score must drop all the same.
        const bumped = calculateAllScores(makeAllCurrencies({ CHF: { interestRate: 9 } }));
        const audAfter = bumped.AUD;
        if (audAfter === undefined) throw new Error('AUD missing');

        expect(scoreOf(audAfter.scores, 'au_taux')).toBeLessThan(scoreOf(audBefore.scores, 'au_taux'));
        // ... and the currency that was lifted gains the top rank
        const chfAfter = bumped.CHF;
        const chfBefore = before.CHF;
        if (chfAfter === undefined || chfBefore === undefined) throw new Error('CHF missing');
        expect(scoreOf(chfAfter.scores, 'ch_taux')).toBeGreaterThan(scoreOf(chfBefore.scores, 'ch_taux'));
    });

    it('gives the top rate the maximum differential and the bottom rate the minimum', () => {
        // Identical currencies apart from the rate: the ranking is the only difference
        const flat: Record<string, Partial<CurrencyData>> = {};
        const result = calculateAllScores(makeAllCurrencies(flat));
        const usd = result.USD;   // rate 5 -> rank 1
        const chf = result.CHF;   // rate 0.5 -> rank 8
        if (usd === undefined || chf === undefined) throw new Error('currency missing');
        expect(scoreOf(usd.scores, 'us_taux')).toBeGreaterThan(scoreOf(chf.scores, 'ch_taux'));
    });

    it('feeds the raw USD score into the CAD spillover (two passes)', () => {
        const result = calculateAllScores(makeAllCurrencies());
        const usd = result.USD;
        const cad = result.CAD;
        if (usd === undefined || cad === undefined) throw new Error('currency missing');

        const expected = Math.round(clamp10(usd.scores.rawTotal * 0.8) * 100) / 100;
        expect(scoreOf(cad.scores, 'ca_us')).toBe(expected);
    });

    it('changing the US data moves the CAD spillover', () => {
        const weakUs = calculateAllScores(makeAllCurrencies({
            USD: { stance: 'Very Dovish', gdpQoQ: -3, unemployment: 9, cpi: 0.2, previousData: { cpi: 1.5 } },
        }));
        const strongUs = calculateAllScores(makeAllCurrencies({
            USD: { stance: 'Very Hawkish', gdpQoQ: 3.5, unemployment: 2, cpi: 3.5, previousData: { cpi: 2.8 } },
        }));
        const weakCad = weakUs.CAD;
        const strongCad = strongUs.CAD;
        if (weakCad === undefined || strongCad === undefined) throw new Error('CAD missing');

        expect(scoreOf(strongCad.scores, 'ca_us')).toBeGreaterThan(scoreOf(weakCad.scores, 'ca_us'));
    });

    it('excludes the CAD spillover when there is no USD in the set', () => {
        const noUsd = makeAllCurrencies();
        delete noUsd.USD;
        const result = calculateAllScores(noUsd);
        const cad = result.CAD;
        if (cad === undefined) throw new Error('CAD missing');
        expect(indicatorOf(cad.scores, 'ca_us').disponible).toBe(false);
        expect(cad.scores.poidsUtilise).toBe(67);   // 100 - 22 (oil) - 11 (spillover)
    });

    it('defaults to an empty market context and stays pure', () => {
        const currencies = makeAllCurrencies();
        const snapshot = JSON.stringify(currencies);
        const a = calculateAllScores(currencies);
        const b = calculateAllScores(currencies, EMPTY_MARKET_CONTEXT);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        // The input map is never mutated
        expect(JSON.stringify(currencies)).toBe(snapshot);
    });

    it('is deterministic: the same input always gives the same output', () => {
        const currencies = makeAllCurrencies();
        const ctx = makeFullContext();
        expect(JSON.stringify(calculateAllScores(currencies, ctx)))
            .toBe(JSON.stringify(calculateAllScores(currencies, ctx)));
    });

    it('produces a bullish score for a strong currency and a bearish one for a weak currency', () => {
        const result = calculateAllScores(makeAllCurrencies({
            USD: {
                interestRate: 5, stance: 'Very Hawkish', cpi: 3.2, coreCpi: 3.1, corePce: 3,
                gdpQoQ: 3.5, pmiManufacturing: 58, pmiServices: 58, unemployment: 2,
                nfp: 350, wagePPI: 5.5, tradeBalance: 20, retailSales: 1.5,
                previousData: { cpi: 2.6, coreCpi: 2.5, corePce: 2.4, nfp: 200 },
            },
            CHF: {
                interestRate: 0.5, stance: 'Very Dovish', cpi: 3.5,
                riskSentiment: 12, eurChf: 2,
            },
        }));
        const usd = result.USD;
        const chf = result.CHF;
        if (usd === undefined || chf === undefined) throw new Error('currency missing');

        expect(usd.scores.total).toBeGreaterThan(70);
        expect(getScoreLabel(usd.scores.total)).toBe('Strong Buy');
        expect(chf.scores.total).toBeLessThan(30);
        expect(getScoreLabel(chf.scores.total)).toBe('Strong Sell');
    });
});
