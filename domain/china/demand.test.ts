import { describe, expect, it } from 'vitest';

import {
    chinaDemandIndex,
    chinaDemandVerdict,
    saneGdpGrowth,
    type ChinaDemandInputs,
} from './demand';

/** Everything present and exactly at its neutral: the index must read 50. */
const NEUTRAL: ChinaDemandInputs = {
    retailSalesYoY: 3.0,
    cpiYoY: 1.5,
    unemployment: 5.1,
    policyRate: 3.0,
    policyRatePrev: 3.0,
    gdpYoY: 5.0,
};

describe('saneGdpGrowth', () => {
    it('keeps a real growth rate', () => {
        expect(saneGdpGrowth(4.84)).toBe(4.84);
        expect(saneGdpGrowth(-3.2)).toBe(-3.2);
        expect(saneGdpGrowth(0)).toBe(0);
    });

    it('refuses the cumulative-reporting artefact', () => {
        // The real value FXMacroData returned for Q2 2026: the first HALF of
        // the year measured against Q1 alone. This is the whole reason the
        // guard exists.
        expect(saneGdpGrowth(103.55)).toBeNull();
        expect(saneGdpGrowth(108.17)).toBeNull();
    });

    it('refuses what is not a number', () => {
        expect(saneGdpGrowth(null)).toBeNull();
        expect(saneGdpGrowth(undefined)).toBeNull();
        expect(saneGdpGrowth(Number.NaN)).toBeNull();
        expect(saneGdpGrowth(Number.POSITIVE_INFINITY)).toBeNull();
    });
});

describe('chinaDemandIndex', () => {
    it('reads 50 when every series sits at its neutral', () => {
        const index = chinaDemandIndex(NEUTRAL);
        expect(index.value).toBe(50);
        expect(index.coverage).toBe(1);
        expect(index.missing).toEqual([]);
        expect(index.components).toHaveLength(5);
    });

    it('scores the real August 2026 readings as a contraction', () => {
        // Live values: retail 1.0, CPI 1.0, unemployment 5.0, LPR unchanged at
        // 3.0, GDP refused by the guard.
        //   retail (1.0-3.0)*3.5 = -7.00  x0.35 = -2.450
        //   cpi    (1.0-1.5)*4.0 = -2.00  x0.20 = -0.400
        //   unemp  (5.0-5.1)*-12 = +1.20  x0.15 = +0.180
        //   policy         0*-15 =  0.00  x0.15 =  0.000
        //   coverage 0.85 -> 50 + (-2.67 / 0.85) = 46.86
        const index = chinaDemandIndex({
            retailSalesYoY: 1.0,
            cpiYoY: 1.0,
            unemployment: 5.0,
            policyRate: 3.0,
            policyRatePrev: 3.0,
            gdpYoY: null,
        });

        expect(index.value).toBe(46.9);
        expect(index.coverage).toBeCloseTo(0.85, 10);
        expect(index.missing).toEqual(['PIB']);
    });

    it('rises when demand strengthens and falls when it weakens', () => {
        const strong = chinaDemandIndex({ ...NEUTRAL, retailSalesYoY: 6.0 });
        const weak = chinaDemandIndex({ ...NEUTRAL, retailSalesYoY: 0.5 });

        expect(strong.value).toBeGreaterThan(50);
        expect(weak.value).toBeLessThan(50);
        // The direction the user asked for: bigger number, healthier China.
        expect(strong.value!).toBeGreaterThan(weak.value!);
    });

    it('treats higher Chinese inflation as returning demand, not as a risk', () => {
        // The opposite of how CPI is scored for the eight majors, and
        // deliberate: China's problem is deflation.
        const hotter = chinaDemandIndex({ ...NEUTRAL, cpiYoY: 3.0 });
        const colder = chinaDemandIndex({ ...NEUTRAL, cpiYoY: 0.0 });

        expect(hotter.value!).toBeGreaterThan(50);
        expect(colder.value!).toBeLessThan(50);
    });

    it('inverts unemployment', () => {
        expect(chinaDemandIndex({ ...NEUTRAL, unemployment: 4.5 }).value!).toBeGreaterThan(50);
        expect(chinaDemandIndex({ ...NEUTRAL, unemployment: 5.8 }).value!).toBeLessThan(50);
    });

    it('reads a rate cut as stimulus and a hike as restriction', () => {
        const cut = chinaDemandIndex({ ...NEUTRAL, policyRate: 2.75, policyRatePrev: 3.0 });
        const hike = chinaDemandIndex({ ...NEUTRAL, policyRate: 3.25, policyRatePrev: 3.0 });

        expect(cut.value!).toBeGreaterThan(50);
        expect(hike.value!).toBeLessThan(50);
    });

    it('drops a missing series instead of defaulting it to neutral', () => {
        const withoutCpi = chinaDemandIndex({ ...NEUTRAL, cpiYoY: null, retailSalesYoY: 6.0 });
        const withNeutralCpi = chinaDemandIndex({ ...NEUTRAL, retailSalesYoY: 6.0 });

        expect(withoutCpi.missing).toEqual(['Inflation (CPI)']);
        expect(withoutCpi.coverage).toBeCloseTo(0.8, 10);
        // Renormalising means the surviving signal counts for MORE, not less.
        expect(withoutCpi.value!).toBeGreaterThan(withNeutralCpi.value!);
    });

    it('publishes nothing below half coverage', () => {
        const index = chinaDemandIndex({
            retailSalesYoY: null,
            cpiYoY: null,
            unemployment: 5.0,
            policyRate: null,
            policyRatePrev: null,
            gdpYoY: null,
        });

        expect(index.value).toBeNull();
        expect(index.coverage).toBeCloseTo(0.15, 10);
    });

    it('publishes at exactly half coverage', () => {
        const index = chinaDemandIndex({
            retailSalesYoY: 3.0,
            cpiYoY: null,
            unemployment: 5.1,
            gdpYoY: null,
            policyRate: null,
            policyRatePrev: null,
        });

        expect(index.coverage).toBeCloseTo(0.5, 10);
        expect(index.value).toBe(50);
    });

    it('never leaves the band scoreChinaLevel can distinguish', () => {
        const absurdlyStrong = chinaDemandIndex({
            retailSalesYoY: 40,
            cpiYoY: 25,
            unemployment: 0.5,
            policyRate: 0.5,
            policyRatePrev: 6,
            gdpYoY: 19,
        });
        const absurdlyWeak = chinaDemandIndex({
            retailSalesYoY: -30,
            cpiYoY: -12,
            unemployment: 22,
            policyRate: 9,
            policyRatePrev: 3,
            gdpYoY: -18,
        });

        expect(absurdlyStrong.value).toBe(65);
        expect(absurdlyWeak.value).toBe(35);
    });

    it('rounds to one decimal, never further', () => {
        const index = chinaDemandIndex({ ...NEUTRAL, retailSalesYoY: 3.137 });
        expect(index.value).toBe(Math.round(index.value! * 10) / 10);
    });

    it('reports each component so the number can be argued with', () => {
        const retail = chinaDemandIndex(NEUTRAL).components.find((c) => c.key === 'retail');

        expect(retail).toMatchObject({
            label: 'Ventes au détail',
            value: 3.0,
            neutral: 3.0,
            deviation: 0,
            weight: 0.35,
        });
    });

    it('is pure — the same inputs always give the same index', () => {
        const once = chinaDemandIndex(NEUTRAL);
        const twice = chinaDemandIndex(NEUTRAL);
        expect(once).toEqual(twice);
    });
});

describe('chinaDemandVerdict', () => {
    it('reads the scale the way the indicator is meant to be read', () => {
        expect(chinaDemandVerdict(56)).toBe('Demande chinoise en forte expansion');
        expect(chinaDemandVerdict(52)).toBe('Demande chinoise en expansion');
        expect(chinaDemandVerdict(50)).toBe('Demande chinoise stable');
        expect(chinaDemandVerdict(47)).toBe('Demande chinoise en repli');
        expect(chinaDemandVerdict(42)).toBe('Demande chinoise en forte contraction');
    });

    it('places the real reading in the right band', () => {
        expect(chinaDemandVerdict(46.9)).toBe('Demande chinoise en repli');
    });
});
