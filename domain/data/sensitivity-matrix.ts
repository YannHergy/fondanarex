// ================================================================
// SENSITIVITY MATRIX — how sensitive each currency is to each type of
// event.
// Scale: 0 = no impact, 5 = extreme impact
// ================================================================

export type SensitivityRating = 0 | 1 | 2 | 3 | 4 | 5;

export interface CurrencySensitivity {
    oil: SensitivityRating;
    china_pmi: SensitivityRating;
    vix: SensitivityRating;
    us_rates: SensitivityRating;
    nfp: SensitivityRating;
    cpi: SensitivityRating;
    gdp: SensitivityRating;
    pmi: SensitivityRating;
    central_bank: SensitivityRating;
    gold: SensitivityRating;
    dairy: SensitivityRating;
    iron_ore: SensitivityRating;
    carry_trade: SensitivityRating;
    geopolitics: SensitivityRating;
}

export type SensitivityKey = keyof CurrencySensitivity;

export const SENSITIVITY_LABELS: Record<SensitivityKey, string> = {
    oil: 'Pétrole WTI',
    china_pmi: 'PMI Chine',
    vix: 'VIX / Risk-Off',
    us_rates: 'Taux Obligataires US',
    nfp: 'NFP / Emploi',
    cpi: 'CPI / Inflation',
    gdp: 'PIB',
    pmi: 'PMI',
    central_bank: 'Banque Centrale',
    gold: 'Or (XAU)',
    dairy: 'Prix Laitiers',
    iron_ore: 'Minerai de Fer',
    carry_trade: 'Carry Trade',
    geopolitics: 'Géopolitique',
};

export const SENSITIVITY_MATRIX: Record<string, CurrencySensitivity> = {
    USD: {
        oil: 2, china_pmi: 1, vix: 3, us_rates: 5, nfp: 5,
        cpi: 5, gdp: 4, pmi: 4, central_bank: 5, gold: 2,
        dairy: 0, iron_ore: 0, carry_trade: 2, geopolitics: 4,
    },
    EUR: {
        oil: 3, china_pmi: 2, vix: 2, us_rates: 3, nfp: 3,
        cpi: 4, gdp: 4, pmi: 5, central_bank: 5, gold: 1,
        dairy: 0, iron_ore: 0, carry_trade: 1, geopolitics: 5,
    },
    GBP: {
        oil: 2, china_pmi: 1, vix: 3, us_rates: 3, nfp: 3,
        cpi: 5, gdp: 4, pmi: 4, central_bank: 5, gold: 1,
        dairy: 0, iron_ore: 0, carry_trade: 2, geopolitics: 4,
    },
    JPY: {
        oil: 4, china_pmi: 2, vix: 5, us_rates: 5, nfp: 4,
        cpi: 4, gdp: 3, pmi: 3, central_bank: 5, gold: 4,
        dairy: 0, iron_ore: 0, carry_trade: 5, geopolitics: 5,
    },
    AUD: {
        oil: 2, china_pmi: 5, vix: 5, us_rates: 3, nfp: 3,
        cpi: 4, gdp: 4, pmi: 4, central_bank: 4, gold: 2,
        dairy: 1, iron_ore: 5, carry_trade: 3, geopolitics: 2,
    },
    NZD: {
        oil: 1, china_pmi: 4, vix: 5, us_rates: 3, nfp: 3,
        cpi: 4, gdp: 4, pmi: 3, central_bank: 4, gold: 2,
        dairy: 5, iron_ore: 2, carry_trade: 3, geopolitics: 2,
    },
    CAD: {
        oil: 5, china_pmi: 2, vix: 3, us_rates: 4, nfp: 4,
        cpi: 4, gdp: 4, pmi: 3, central_bank: 5, gold: 1,
        dairy: 0, iron_ore: 0, carry_trade: 1, geopolitics: 3,
    },
    CHF: {
        oil: 1, china_pmi: 1, vix: 5, us_rates: 2, nfp: 2,
        cpi: 3, gdp: 3, pmi: 3, central_bank: 4, gold: 5,
        dairy: 0, iron_ore: 0, carry_trade: 2, geopolitics: 5,
    },
};

/** Maps an indicator id to its matching sensitivity key */
export function indicatorToSensitivityKey(indicatorId: string): SensitivityKey | null {
    if (/\boil\b|wti|crude|petrol/.test(indicatorId)) return 'oil';
    if (/china_pmi/.test(indicatorId)) return 'china_pmi';
    if (/\bvix\b/.test(indicatorId)) return 'vix';
    if (/gold/.test(indicatorId)) return 'gold';
    if (/dairy|gdt|fonterra|milk/.test(indicatorId)) return 'dairy';
    if (/iron_ore/.test(indicatorId)) return 'iron_ore';
    if (/carry_trade|carry_position|cot_net/.test(indicatorId)) return 'carry_trade';
    if (/nfp|employment_change|claimant|initial_claims|jolts/.test(indicatorId)) return 'nfp';
    if (/fomc|boe_meeting|boj_meeting|rba_meeting|snb_meeting|boc_meeting|rbnz_meeting|ecb_meeting/.test(indicatorId)) return 'central_bank';
    if (/\bcpi\b|pce|hicp|inflation|cpi_quarterly/.test(indicatorId)) return 'cpi';
    if (/\bgdp\b|pib/.test(indicatorId)) return 'gdp';
    if (/pmi|ism|ivey|tankan|kof|ifo|zew|nab_business|anz_business/.test(indicatorId)) return 'pmi';
    if (/geopolit|political_risk|intervention|us_10y|yield_curve|gilt/.test(indicatorId)) return 'geopolitics';
    if (/us_10y|rate_differential|yield/.test(indicatorId)) return 'us_rates';
    return null;
}

export const SENSITIVITY_RATING_LABELS: string[] = ['Aucune', 'Faible', 'Modérée', 'Forte', 'Très Forte', 'Extrême'];

export const SENSITIVITY_COLORS: string[] = [
    '#374151', // 0 — none
    '#1e3a5f', // 1 — low
    '#1e4a7a', // 2 — moderate
    '#1e5f9e', // 3 — strong
    '#1a7fc2', // 4 — very strong
    '#0ea5e9', // 5 — extreme
];
