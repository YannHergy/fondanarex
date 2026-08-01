// ================================================================
// FLOW FILTER — Golden Rule: a news item only moves the market IF it
// affects real trade or financial flows.
// Media noise with no impact on flows = impact 0.
// ================================================================

export type FluxImpact = 'always' | 'often' | 'rarely' | 'never';

export interface FluxMultipliers {
    always: 1.0;
    often: 0.7;
    rarely: 0.3;
    never: 0.0;
}

export const FLUX_MULTIPLIERS: Record<FluxImpact, number> = {
    always: 1.0,
    often:  0.7,
    rarely: 0.3,
    never:  0.0,
};

export const FLUX_LABELS: Record<FluxImpact, string> = {
    always: 'Impact Réel Certain',
    often:  'Impact Réel Probable',
    rarely: 'Bruit / Indirect',
    never:  'Aucun Impact Réel',
};

export const FLUX_COLORS: Record<FluxImpact, string> = {
    always: '#22c55e',  // green
    often:  '#eab308',  // yellow
    rarely: '#f97316',  // orange
    never:  '#ef4444',  // red
};

/**
 * Determines the flow impact of an indicator from its category.
 * Logic: only the events that change real trade or financial flows
 * count.
 */
export function getCategoryFluxImpact(category: string, indicatorId: string): FluxImpact {
    // Monetary policy -> changes rates -> immediate capital flows
    if (category === 'monetary') return 'always';

    // Employment (NFP, claimant) -> shifts central bank expectations -> flows
    if (category === 'employment') return 'always';

    // Inflation (CPI, PCE) -> same logic as employment
    if (category === 'inflation') return 'always';

    // Commodities (oil, ore, dairy) -> direct export revenues
    if (category === 'commodities' || category === 'trade') {
        // Some trade indicators are real flows
        if (/oil|iron_ore|dairy|gdt|wti|fonterra|copper|bdi|commodity/.test(indicatorId)) return 'always';
        // Trade balance = real flows, but delayed
        if (/trade_balance|current_account/.test(indicatorId)) return 'often';
        return 'often';
    }

    // Capital flows -> always real (by definition)
    if (category === 'flows') return 'always';

    // Growth (GDP, PMI) -> a signal, but no immediate flows
    if (category === 'growth') {
        // GDP = real measure of the activity
        if (/gdp|pib/.test(indicatorId)) return 'often';
        // PMI = predictor, no flows yet
        return 'often';
    }

    // Risk (VIX, gold) -> market sentiment, may or may not trigger flows
    if (category === 'risk') return 'rarely';

    // Geopolitics -> noise without direct flows in most cases
    if (category === 'geopolitics') return 'rarely';

    // Direction (king) and anything else -> neutral
    return 'often';
}

/** Base opacity (unselected state) of a connection when the flow filter is on */
export function fluxBaseOpacity(impact: FluxImpact): number {
    switch (impact) {
        case 'always': return 0.35;
        case 'often':  return 0.20;
        case 'rarely': return 0.08;
        case 'never':  return 0.02;
    }
}
