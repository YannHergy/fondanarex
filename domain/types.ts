// ================================================================
// DOMAIN TYPES
//
// Ported from the legacy Vite/React app (src/types.ts and the
// MarketContext structure of src/data/marketContext.ts).
//
// The field names of the scoring breakdown are kept EXACTLY as they
// were in the legacy code (nom, poids, specifique, disponible, ...)
// so the ported engine stays a drop-in replacement and no consumer
// has to be rewritten. Only the comments are translated.
// ================================================================

/** Direction of a news item relative to the currency it concerns */
export type NewsImpact = 'bullish' | 'bearish' | 'neutral';

export interface NewsArticle {
    titre: string;
    resume: string;
    source: string;
    url: string;
    impact: NewsImpact;
}

/** Central bank policy orientation */
export type CentralBankStance =
    | 'Very Hawkish'
    | 'Hawkish'
    | 'Neutral'
    | 'Dovish'
    | 'Very Dovish';

/** Behaviour of the currency with respect to global risk appetite */
export type CurrencyCategory = 'Safe-Haven' | 'Risk-On' | 'Neutral';

export interface CurrencyData {
    code: string;
    name: string;
    /** ISO 3166-1 alpha-2 region code. Emoji flags are never stored; the UI
     * renders a flag from this code. */
    countryCode: string;
    interestRate: number;
    stance: CentralBankStance;
    /** Used by sentiment scoring */
    category: CurrencyCategory;
    gdpQoQ: number;
    pmiManufacturing: number;
    pmiServices: number;
    cpi: number;
    coreCpi: number;
    ppi: number;
    unemployment: number;
    retailSales: number;
    /** Wage growth — see WAGE_UNITS in the engine: monthly for some currencies, annual for others */
    wagePPI: number;
    tradeBalance: number;
    currentAccount: number;
    consumerConfidence: number;

    // ── Indicators specific to certain currencies (optional) ──────
    /** NFP — Non-Farm Payrolls, in thousands (USD only) */
    nfp?: number;
    /** Core PCE — the Fed's preferred inflation gauge, % YoY (USD only) */
    corePce?: number;
    /** ZEW — German economic expectations, index (EUR only) */
    zew?: number;
    /** ifo — German business climate, index (EUR only) */
    ifo?: number;
    /** Employment Change — net job creations, in thousands (AUD, CAD) or % (NZD) */
    employmentChange?: number;
    /** Exported commodity — % change (iron/coal AUD, dairy NZD) */
    commodityPrice?: number;
    /**
     * WTI crude, in dollars per barrel (CAD).
     *
     * A LEVEL, not a change, and therefore its own field rather than a second
     * meaning for `commodityPrice`. The barrel has an economic reading at a
     * given price — $40 is painful, $100 is a windfall — which is what
     * scoreOilLevel reads. The RBA commodity index behind `commodityPrice` is
     * a base-100 index with no such reading, so it stays a % change.
     */
    oilPrice?: number;
    /** Chinese demand — level of the China PMI (AUD, NZD) */
    chinaDemand?: number;
    /** Risk sentiment — VIX-like index (AUD, NZD, JPY, CHF) */
    riskSentiment?: number;
    /** US economic activity — macro surprise index centred on 0 (CAD) */
    usSpillover?: number;
    /** Tokyo CPI — % YoY, leading indicator of the Japanese national CPI (JPY) */
    tokyoCpi?: number;
    /** EUR/CHF — % change; a DROP means the franc is strengthening (CHF) */
    eurChf?: number;

    // ── Qualitative data ──────────────────────────────────────────
    geopoliticalRisks: string;
    eventsToWatch: string[];
    qualitativeAnalysis: string;

    // ── Real-time news data ───────────────────────────────────────
    newsHeadlines?: string[];
    /** -1 to +1 */
    newsSentimentScore?: number;
    newsSentimentLabel?: string;
    newsArticles?: NewsArticle[];
    /** Timestamp in ms — used for the 4h cache */
    newsLastFetch?: number;

    lastUpdate: string;
    /**
     * Publication date per indicator, "AAAA-MM-JJ" — the period the reading
     * DESCRIBES, not when it was fetched.
     *
     * The source's date normally, the administrator's when they have set one
     * on the override. `lastUpdate` is the latest of these, so a release
     * entered by hand ahead of the API moves the currency forward rather than
     * being invisible.
     *
     * Optional because it is additive: a fixture or an older caller that never
     * sets it still describes a valid currency, and every reader treats an
     * absent date the same way it treats an absent source.
     */
    periods?: Record<string, string>;
    nextReleases: Record<string, string>;
    previousData: Record<string, number | string>;
    /**
     * CurrencyData field -> the IndicatorSource that produced its current
     * value ("FXMACRODATA", "FRED", "OECD", "MANUAL", "DERIVED"). A field
     * absent here has never been fetched at all. Lets the UI flag a value
     * that is not backed by a live, automated source — see
     * IndicatorCategoryGrid's "needs a manual check" star.
     */
    dataSources: Record<string, string>;
    /**
     * Fields whose provider reports the reading as out of date. Connected to a
     * live source, but the number itself has gone stale — which the source
     * alone cannot tell you. Flagged for manual entry like an unconnected one.
     */
    staleFields: Record<string, boolean>;
    /**
     * Verdict of the last hand review against Trading Economics, per field.
     * Absent when that indicator has never been reviewed — which is a third
     * state, not a failure, and must render as neither green nor red.
     */
    checks: Record<string, { status: "MATCH" | "MISMATCH"; reference: string | null; checkedOn: string }>;
}

/** Score of a single indicator inside the weighted profile of a currency */
export interface IndicatorScore {
    /** Identifier — e.g. "au_fer", "us_nfp" */
    id: string;
    /** Displayed label */
    nom: string;
    /** Weight in the currency score (%) */
    poids: number;
    /** true = indicator specific to this country */
    specifique: boolean;
    /** Directional score [-10, +10], null when the data is unavailable */
    score: number | null;
    /** false = excluded from the computation (its weight leaves the denominator) */
    disponible: boolean;
}

export interface ScoreData {
    // Radar chart axes (Comparator) — aggregates per family
    growth: number;
    inflation: number;
    employment: number;
    trade: number;
    monetary: number;
    pmi: number;
    sentiment: number;

    /** Raw weighted average [-10, +10] */
    rawTotal: number;
    /** Final normalized score 0-100 */
    total: number;
    /** Real rate = nominal rate - CPI */
    realRate: number;

    // ── Per-profile scoring detail ────────────────────────────────
    /** Score of every indicator, sorted by descending weight */
    breakdown?: IndicatorScore[];
    /** Dominant driver of the currency — e.g. "Prix du pétrole" */
    moteurN1?: string;
    /** Profile particularity — explanatory note shown under the badge */
    particularite?: string;
    /** Name of the central bank */
    banqueCentrale?: string;
    /** Sum of the weights actually used (available indicators) */
    poidsUtilise?: number;
    /** Sum of the weights of the full profile (= 100) */
    poidsTotal?: number;
}

export interface CurrencyWithScore extends CurrencyData {
    scores: ScoreData;
}

// ================================================================
// MARKET CONTEXT
//
// Data of the indicators flagged { specifique: true } in the currency
// weight table. They do not come from CurrencyData.
//
// FUNDAMENTAL RULE: any value left at `null` = data unavailable.
// The engine then EXCLUDES the indicator from the computation and
// removes its weight from the denominator, instead of counting it as
// 0 (which would drag the currency towards neutral artificially).
//
// The legacy version read/wrote this structure from localStorage.
// The domain layer is pure: the context is always passed IN.
// ================================================================

/** Direction of an SNB FX intervention */
export type SnbIntervention = 'aucune' | 'affaiblir_chf' | 'renforcer_chf';

export interface MarketContext {
    // ── Commodities (% change over the recent period) ─────────────
    /** WTI/Brent crude — % change (driver n°1 of the CAD) */
    oilChangePct: number | null;
    /** Iron ore / coal — % change (driver n°1 of the AUD) */
    ironOreChangePct: number | null;
    /** GDT Fonterra auction — % change (driver n°1 of the NZD) */
    dairyGdtChangePct: number | null;

    // ── China (shared driver AUD + NZD) ───────────────────────────
    /** China PMI (NBS or Caixin) — level */
    chinaPmi: number | null;
    /** China PMI of the previous period — for the momentum */
    chinaPmiPrev: number | null;

    // ── Global risk appetite (JPY, CHF, AUD, NZD) ─────────────────
    /** VIX — current level */
    vix: number | null;
    /** VIX of the previous period — for the momentum */
    vixPrev: number | null;

    // ── Switzerland ───────────────────────────────────────────────
    /** EUR/CHF — % change (a drop = flows into the CHF = bullish CHF) */
    eurChfChangePct: number | null;
    /** SNB intervention on the FX market */
    snbIntervention: SnbIntervention | null;

    // ── Country-specific indicators ───────────────────────────────
    /** US NFP — job creations in thousands */
    usNfp: number | null;
    /** US NFP of the previous period */
    usNfpPrev: number | null;
    /** US retail sales — % MoM (already in CurrencyData but overridable) */
    usRetailOverride: number | null;
    /** German ZEW / IFO — economic sentiment index */
    euZew: number | null;
    /** ZEW of the previous period */
    euZewPrev: number | null;
    /** UK wage growth — % YoY */
    gbWageGrowth: number | null;
    /** UK retail sales — % MoM */
    gbRetail: number | null;
    /** Tokyo CPI — % YoY (leading indicator of the Japanese national CPI) */
    jpTokyoCpi: number | null;
    /** Japanese current account — bn JPY */
    jpCurrentAccount: number | null;
    /** Australian Employment Change — thousands */
    auEmploymentChange: number | null;
    /** Canadian Employment Change — thousands */
    caEmploymentChange: number | null;
    /** Canadian Ivey PMI — level */
    caIveyPmi: number | null;
    /** NZ quarterly employment — % change */
    nzEmploymentChange: number | null;
    /** Swiss KOF barometer — level (100 = long-term average) */
    chKof: number | null;

    /** Timestamp of the last update */
    lastUpdate: string;
}

/** Metadata of an editable market-context field — used by the admin page */
export interface MarketFieldMeta {
    key: keyof MarketContext;
    label: string;
    unit: string;
    devises: string[];
    hint: string;
}
