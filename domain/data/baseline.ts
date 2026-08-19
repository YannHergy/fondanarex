// ============================================================
// BASELINE MACRO DATA
//
// Generated from the legacy src/data.ts INITIAL_CURRENCIES constant.
// In the legacy app this object WAS the database: it was loaded into
// React state, merged with whatever localStorage held, and written back
// on every change. Here it is only a starting point — the seed writes
// these as IndicatorValue rows and nothing reads this file at runtime.
//
// Each indicator carries its previous reading. The legacy shape kept that
// in a parallel `previousData` map, which is why the old code was full of
// `*Prev` lookups; here it becomes a second dated row.
// ============================================================

export interface BaselineIndicator {
    current: number;
    /** Prior period reading, when the legacy data had one. */
    previous?: number;
    /** Next scheduled publication, ISO date. */
    nextRelease?: string;
}

export interface CurrencyBaseline {
    code: string;
    /** Central bank stance — per-user data, seeded into CurrencyNote. */
    stance: string;
    previousStance?: string;
    /** Reference date of the readings below, ISO date. */
    lastUpdate: string;
    indicators: Record<string, BaselineIndicator>;
}

/**
 * Les orientations ci-dessous ont ete relevees le 2026-08-18 sur les
 * communiques officiels des huit banques centrales, recoupees avec la
 * trajectoire reelle des taux directeurs sur douze mois.
 *
 * Elles etaient restees celles de l'ancienne application, et ce n'est pas
 * anodin : `lib/bootstrap.ts` les seme dans CurrencyNote a la creation de
 * CHAQUE compte. Constate en production le 2026-08-19, apres une
 * reinitialisation de la base : le nouveau proprietaire a demarre avec un JPY
 * « accommodant » alors que la Banque du Japon monte ses taux depuis un an,
 * soit un score de 32 — verdict « Sell » — la ou le chiffre juste est 56,
 * « Neutre ». Vingt-quatre points d'ecart sur une seule valeur semee.
 *
 * A reverifier quand les banques bougent ; une orientation perimee ici se
 * propage silencieusement a tout nouveau compte.
 */
export const CURRENCY_BASELINE: readonly CurrencyBaseline[] = [
    {
        code: 'USD',
        stance: 'Very Hawkish',
        previousStance: 'Neutral',
        lastUpdate: '2026-07-29',
        indicators: {
            interestRate: { current: 3.75, previous: 3.75, nextRelease: '2026-07-29' },
            gdpQoQ: { current: 2.1, previous: 0.5, nextRelease: '2026-07-30' },
            pmiManufacturing: { current: 53.3, previous: 54, nextRelease: '2026-08-03' },
            pmiServices: { current: 54, previous: 54.5, nextRelease: '2026-08-05' },
            cpi: { current: 3.5, previous: 4.2, nextRelease: '2026-08-12' },
            coreCpi: { current: 2.6, previous: 2.9, nextRelease: '2026-08-12' },
            ppi: { current: 0.1 },
            unemployment: { current: 4.2, previous: 4.3, nextRelease: '2026-08-07' },
            retailSales: { current: 0.2, previous: 1, nextRelease: '2026-08-14' },
            wagePPI: { current: 3.5, previous: 3.5, nextRelease: '2026-08-07' },
            tradeBalance: { current: -77.6, previous: -54.6, nextRelease: '2026-08-04' },
            currentAccount: { current: -52.83 },
            consumerConfidence: { current: 53.3 },
            nfp: { current: 57, previous: 129, nextRelease: '2026-08-07' },
            corePce: { current: 3.4, previous: 3.3, nextRelease: '2026-07-31' },
        },
    },
    {
        code: 'EUR',
        stance: 'Hawkish',
        previousStance: 'Hawkish',
        lastUpdate: '2026-07-29',
        indicators: {
            interestRate: { current: 2.25, previous: 2.25, nextRelease: '2026-09-11' },
            gdpQoQ: { current: -0.2, previous: 0.2, nextRelease: '2026-07-30' },
            pmiManufacturing: { current: 52.2, previous: 50.3, nextRelease: '2026-08-01' },
            pmiServices: { current: 51.6, previous: 49.4, nextRelease: '2026-08-05' },
            cpi: { current: 2.8, previous: 3.2, nextRelease: '2026-07-31' },
            coreCpi: { current: 2.4, previous: 2.6, nextRelease: '2026-07-31' },
            ppi: { current: -0.5 },
            unemployment: { current: 6.2, previous: 6.2, nextRelease: '2026-08-04' },
            retailSales: { current: 0, previous: 0.1, nextRelease: '2026-03-05' },
            wagePPI: { current: 2.46, previous: 2.95, nextRelease: '2026-08-21' },
            tradeBalance: { current: -7.8, previous: -1, nextRelease: '2026-08-18' },
            currentAccount: { current: 18 },
            consumerConfidence: { current: 88 },
            zew: { current: 26.3, previous: 10.5, nextRelease: '2026-08-18' },
            ifo: { current: 86.6, previous: 85.7, nextRelease: '2026-08-25' },
        },
    },
    {
        code: 'GBP',
        stance: 'Hawkish',
        previousStance: 'Neutral',
        lastUpdate: '2026-02-03',
        indicators: {
            interestRate: { current: 3.17, previous: 4, nextRelease: '2026-03-19' },
            gdpQoQ: { current: 0.1, previous: 0.2, nextRelease: '2026-03-12' },
            pmiManufacturing: { current: 51.8, previous: 50.6, nextRelease: '2026-03-02' },
            pmiServices: { current: 54, previous: 51.4, nextRelease: '2026-03-05' },
            cpi: { current: 3.4, previous: 3.2, nextRelease: '2026-03-19' },
            coreCpi: { current: 3.5, nextRelease: '2026-03-19' },
            ppi: { current: -0.2 },
            unemployment: { current: 5.1, previous: 5.1, nextRelease: '2026-03-18' },
            retailSales: { current: 0, previous: 0.1, nextRelease: '2026-03-20' },
            wagePPI: { current: 0.3, previous: 0.2, nextRelease: '2026-03-18' },
            tradeBalance: { current: -7.633, previous: -8.164, nextRelease: '2026-03-12' },
            currentAccount: { current: -13.5 },
            consumerConfidence: { current: -16, previous: -17 },
        },
    },
    {
        code: 'JPY',
        stance: 'Very Hawkish',
        previousStance: 'Dovish',
        lastUpdate: '2026-02-03',
        indicators: {
            interestRate: { current: 0, previous: -0.1, nextRelease: '2026-03-19' },
            gdpQoQ: { current: -0.5, previous: -0.1, nextRelease: '2026-03-24' },
            pmiManufacturing: { current: 49, previous: 49.5, nextRelease: '2026-03-02' },
            pmiServices: { current: 50.5, previous: 50.8, nextRelease: '2026-03-04' },
            cpi: { current: 2.6, previous: 2.8, nextRelease: '2026-03-16' },
            coreCpi: { current: 2.3 },
            ppi: { current: -0.4 },
            unemployment: { current: 2.5, previous: 2.6, nextRelease: '2026-03-09' },
            retailSales: { current: 0, previous: 0.1, nextRelease: '2026-03-30' },
            wagePPI: { current: 0.2, previous: 0.1, nextRelease: '2026-03-09' },
            tradeBalance: { current: -0.5, previous: -0.3, nextRelease: '2026-03-23' },
            currentAccount: { current: -0.8 },
            consumerConfidence: { current: 38 },
        },
    },
    {
        code: 'AUD',
        stance: 'Hawkish',
        previousStance: 'Neutral',
        lastUpdate: '2026-02-03',
        indicators: {
            interestRate: { current: 3.86, previous: 3.6, nextRelease: '2026-04-01' },
            gdpQoQ: { current: 0.4, previous: 0.7, nextRelease: '2026-03-04' },
            pmiManufacturing: { current: 52.3, previous: 51.6, nextRelease: '2026-03-02' },
            pmiServices: { current: 56.3, previous: 51.1, nextRelease: '2026-03-04' },
            cpi: { current: 3.8, previous: 3.4, nextRelease: '2026-02-26' },
            coreCpi: { current: 3.8, nextRelease: '2026-04-29' },
            ppi: { current: 0.3 },
            unemployment: { current: 4.1, previous: 4.3, nextRelease: '2026-03-19' },
            retailSales: { current: 0.3, previous: 0.2, nextRelease: '2026-03-07' },
            wagePPI: { current: 0.5, previous: 0.4, nextRelease: '2026-05-15' },
            tradeBalance: { current: 2.025, previous: 1.558, nextRelease: '2026-03-05' },
            currentAccount: { current: 9.5 },
            consumerConfidence: { current: 92 },
        },
    },
    {
        code: 'CAD',
        stance: 'Neutral',
        previousStance: 'Neutral',
        lastUpdate: '2026-02-03',
        indicators: {
            interestRate: { current: 2.5, previous: 2.5, nextRelease: '2026-03-12' },
            gdpQoQ: { current: 0.6, previous: -0.5, nextRelease: '2026-02-27' },
            pmiManufacturing: { current: 48.8, previous: 49.2, nextRelease: '2026-03-02' },
            pmiServices: { current: 50.2, previous: 49.8, nextRelease: '2026-03-04' },
            cpi: { current: 2.4, previous: 2.2, nextRelease: '2026-03-17' },
            coreCpi: { current: 2.6, nextRelease: '2026-03-17' },
            ppi: { current: 0.2 },
            unemployment: { current: 6.8, previous: 6.5, nextRelease: '2026-03-06' },
            retailSales: { current: 0.1, previous: 0.2, nextRelease: '2026-03-28' },
            wagePPI: { current: 0.3, previous: 0.3, nextRelease: '2026-03-06' },
            tradeBalance: { current: -1.92, previous: -0.32, nextRelease: '2026-03-05' },
            currentAccount: { current: 0.8 },
            consumerConfidence: { current: 85 },
        },
    },
    {
        code: 'NZD',
        stance: 'Very Hawkish',
        previousStance: 'Neutral',
        lastUpdate: '2026-02-03',
        indicators: {
            interestRate: { current: 2.25, previous: 2.25, nextRelease: '2026-04-09' },
            gdpQoQ: { current: 1.1, previous: -1, nextRelease: '2026-03-19' },
            pmiManufacturing: { current: 56.1, previous: 51.4, nextRelease: '2026-03-13' },
            pmiServices: { current: 51.5, previous: 46.9, nextRelease: '2026-03-13' },
            cpi: { current: 3.1, previous: 3, nextRelease: '2026-04-17' },
            coreCpi: { current: 4.2, nextRelease: '2026-04-17' },
            ppi: { current: 0.4 },
            unemployment: { current: 5.4, previous: 5.3, nextRelease: '2026-06-05' },
            retailSales: { current: -0.1, previous: 0, nextRelease: '2026-04-05' },
            wagePPI: { current: 0.6, previous: 0.5, nextRelease: '2026-03-13' },
            tradeBalance: { current: 0.031, previous: -0.201, nextRelease: '2026-03-20' },
            currentAccount: { current: -2 },
            consumerConfidence: { current: 78 },
        },
    },
    {
        code: 'CHF',
        stance: 'Neutral',
        previousStance: 'Neutral',
        lastUpdate: '2026-02-03',
        indicators: {
            interestRate: { current: 1.75, previous: 1.75, nextRelease: '2026-03-20' },
            gdpQoQ: { current: 0.3, previous: 0.2, nextRelease: '2026-03-12' },
            pmiManufacturing: { current: 50.5, previous: 50, nextRelease: '2026-03-01' },
            pmiServices: { current: 52.3, previous: 51.8, nextRelease: '2026-03-03' },
            cpi: { current: 1.7, previous: 1.8, nextRelease: '2026-03-14' },
            coreCpi: { current: 1.3 },
            ppi: { current: -0.3 },
            unemployment: { current: 2.1, previous: 2.1, nextRelease: '2026-03-07' },
            retailSales: { current: 0.2, previous: 0.1, nextRelease: '2026-03-26' },
            wagePPI: { current: 0.1, previous: 0.1, nextRelease: '2026-03-07' },
            tradeBalance: { current: 4, previous: 3.8, nextRelease: '2026-03-22' },
            currentAccount: { current: 5.5 },
            consumerConfidence: { current: 102 },
        },
    },
];

