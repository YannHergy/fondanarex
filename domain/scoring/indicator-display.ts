// ================================================================
// DISPLAY OF THE INDICATORS ON THE DASHBOARD CARDS
//
// Translates an indicator identifier into a short label + formatted
// real value, so every card shows the REAL drivers of its currency
// instead of 4 frozen metrics identical everywhere.
//
// Pure formatting: no I/O, no clock. The labels are kept verbatim
// from the legacy app so the UI stays identical.
// ================================================================

import type { CurrencyData, MarketContext } from '../types';
import { indicatorKind } from '../data/currency-weights';

export interface IndicatorDisplay {
    /** Short label (<= 8 characters) sized for the width of a card */
    label: string;
    /** Value formatted with its unit */
    value: string;
    /** false = missing data, displayed greyed out */
    available: boolean;
}

/** Formats a percentage with its sign */
function fmtPct(v: number, decimals = 1): string {
    return `${v > 0 ? '+' : ''}${v.toFixed(decimals)}%`;
}

/** Abbreviates the central bank stance so it fits inside a card */
function fmtStance(stance: CurrencyData['stance']): string {
    switch (stance) {
        case 'Very Hawkish': return 'V.HAWK';
        case 'Hawkish':      return 'HAWK';
        case 'Neutral':      return 'NEUTRE';
        case 'Dovish':       return 'DOVE';
        case 'Very Dovish':  return 'V.DOVE';
        default:             return '—';
    }
}

/**
 * Returns the short label and the real value of an indicator.
 *
 * @param score Directional score of the indicator — used as a fallback
 *              for indicators without a natural raw value (US
 *              spillover, SNB interventions).
 */
export function getIndicatorDisplay(
    id: string,
    curr: CurrencyData,
    ctx: MarketContext,
    score: number | null,
): IndicatorDisplay {
    const kind = indicatorKind(id);
    const na = (label: string): IndicatorDisplay => ({ label, value: '—', available: false });

    switch (kind) {

        // ── Monetary policy ──────────────────────────────────────
        case 'taux':
            return { label: 'TAUX', value: `${curr.interestRate}%`, available: true };
        case 'orientation':
            return { label: 'STANCE', value: fmtStance(curr.stance), available: true };
        case 'interventions':
            // Without intervention data, show the SNB stance instead
            return ctx.snbIntervention === null
                ? { label: 'SNB', value: fmtStance(curr.stance), available: true }
                : { label: 'BNS', value: ctx.snbIntervention === 'aucune' ? 'AUCUNE' : ctx.snbIntervention === 'affaiblir_chf' ? 'AFFAIBL' : 'RENFORC', available: true };

        // ── Inflation ────────────────────────────────────────────
        case 'cpi':
        case 'hicp':
            return { label: 'CPI', value: `${curr.cpi}%`, available: true };
        case 'core_cpi':
        case 'core_hicp':
            return { label: 'CORE', value: `${curr.coreCpi}%`, available: true };
        case 'cpi_tokyo':
            if (typeof curr.tokyoCpi === 'number') return { label: 'CPI TKY', value: `${curr.tokyoCpi}%`, available: true };
            return ctx.jpTokyoCpi === null ? na('CPI TKY') : { label: 'CPI TKY', value: `${ctx.jpTokyoCpi}%`, available: true };

        // ── Growth ───────────────────────────────────────────────
        case 'pib':
            return { label: 'GDP', value: fmtPct(curr.gdpQoQ), available: true };
        case 'pmi_manu':
            return { label: 'PMI MFG', value: `${curr.pmiManufacturing}`, available: true };
        case 'pmi_serv':
            return { label: 'PMI SRV', value: `${curr.pmiServices}`, available: true };
        case 'pmi':
            return { label: 'PMI', value: ((curr.pmiManufacturing + curr.pmiServices) / 2).toFixed(1), available: true };
        case 'ivey':
            return ctx.caIveyPmi === null ? na('IVEY') : { label: 'IVEY', value: `${ctx.caIveyPmi}`, available: true };
        case 'kof':
            return ctx.chKof === null ? na('KOF') : { label: 'KOF', value: `${ctx.chKof}`, available: true };
        case 'zew':
            if (typeof curr.zew === 'number') return { label: 'ZEW', value: `${curr.zew}`, available: true };
            return ctx.euZew === null ? na('ZEW') : { label: 'ZEW', value: `${ctx.euZew}`, available: true };
        case 'ifo':
            return typeof curr.ifo === 'number' ? { label: 'IFO', value: `${curr.ifo}`, available: true } : na('IFO');
        case 'sentiment':
            return ctx.euZew === null
                ? { label: 'CONF', value: `${curr.consumerConfidence}`, available: true }
                : { label: 'ZEW', value: `${ctx.euZew}`, available: true };

        // ── Employment ───────────────────────────────────────────
        case 'chomage':
            return { label: 'CHÔMAGE', value: `${curr.unemployment}%`, available: true };
        case 'nfp':
            if (typeof curr.nfp === 'number') return { label: 'NFP', value: `${curr.nfp > 0 ? '+' : ''}${curr.nfp}k`, available: true };
            return ctx.usNfp === null ? na('NFP') : { label: 'NFP', value: `${ctx.usNfp}k`, available: true };
        case 'salaires':
            if (curr.code === 'GBP' && ctx.gbWageGrowth !== null) {
                return { label: 'SALAIRES', value: `${ctx.gbWageGrowth}%`, available: true };
            }
            return { label: 'SALAIRES', value: fmtPct(curr.wagePPI), available: true };
        case 'emploi': {
            if (typeof curr.employmentChange === 'number') {
                const v = curr.employmentChange;
                return { label: 'EMPLOI', value: curr.code === 'NZD' ? fmtPct(v) : `${v > 0 ? '+' : ''}${v}k`, available: true };
            }
            if (curr.code === 'AUD' && ctx.auEmploymentChange !== null) return { label: 'EMPLOI', value: `${ctx.auEmploymentChange > 0 ? '+' : ''}${ctx.auEmploymentChange}k`, available: true };
            if (curr.code === 'CAD' && ctx.caEmploymentChange !== null) return { label: 'EMPLOI', value: `${ctx.caEmploymentChange > 0 ? '+' : ''}${ctx.caEmploymentChange}k`, available: true };
            if (curr.code === 'NZD' && ctx.nzEmploymentChange !== null) return { label: 'EMPLOI', value: fmtPct(ctx.nzEmploymentChange), available: true };
            return { label: 'EMPLOI', value: `${curr.unemployment}%`, available: true };
        }

        // ── External trade ───────────────────────────────────────
        case 'balance':
            if (curr.code === 'JPY' && ctx.jpCurrentAccount !== null) {
                return { label: 'C.COURANT', value: `${ctx.jpCurrentAccount}`, available: true };
            }
            return { label: 'BALANCE', value: `${curr.tradeBalance}B`, available: true };
        case 'retail': {
            const v = curr.code === 'USD' ? ctx.usRetailOverride
                    : curr.code === 'GBP' ? ctx.gbRetail
                    : null;
            return { label: 'RETAIL', value: fmtPct(v ?? curr.retailSales), available: true };
        }

        // ── Commodities ──────────────────────────────────────────
        case 'petrole':
            // Shown as the price it is, which is also what Trading Economics
            // publishes — so the figure can actually be checked against it.
            if (typeof curr.oilPrice === 'number') return { label: 'PÉTROLE', value: `${curr.oilPrice.toFixed(2)}$`, available: true };
            if (typeof curr.commodityPrice === 'number') return { label: 'PÉTROLE', value: fmtPct(curr.commodityPrice), available: true };
            return ctx.oilChangePct === null ? na('PÉTROLE') : { label: 'PÉTROLE', value: fmtPct(ctx.oilChangePct), available: true };
        case 'fer':
            if (typeof curr.commodityPrice === 'number') return { label: 'FER', value: fmtPct(curr.commodityPrice), available: true };
            return ctx.ironOreChangePct === null ? na('FER') : { label: 'FER', value: fmtPct(ctx.ironOreChangePct), available: true };
        case 'laitiers':
            if (typeof curr.commodityPrice === 'number') return { label: 'LAIT', value: fmtPct(curr.commodityPrice), available: true };
            return ctx.dairyGdtChangePct === null ? na('LAIT') : { label: 'LAIT', value: fmtPct(ctx.dairyGdtChangePct), available: true };

        // ── External factors ─────────────────────────────────────
        case 'chine':
            if (typeof curr.chinaDemand === 'number') return { label: 'CHINE', value: `${curr.chinaDemand}`, available: true };
            return ctx.chinaPmi === null ? na('CHINE') : { label: 'CHINE', value: `${ctx.chinaPmi}`, available: true };
        case 'risque':
            if (typeof curr.riskSentiment === 'number') return { label: 'RISQUE', value: `${curr.riskSentiment}`, available: true };
            return ctx.vix === null ? na('VIX') : { label: 'VIX', value: `${ctx.vix}`, available: true };
        case 'eurchf':
            if (typeof curr.eurChf === 'number') return { label: 'EUR/CHF', value: fmtPct(curr.eurChf), available: true };
            return ctx.eurChfChangePct === null ? na('EUR/CHF') : { label: 'EUR/CHF', value: fmtPct(ctx.eurChfChangePct), available: true };
        case 'us':
            if (typeof curr.usSpillover === 'number') return { label: 'ÉCO US', value: `${curr.usSpillover > 0 ? '+' : ''}${curr.usSpillover}`, available: true };
            // No raw value provided — show the transmission score instead
            return score === null ? na('ÉCO US') : { label: 'ÉCO US', value: `${score > 0 ? '+' : ''}${score.toFixed(1)}`, available: true };

        default:
            return na('—');
    }
}
