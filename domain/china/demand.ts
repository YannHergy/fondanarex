/**
 * Indice de Demande Chinoise — a composite standing in for the China PMI.
 *
 * WHY THIS EXISTS. `scoreChinaLevel` drives 15% of the AUD and NZD scores off
 * `chinaDemand`, and that field has never been fed: FXMacroData publishes no
 * PMI slug for any currency, and the three official Chinese sources are not
 * usable — the Customs API answers 412 behind an anti-bot firewall, and the
 * NBS moved its data behind an undocumented single-page-app API. Measured, not
 * assumed. So the indicator sat empty and its weight was silently dropped.
 *
 * WHAT IT IS. A weighted composite of the Chinese series FXMacroData DOES
 * publish, rescaled onto a PMI-like axis where 50 is neutral, above 50 means
 * Chinese demand is expanding and below means it is contracting. That axis is
 * not decoration: `scoreChinaLevel` reads its input as a PMI, saturating at
 * 45 and 55, so anything on a different scale would peg the score.
 *
 * WHAT IT IS NOT. It is not a PMI, and nothing here pretends it is. A PMI is a
 * survey of purchasing managers; this is an arithmetic recombination of
 * published aggregates. It moves for the same reasons a PMI moves and it is
 * read the same way, but a reader comparing it against the official NBS PMI
 * will find different numbers. `label` says so wherever it is displayed.
 */

/** One reading feeding the composite. All percentages, all year-on-year. */
export interface ChinaDemandInputs {
    /** Retail sales growth — the most direct read on household demand. */
    retailSalesYoY: number | null;
    /** CPI. For China this is a DEMAND signal, not a price-stability one. */
    cpiYoY: number | null;
    /** Surveyed urban unemployment rate. */
    unemployment: number | null;
    /** 1-Year Loan Prime Rate, current and prior — a cut is stimulus. */
    policyRate: number | null;
    policyRatePrev: number | null;
    /** GDP growth. Guarded upstream: see `saneGdpGrowth`. */
    gdpYoY: number | null;
}

export interface ChinaDemandComponent {
    key: string;
    label: string;
    /** The reading itself, in its own unit. */
    value: number;
    /** The level at which this component contributes nothing. */
    neutral: number;
    /** Index points contributed at full weight, before weighting. */
    deviation: number;
    weight: number;
}

export interface ChinaDemandIndex {
    /** PMI-like, 50 neutral. Null when nothing could be read. */
    value: number | null;
    /** Components that resolved, in weight order. */
    components: ChinaDemandComponent[];
    /** Labels of the components that were missing. */
    missing: string[];
    /** Share of the intended weight actually covered, 0–1. */
    coverage: number;
}

/**
 * CALIBRATION.
 *
 * Every neutral below is a judgement, and they are gathered here so they can
 * be argued with rather than hunted for. They were set against the series as
 * they actually read in August 2026, not against a textbook China.
 *
 *   - RETAIL 3.0%. Chinese retail sales growth printed between 0.9 and 2.9
 *     over the preceding eight months. A "healthy" 8% neutral — the pre-2020
 *     norm — would pin the index at its floor permanently and turn a variable
 *     into a constant, which carries no information. 3.0 sits at the top of
 *     the current range: the index reads negative today, and that is correct,
 *     but a genuine recovery still moves it.
 *   - CPI 1.5%. China's problem is deflation, not inflation. Prices rising
 *     faster means demand is returning; this component is deliberately NOT
 *     shaped like the CPI scoring for the eight majors, where overshooting a
 *     2% target is bad.
 *   - UNEMPLOYMENT 5.1%, the prevailing level, inverted.
 *   - POLICY RATE has no neutral: it contributes its CHANGE. A cut is easing
 *     and supports future demand. Level would double-count what the rate
 *     differential already scores elsewhere.
 *   - GDP 5.0%, the official growth target.
 *
 * The multipliers convert a reading into index points. They are sized so that
 * a plausible swing in each series moves the composite by a few points rather
 * than slamming it into `scoreChinaLevel`'s ±5 saturation band.
 */
const CALIBRATION = [
    { key: 'retail', label: 'Ventes au détail', neutral: 3.0, perPoint: 3.5, weight: 0.35 },
    { key: 'cpi', label: 'Inflation (CPI)', neutral: 1.5, perPoint: 4.0, weight: 0.2 },
    { key: 'unemployment', label: 'Chômage urbain', neutral: 5.1, perPoint: -12.0, weight: 0.15 },
    { key: 'policy', label: 'Taux directeur (LPR)', neutral: 0, perPoint: -15.0, weight: 0.15 },
    { key: 'gdp', label: 'PIB', neutral: 5.0, perPoint: 2.0, weight: 0.15 },
] as const;

/**
 * Bounds on the published index.
 *
 * Not cosmetic. `scoreChinaLevel` clamps its own output at ±10, so anything
 * past 55 or 45 already scores identically; letting the index print 12 or 90
 * would only mislead a reader into thinking the difference meant something.
 */
const FLOOR = 35;
const CEILING = 65;

/** Below this share of the intended weight the composite is not published. */
const MIN_COVERAGE = 0.5;

function clamp(value: number, low: number, high: number): number {
    return Math.min(high, Math.max(low, value));
}

/**
 * China's GDP release defeats a naive reading, so it is filtered here.
 *
 * The NBS reports cumulatively through the year: the Q2 figure is the first
 * HALF, not the quarter. FXMacroData passes that through, so `pct_change_yoy`
 * read 4.84 for Q1 2026 — correct — and then 103.55 for Q2, which is the half
 * year measured against a single quarter. Feeding that in would have written
 * a 103% growth rate into a field scored as a small percentage.
 *
 * Anything outside a band no real economy leaves is therefore refused rather
 * than trusted. A refused GDP costs 15% of the coverage; a believed one costs
 * the whole indicator.
 */
export function saneGdpGrowth(yoy: number | null | undefined): number | null {
    if (typeof yoy !== 'number' || !Number.isFinite(yoy)) return null;
    return yoy > -20 && yoy < 20 ? yoy : null;
}

/**
 * Builds the composite.
 *
 * Missing series do not default to neutral — they are dropped, and the
 * remaining weights renormalised. Defaulting would quietly claim a reading
 * the source never gave, which is the same mistake the market-context loader
 * documents at length about null versus zero.
 */
export function chinaDemandIndex(inputs: ChinaDemandInputs): ChinaDemandIndex {
    const readings: Record<string, number | null> = {
        retail: inputs.retailSalesYoY,
        cpi: inputs.cpiYoY,
        unemployment: inputs.unemployment,
        // The change, not the level — see CALIBRATION.
        policy:
            typeof inputs.policyRate === 'number' && typeof inputs.policyRatePrev === 'number'
                ? inputs.policyRate - inputs.policyRatePrev
                : null,
        gdp: inputs.gdpYoY,
    };

    const components: ChinaDemandComponent[] = [];
    const missing: string[] = [];
    let weighted = 0;
    let covered = 0;

    for (const spec of CALIBRATION) {
        const reading = readings[spec.key];

        if (typeof reading !== 'number' || !Number.isFinite(reading)) {
            missing.push(spec.label);
            continue;
        }

        const deviation = (reading - spec.neutral) * spec.perPoint;

        components.push({
            key: spec.key,
            label: spec.label,
            value: reading,
            neutral: spec.neutral,
            deviation,
            weight: spec.weight,
        });

        weighted += deviation * spec.weight;
        covered += spec.weight;
    }

    if (covered < MIN_COVERAGE) {
        return { value: null, components, missing, coverage: covered };
    }

    // Renormalised by the weight actually present, so losing GDP shifts the
    // index towards what the remaining series say rather than towards 50.
    const value = clamp(50 + weighted / covered, FLOOR, CEILING);

    return {
        // One decimal: the inputs carry one, and a composite cannot be more
        // precise than what it is made of.
        value: Math.round(value * 10) / 10,
        components,
        missing,
        coverage: covered,
    };
}

/** Reading of the composite, for display next to the number. */
export function chinaDemandVerdict(value: number): string {
    if (value >= 54) return 'Demande chinoise en forte expansion';
    if (value >= 51) return 'Demande chinoise en expansion';
    if (value > 49) return 'Demande chinoise stable';
    if (value > 46) return 'Demande chinoise en repli';
    return 'Demande chinoise en forte contraction';
}
