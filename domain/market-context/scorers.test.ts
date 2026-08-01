import { describe, it, expect } from 'vitest';

import type { MarketContext } from '../types';
import { EMPTY_MARKET_CONTEXT, createMarketContext, MARKET_FIELDS } from './context';
import {
    scoreChina,
    scoreDairy,
    scoreEmploymentChange,
    scoreEmploymentChangeValue,
    scoreEurChfFlows,
    scoreGbWages,
    scoreIronOre,
    scoreIvey,
    scoreJpCurrentAccount,
    scoreKof,
    scoreNfp,
    scoreNzEmployment,
    scoreOil,
    scoreRetail,
    scoreRiskProCyclical,
    scoreRiskSafeHaven,
    scoreSnbIntervention,
    scoreTokyoCpi,
    scoreUsSpillover,
    scoreZew,
} from './scorers';

function ctx(overrides: Partial<MarketContext> = {}): MarketContext {
    return createMarketContext(overrides);
}

describe('EMPTY_MARKET_CONTEXT', () => {
    it('has every data field at null so every specific indicator is excluded', () => {
        const nulls = Object.entries(EMPTY_MARKET_CONTEXT)
            .filter(([key]) => key !== 'lastUpdate')
            .every(([, value]) => value === null);
        expect(nulls).toBe(true);
        expect(EMPTY_MARKET_CONTEXT.lastUpdate).toBe('');
    });

    it('createMarketContext merges a partial payload over the empty shape', () => {
        const merged = createMarketContext({ vix: 22 });
        expect(merged.vix).toBe(22);
        expect(merged.chinaPmi).toBeNull();
        // The shared constant is never mutated
        expect(EMPTY_MARKET_CONTEXT.vix).toBeNull();
    });

    it('every admin field points at a real market context key', () => {
        for (const field of MARKET_FIELDS) {
            expect(Object.keys(EMPTY_MARKET_CONTEXT)).toContain(field.key);
        }
    });
});

describe('null handling — an absent datum is never scored', () => {
    it('every context scorer returns null on the empty context', () => {
        expect(scoreOil(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreIronOre(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreDairy(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreChina(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreRiskSafeHaven(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreRiskProCyclical(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreEurChfFlows(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreSnbIntervention(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreNfp(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreNzEmployment(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreZew(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreIvey(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreKof(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreTokyoCpi(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreJpCurrentAccount(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreGbWages(EMPTY_MARKET_CONTEXT)).toBeNull();
        expect(scoreEmploymentChange(null)).toBeNull();
        expect(scoreRetail(null)).toBeNull();
        expect(scoreUsSpillover(null)).toBeNull();
    });

    it('0 is a value, not an absence', () => {
        expect(scoreOil(ctx({ oilChangePct: 0 }))).toBe(0);
        expect(scoreRetail(0)).toBe(0);
        expect(scoreUsSpillover(0)).toBe(0);
        expect(scoreEmploymentChange(0)).toBe(-3);
    });
});

describe('commodities', () => {
    it('oil and iron ore saturate at ±15%', () => {
        expect(scoreOil(ctx({ oilChangePct: 7.5 }))).toBe(5);
        expect(scoreOil(ctx({ oilChangePct: 15 }))).toBe(10);
        expect(scoreOil(ctx({ oilChangePct: 40 }))).toBe(10);
        expect(scoreOil(ctx({ oilChangePct: -40 }))).toBe(-10);

        expect(scoreIronOre(ctx({ ironOreChangePct: -7.5 }))).toBe(-5);
        expect(scoreIronOre(ctx({ ironOreChangePct: 30 }))).toBe(10);
    });

    it('dairy saturates at ±10%', () => {
        expect(scoreDairy(ctx({ dairyGdtChangePct: 5 }))).toBe(5);
        expect(scoreDairy(ctx({ dairyGdtChangePct: 10 }))).toBe(10);
        expect(scoreDairy(ctx({ dairyGdtChangePct: -25 }))).toBe(-10);
    });
});

describe('scoreChina', () => {
    it('pivots at a PMI of 50', () => {
        expect(scoreChina(ctx({ chinaPmi: 50 }))).toBe(0);
        expect(scoreChina(ctx({ chinaPmi: 53 }))).toBe(6);
        expect(scoreChina(ctx({ chinaPmi: 47 }))).toBe(-6);
        expect(scoreChina(ctx({ chinaPmi: 62 }))).toBe(10);
        expect(scoreChina(ctx({ chinaPmi: 38 }))).toBe(-10);
    });

    it('adds momentum only when the previous PMI is known', () => {
        expect(scoreChina(ctx({ chinaPmi: 52 }))).toBe(4);
        expect(scoreChina(ctx({ chinaPmi: 52, chinaPmiPrev: 51 }))).toBe(6);
        expect(scoreChina(ctx({ chinaPmi: 52, chinaPmiPrev: 53 }))).toBe(2);
        expect(scoreChina(ctx({ chinaPmi: 52, chinaPmiPrev: 51.7 }))).toBe(4);
    });
});

describe('risk sentiment', () => {
    it('reads the VIX ladder for safe havens', () => {
        expect(scoreRiskSafeHaven(ctx({ vix: 40 }))).toBe(10);
        expect(scoreRiskSafeHaven(ctx({ vix: 30 }))).toBe(7);
        expect(scoreRiskSafeHaven(ctx({ vix: 25 }))).toBe(4);
        expect(scoreRiskSafeHaven(ctx({ vix: 20 }))).toBe(0);
        expect(scoreRiskSafeHaven(ctx({ vix: 16 }))).toBe(-4);
        expect(scoreRiskSafeHaven(ctx({ vix: 10 }))).toBe(-8);
    });

    it('adds momentum beyond 2 VIX points and clamps', () => {
        expect(scoreRiskSafeHaven(ctx({ vix: 30, vixPrev: 25 }))).toBe(9);
        expect(scoreRiskSafeHaven(ctx({ vix: 30, vixPrev: 35 }))).toBe(5);
        expect(scoreRiskSafeHaven(ctx({ vix: 40, vixPrev: 20 }))).toBe(10);
        expect(scoreRiskSafeHaven(ctx({ vix: 10, vixPrev: 20 }))).toBe(-10);
        expect(scoreRiskSafeHaven(ctx({ vix: 30, vixPrev: 29 }))).toBe(7);
    });

    it('pro-cyclicals are the exact opposite of safe havens', () => {
        for (const vix of [8, 14, 18, 22, 28, 36, 50]) {
            const haven = scoreRiskSafeHaven(ctx({ vix, vixPrev: 20 }));
            const cyclical = scoreRiskProCyclical(ctx({ vix, vixPrev: 20 }));
            if (haven === null || cyclical === null) throw new Error('unexpected null');
            expect(cyclical).toBe(-haven);
        }
    });
});

describe('scoreUsSpillover', () => {
    it('damps the raw USD score by 0.8 and clamps', () => {
        expect(scoreUsSpillover(5)).toBe(4);
        expect(scoreUsSpillover(-5)).toBe(-4);
        expect(scoreUsSpillover(10)).toBe(8);
        expect(scoreUsSpillover(20)).toBe(10);
        expect(scoreUsSpillover(-20)).toBe(-10);
    });
});

describe('scoreEurChfFlows', () => {
    it('is negatively correlated and saturates at ±3%', () => {
        expect(scoreEurChfFlows(ctx({ eurChfChangePct: -1.5 }))).toBe(5);
        expect(scoreEurChfFlows(ctx({ eurChfChangePct: 1.5 }))).toBe(-5);
        expect(scoreEurChfFlows(ctx({ eurChfChangePct: -3 }))).toBe(10);
        expect(scoreEurChfFlows(ctx({ eurChfChangePct: 9 }))).toBe(-10);
    });
});

describe('scoreSnbIntervention', () => {
    it('maps the three intervention kinds', () => {
        expect(scoreSnbIntervention(ctx({ snbIntervention: 'affaiblir_chf' }))).toBe(-7);
        expect(scoreSnbIntervention(ctx({ snbIntervention: 'renforcer_chf' }))).toBe(7);
        expect(scoreSnbIntervention(ctx({ snbIntervention: 'aucune' }))).toBe(0);
    });
});

describe('scoreNfp', () => {
    it('walks the ladder around the 150k equilibrium pace', () => {
        expect(scoreNfp(ctx({ usNfp: 350 }))).toBe(10);
        expect(scoreNfp(ctx({ usNfp: 250 }))).toBe(7);
        expect(scoreNfp(ctx({ usNfp: 160 }))).toBe(4);
        expect(scoreNfp(ctx({ usNfp: 120 }))).toBe(0);
        expect(scoreNfp(ctx({ usNfp: 80 }))).toBe(-4);
        expect(scoreNfp(ctx({ usNfp: 20 }))).toBe(-7);
        expect(scoreNfp(ctx({ usNfp: -30 }))).toBe(-10);
    });

    it('adds momentum only when the previous print is known', () => {
        expect(scoreNfp(ctx({ usNfp: 160, usNfpPrev: 100 }))).toBe(6);
        expect(scoreNfp(ctx({ usNfp: 160, usNfpPrev: 220 }))).toBe(2);
        expect(scoreNfp(ctx({ usNfp: 160, usNfpPrev: 130 }))).toBe(4);
        expect(scoreNfp(ctx({ usNfp: 350, usNfpPrev: 100 }))).toBe(10);
    });
});

describe('employment change', () => {
    it('uses thresholds scaled for smaller economies', () => {
        expect(scoreEmploymentChangeValue(60)).toBe(10);
        expect(scoreEmploymentChangeValue(30)).toBe(7);
        expect(scoreEmploymentChangeValue(15)).toBe(4);
        expect(scoreEmploymentChangeValue(5)).toBe(1);
        expect(scoreEmploymentChangeValue(0)).toBe(-3);
        expect(scoreEmploymentChangeValue(-15)).toBe(-7);
        expect(scoreEmploymentChangeValue(-30)).toBe(-10);
    });

    it('the nullable wrapper delegates to the value scorer', () => {
        expect(scoreEmploymentChange(60)).toBe(scoreEmploymentChangeValue(60));
        expect(scoreEmploymentChange(-30)).toBe(scoreEmploymentChangeValue(-30));
    });

    it('NZ employment is a quarterly % saturating at ±1%', () => {
        expect(scoreNzEmployment(ctx({ nzEmploymentChange: 0.5 }))).toBe(5);
        expect(scoreNzEmployment(ctx({ nzEmploymentChange: 1 }))).toBe(10);
        expect(scoreNzEmployment(ctx({ nzEmploymentChange: -2 }))).toBe(-10);
        expect(scoreNzEmployment(ctx({ nzEmploymentChange: 0 }))).toBe(0);
    });
});

describe('scoreZew', () => {
    it('saturates at ±40 index points and adds momentum beyond 5', () => {
        expect(scoreZew(ctx({ euZew: 0 }))).toBe(0);
        expect(scoreZew(ctx({ euZew: 20 }))).toBe(5);
        expect(scoreZew(ctx({ euZew: 60 }))).toBe(10);
        expect(scoreZew(ctx({ euZew: -60 }))).toBe(-10);
        expect(scoreZew(ctx({ euZew: 20, euZewPrev: 10 }))).toBe(7);
        expect(scoreZew(ctx({ euZew: 20, euZewPrev: 30 }))).toBe(3);
        expect(scoreZew(ctx({ euZew: 20, euZewPrev: 16 }))).toBe(5);
    });
});

describe('Ivey and KOF', () => {
    it('Ivey pivots at 50, KOF at 100', () => {
        expect(scoreIvey(ctx({ caIveyPmi: 50 }))).toBe(0);
        expect(scoreIvey(ctx({ caIveyPmi: 54 }))).toBe(6);
        expect(scoreIvey(ctx({ caIveyPmi: 44 }))).toBe(-9);
        expect(scoreIvey(ctx({ caIveyPmi: 70 }))).toBe(10);
        expect(scoreIvey(ctx({ caIveyPmi: 30 }))).toBe(-10);

        expect(scoreKof(ctx({ chKof: 100 }))).toBe(0);
        expect(scoreKof(ctx({ chKof: 105 }))).toBe(4);
        expect(scoreKof(ctx({ chKof: 90 }))).toBe(-8);
        expect(scoreKof(ctx({ chKof: 130 }))).toBe(10);
        expect(scoreKof(ctx({ chKof: 70 }))).toBe(-10);
    });
});

describe('Japan', () => {
    it('Tokyo CPI is bullish above the 2% target', () => {
        expect(scoreTokyoCpi(ctx({ jpTokyoCpi: 3.5 }))).toBe(8);
        expect(scoreTokyoCpi(ctx({ jpTokyoCpi: 2.5 }))).toBe(5);
        expect(scoreTokyoCpi(ctx({ jpTokyoCpi: 2 }))).toBe(0);
        expect(scoreTokyoCpi(ctx({ jpTokyoCpi: 1.5 }))).toBe(-5);
        expect(scoreTokyoCpi(ctx({ jpTokyoCpi: 0.5 }))).toBe(-8);
    });

    it('the current account ladder rewards the structural surplus', () => {
        expect(scoreJpCurrentAccount(ctx({ jpCurrentAccount: 3000 }))).toBe(10);
        expect(scoreJpCurrentAccount(ctx({ jpCurrentAccount: 2000 }))).toBe(6);
        expect(scoreJpCurrentAccount(ctx({ jpCurrentAccount: 500 }))).toBe(2);
        expect(scoreJpCurrentAccount(ctx({ jpCurrentAccount: -500 }))).toBe(-4);
        expect(scoreJpCurrentAccount(ctx({ jpCurrentAccount: -2000 }))).toBe(-9);
    });
});

describe('scoreGbWages', () => {
    it('walks the UK wage ladder', () => {
        expect(scoreGbWages(ctx({ gbWageGrowth: 7 }))).toBe(9);
        expect(scoreGbWages(ctx({ gbWageGrowth: 5 }))).toBe(6);
        expect(scoreGbWages(ctx({ gbWageGrowth: 3.5 }))).toBe(2);
        expect(scoreGbWages(ctx({ gbWageGrowth: 2.5 }))).toBe(-2);
        expect(scoreGbWages(ctx({ gbWageGrowth: 1 }))).toBe(-7);
    });
});

describe('scoreRetail', () => {
    it('saturates at ±1% MoM', () => {
        expect(scoreRetail(0.5)).toBe(5);
        expect(scoreRetail(1)).toBe(10);
        expect(scoreRetail(-1)).toBe(-10);
        expect(scoreRetail(3)).toBe(10);
        expect(scoreRetail(-3)).toBe(-10);
    });
});
