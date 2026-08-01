// ================================================================
// MARKET CONTEXT — data of the SPECIFIC indicators
//
// The indicators flagged { specifique: true } in currency-weights.ts
// do not come from CurrencyData (standard macro data). They live in
// the MarketContext, which is fed manually through the admin screen
// or by an API.
//
// FUNDAMENTAL RULE: any value at `null` = data unavailable. The engine
// then EXCLUDES the indicator from the computation and removes its
// weight from the denominator, instead of counting it as 0 (which
// would skew the score by dragging the currency towards neutral).
//
// PURITY: the legacy module persisted this structure in localStorage
// (loadMarketContext / saveMarketContext). Those functions are NOT
// ported — the domain layer never touches I/O. Callers build the
// context and pass it in.
// ================================================================

import type { MarketContext, MarketFieldMeta } from '../types';

/** Empty context — everything null, so every specific indicator is excluded */
export const EMPTY_MARKET_CONTEXT: MarketContext = {
    oilChangePct: null,
    ironOreChangePct: null,
    dairyGdtChangePct: null,
    chinaPmi: null,
    chinaPmiPrev: null,
    vix: null,
    vixPrev: null,
    eurChfChangePct: null,
    snbIntervention: null,
    usNfp: null,
    usNfpPrev: null,
    usRetailOverride: null,
    euZew: null,
    euZewPrev: null,
    gbWageGrowth: null,
    gbRetail: null,
    jpTokyoCpi: null,
    jpCurrentAccount: null,
    auEmploymentChange: null,
    caEmploymentChange: null,
    caIveyPmi: null,
    nzEmploymentChange: null,
    chKof: null,
    lastUpdate: '',
};

/**
 * Builds a market context from a partial payload (for instance the
 * result of parsing stored JSON, which the caller owns). Merging with
 * the empty context absorbs newly added fields.
 */
export function createMarketContext(partial: Partial<MarketContext> = {}): MarketContext {
    return { ...EMPTY_MARKET_CONTEXT, ...partial };
}

// ================================================================
// FIELD LIST FOR THE ADMIN UI
// ================================================================

/** Metadata of the editable fields — used by the admin page */
export const MARKET_FIELDS: MarketFieldMeta[] = [
    { key: 'oilChangePct',      label: 'Pétrole WTI — variation',      unit: '%',   devises: ['CAD'],        hint: 'Variation % sur la période récente' },
    { key: 'ironOreChangePct',  label: 'Minerai de fer — variation',   unit: '%',   devises: ['AUD'],        hint: 'Variation % du prix du fer/charbon' },
    { key: 'dairyGdtChangePct', label: 'GDT Fonterra — variation',     unit: '%',   devises: ['NZD'],        hint: 'Résultat de la dernière enchère GDT' },
    { key: 'chinaPmi',          label: 'PMI Chine',                    unit: 'pts', devises: ['AUD', 'NZD'], hint: 'NBS ou Caixin — 50 = seuil' },
    { key: 'chinaPmiPrev',      label: 'PMI Chine précédent',          unit: 'pts', devises: ['AUD', 'NZD'], hint: 'Pour calculer le momentum' },
    { key: 'vix',               label: 'VIX',                          unit: 'pts', devises: ['JPY', 'CHF', 'AUD', 'NZD'], hint: '<15 calme · >30 panique' },
    { key: 'vixPrev',           label: 'VIX précédent',                unit: 'pts', devises: ['JPY', 'CHF', 'AUD', 'NZD'], hint: 'Pour calculer le momentum' },
    { key: 'eurChfChangePct',   label: 'EUR/CHF — variation',          unit: '%',   devises: ['CHF'],        hint: 'Baisse = flux vers le CHF' },
    { key: 'usNfp',             label: 'NFP US',                       unit: 'k',   devises: ['USD'],        hint: 'Créations d\'emplois en milliers' },
    { key: 'usNfpPrev',         label: 'NFP US précédent',             unit: 'k',   devises: ['USD'],        hint: 'Pour calculer le momentum' },
    { key: 'usRetailOverride',  label: 'Retail sales US',              unit: '%',   devises: ['USD'],        hint: 'MoM — laisser vide pour utiliser la donnée macro' },
    { key: 'euZew',             label: 'ZEW / IFO Allemagne',          unit: 'pts', devises: ['EUR'],        hint: 'Sentiment des investisseurs' },
    { key: 'euZewPrev',         label: 'ZEW précédent',                unit: 'pts', devises: ['EUR'],        hint: 'Pour calculer le momentum' },
    { key: 'gbWageGrowth',      label: 'Salaires UK',                  unit: '%',   devises: ['GBP'],        hint: 'Croissance annuelle' },
    { key: 'gbRetail',          label: 'Retail sales UK',              unit: '%',   devises: ['GBP'],        hint: 'MoM' },
    { key: 'jpTokyoCpi',        label: 'CPI Tokyo',                    unit: '%',   devises: ['JPY'],        hint: 'Indicateur avancé du CPI national' },
    { key: 'jpCurrentAccount',  label: 'Compte courant Japon',         unit: 'Mds', devises: ['JPY'],        hint: 'En milliards de JPY' },
    { key: 'auEmploymentChange',label: 'Employment Change AU',         unit: 'k',   devises: ['AUD'],        hint: 'Créations nettes en milliers' },
    { key: 'caEmploymentChange',label: 'Employment Change CA',         unit: 'k',   devises: ['CAD'],        hint: 'Créations nettes en milliers' },
    { key: 'caIveyPmi',         label: 'Ivey PMI Canada',              unit: 'pts', devises: ['CAD'],        hint: '50 = seuil expansion' },
    { key: 'nzEmploymentChange',label: 'Emploi trimestriel NZ',        unit: '%',   devises: ['NZD'],        hint: 'Variation trimestrielle en %' },
    { key: 'chKof',             label: 'Baromètre KOF Suisse',         unit: 'pts', devises: ['CHF'],        hint: '100 = moyenne long terme' },
];
