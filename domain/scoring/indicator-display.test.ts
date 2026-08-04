import { describe, it, expect } from 'vitest';

import type { CurrencyData } from '../types';
import { EMPTY_MARKET_CONTEXT, createMarketContext } from '../market-context/context';
import { getIndicatorDisplay } from './indicator-display';

function makeCurrency(overrides: Partial<CurrencyData> = {}): CurrencyData {
    return {
        code: 'USD',
        name: 'US Dollar',
        countryCode: '',
        interestRate: 4.5,
        stance: 'Hawkish',
        category: 'Neutral',
        gdpQoQ: 1.2,
        pmiManufacturing: 49,
        pmiServices: 53,
        cpi: 2.4,
        coreCpi: 3.1,
        ppi: 0,
        unemployment: 4.1,
        retailSales: 0.3,
        wagePPI: 0.4,
        tradeBalance: -6,
        currentAccount: 0,
        consumerConfidence: 98,
        geopoliticalRisks: '',
        eventsToWatch: [],
        qualitativeAnalysis: '',
        lastUpdate: '',
        nextReleases: {},
        previousData: {},
        dataSources: {},
        ...overrides,
    };
}

describe('getIndicatorDisplay', () => {
    const curr = makeCurrency();

    it('formats the monetary policy indicators', () => {
        expect(getIndicatorDisplay('us_taux', curr, EMPTY_MARKET_CONTEXT, null))
            .toEqual({ label: 'TAUX', value: '4.5%', available: true });
        expect(getIndicatorDisplay('us_orientation', curr, EMPTY_MARKET_CONTEXT, null).value).toBe('HAWK');
        expect(getIndicatorDisplay('us_orientation', makeCurrency({ stance: 'Very Dovish' }), EMPTY_MARKET_CONTEXT, null).value).toBe('V.DOVE');
    });

    it('falls back on the SNB stance when no intervention is recorded', () => {
        const chf = makeCurrency({ code: 'CHF', stance: 'Neutral' });
        expect(getIndicatorDisplay('ch_interventions', chf, EMPTY_MARKET_CONTEXT, null))
            .toEqual({ label: 'SNB', value: 'NEUTRE', available: true });
        const ctx = createMarketContext({ snbIntervention: 'affaiblir_chf' });
        expect(getIndicatorDisplay('ch_interventions', chf, ctx, null))
            .toEqual({ label: 'BNS', value: 'AFFAIBL', available: true });
    });

    it('formats percentages with an explicit sign', () => {
        expect(getIndicatorDisplay('us_pib', curr, EMPTY_MARKET_CONTEXT, null).value).toBe('+1.2%');
        expect(getIndicatorDisplay('us_pib', makeCurrency({ gdpQoQ: -0.4 }), EMPTY_MARKET_CONTEXT, null).value).toBe('-0.4%');
    });

    it('averages the two PMIs for the composite label', () => {
        expect(getIndicatorDisplay('ca_pmi', curr, EMPTY_MARKET_CONTEXT, null).value).toBe('51.0');
    });

    it('marks an indicator unavailable when neither source has the value', () => {
        expect(getIndicatorDisplay('ca_petrole', makeCurrency({ code: 'CAD' }), EMPTY_MARKET_CONTEXT, null))
            .toEqual({ label: 'PÉTROLE', value: '—', available: false });
        expect(getIndicatorDisplay('eu_ifo', makeCurrency({ code: 'EUR' }), EMPTY_MARKET_CONTEXT, null).available).toBe(false);
        expect(getIndicatorDisplay('jp_risque', makeCurrency({ code: 'JPY' }), EMPTY_MARKET_CONTEXT, null))
            .toEqual({ label: 'VIX', value: '—', available: false });
        expect(getIndicatorDisplay('us_unknown', curr, EMPTY_MARKET_CONTEXT, null).available).toBe(false);
    });

    it('prefers the currency value over the market context', () => {
        const ctx = createMarketContext({ oilChangePct: -2 });
        const cad = makeCurrency({ code: 'CAD', commodityPrice: 6 });
        expect(getIndicatorDisplay('ca_petrole', cad, ctx, null).value).toBe('+6.0%');
        expect(getIndicatorDisplay('ca_petrole', makeCurrency({ code: 'CAD' }), ctx, null).value).toBe('-2.0%');
    });

    it('shows the US spillover score when no raw index was provided', () => {
        const cad = makeCurrency({ code: 'CAD' });
        expect(getIndicatorDisplay('ca_us', cad, EMPTY_MARKET_CONTEXT, 3.24).value).toBe('+3.2');
        expect(getIndicatorDisplay('ca_us', cad, EMPTY_MARKET_CONTEXT, null).available).toBe(false);
        expect(getIndicatorDisplay('ca_us', makeCurrency({ code: 'CAD', usSpillover: 12 }), EMPTY_MARKET_CONTEXT, null).value).toBe('+12');
    });

    it('reads the employment change in % for the NZD and in thousands elsewhere', () => {
        expect(getIndicatorDisplay('nz_emploi', makeCurrency({ code: 'NZD', employmentChange: 0.6 }), EMPTY_MARKET_CONTEXT, null).value).toBe('+0.6%');
        expect(getIndicatorDisplay('au_emploi', makeCurrency({ code: 'AUD', employmentChange: 32 }), EMPTY_MARKET_CONTEXT, null).value).toBe('+32k');
        // Fallback on the unemployment rate
        expect(getIndicatorDisplay('au_emploi', makeCurrency({ code: 'AUD' }), EMPTY_MARKET_CONTEXT, null).value).toBe('4.1%');
    });

    it('shows the Japanese current account instead of the trade balance when known', () => {
        const jpy = makeCurrency({ code: 'JPY' });
        expect(getIndicatorDisplay('jp_balance', jpy, EMPTY_MARKET_CONTEXT, null).value).toBe('-6B');
        const ctx = createMarketContext({ jpCurrentAccount: 2100 });
        expect(getIndicatorDisplay('jp_balance', jpy, ctx, null))
            .toEqual({ label: 'C.COURANT', value: '2100', available: true });
    });

    it('lets the market context override the retail sales', () => {
        expect(getIndicatorDisplay('us_retail', curr, EMPTY_MARKET_CONTEXT, null).value).toBe('+0.3%');
        expect(getIndicatorDisplay('us_retail', curr, createMarketContext({ usRetailOverride: -0.8 }), null).value).toBe('-0.8%');
    });

    it('shows the inflation and employment values as read from the currency', () => {
        expect(getIndicatorDisplay('us_cpi', curr, EMPTY_MARKET_CONTEXT, null).value).toBe('2.4%');
        expect(getIndicatorDisplay('us_core_cpi', curr, EMPTY_MARKET_CONTEXT, null).value).toBe('3.1%');
        expect(getIndicatorDisplay('us_chomage', curr, EMPTY_MARKET_CONTEXT, null).value).toBe('4.1%');
        expect(getIndicatorDisplay('us_pmi_manu', curr, EMPTY_MARKET_CONTEXT, null).value).toBe('49');
        expect(getIndicatorDisplay('us_pmi_serv', curr, EMPTY_MARKET_CONTEXT, null).value).toBe('53');
        expect(getIndicatorDisplay('us_salaires', curr, EMPTY_MARKET_CONTEXT, null).value).toBe('+0.4%');
        expect(getIndicatorDisplay('us_nfp', makeCurrency({ nfp: 210 }), EMPTY_MARKET_CONTEXT, null).value).toBe('+210k');
    });

    it('reads the German surveys and the Swiss KOF from either source', () => {
        const eur = makeCurrency({ code: 'EUR' });
        expect(getIndicatorDisplay('eu_zew', eur, createMarketContext({ euZew: 14 }), null).value).toBe('14');
        expect(getIndicatorDisplay('eu_zew', makeCurrency({ code: 'EUR', zew: 21 }), EMPTY_MARKET_CONTEXT, null).value).toBe('21');
        expect(getIndicatorDisplay('eu_ifo', makeCurrency({ code: 'EUR', ifo: 88 }), EMPTY_MARKET_CONTEXT, null).value).toBe('88');
        expect(getIndicatorDisplay('ch_kof', makeCurrency({ code: 'CHF' }), createMarketContext({ chKof: 101 }), null).value).toBe('101');
        expect(getIndicatorDisplay('ca_ivey', makeCurrency({ code: 'CAD' }), createMarketContext({ caIveyPmi: 52 }), null).value).toBe('52');
    });

    it('falls back on the consumer confidence for the generic sentiment axis', () => {
        expect(getIndicatorDisplay('eu_sentiment', makeCurrency({ code: 'EUR' }), EMPTY_MARKET_CONTEXT, null))
            .toEqual({ label: 'CONF', value: '98', available: true });
        expect(getIndicatorDisplay('eu_sentiment', makeCurrency({ code: 'EUR' }), createMarketContext({ euZew: 5 }), null).label).toBe('ZEW');
    });

    it('reads the Tokyo CPI, the China PMI and the EUR/CHF pair', () => {
        expect(getIndicatorDisplay('jp_cpi_tokyo', makeCurrency({ code: 'JPY', tokyoCpi: 2.8 }), EMPTY_MARKET_CONTEXT, null).value).toBe('2.8%');
        expect(getIndicatorDisplay('jp_cpi_tokyo', makeCurrency({ code: 'JPY' }), createMarketContext({ jpTokyoCpi: 2.2 }), null).value).toBe('2.2%');
        expect(getIndicatorDisplay('au_chine', makeCurrency({ code: 'AUD' }), createMarketContext({ chinaPmi: 50.4 }), null).value).toBe('50.4');
        expect(getIndicatorDisplay('au_fer', makeCurrency({ code: 'AUD' }), createMarketContext({ ironOreChangePct: -4 }), null).value).toBe('-4.0%');
        expect(getIndicatorDisplay('nz_laitiers', makeCurrency({ code: 'NZD' }), createMarketContext({ dairyGdtChangePct: 3.5 }), null).value).toBe('+3.5%');
        expect(getIndicatorDisplay('ch_eurchf', makeCurrency({ code: 'CHF', eurChf: -1.2 }), EMPTY_MARKET_CONTEXT, null).value).toBe('-1.2%');
        expect(getIndicatorDisplay('ch_risque', makeCurrency({ code: 'CHF', riskSentiment: 22 }), EMPTY_MARKET_CONTEXT, null).value).toBe('22');
    });

    it('prefers the dedicated UK wage figure when present', () => {
        const gbp = makeCurrency({ code: 'GBP', wagePPI: 0.4 });
        expect(getIndicatorDisplay('gb_salaires', gbp, EMPTY_MARKET_CONTEXT, null).value).toBe('+0.4%');
        expect(getIndicatorDisplay('gb_salaires', gbp, createMarketContext({ gbWageGrowth: 5.2 }), null).value).toBe('5.2%');
    });
});
