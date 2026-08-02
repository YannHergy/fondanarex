// ================================================================
// COMMON RELEASE NAMES
//
// Suggestions for the event-entry form, per currency. Kept in code
// rather than the database: they are a fixed vocabulary that changes
// only when a central bank renames a publication, and a typo here
// should be caught in review rather than edited live.
// ================================================================

export const COMMON_EVENTS: Record<string, readonly string[]> = {
    USD: [
        'NFP', 'CPI', 'Core CPI', 'PPI', 'GDP', 'Retail Sales', 'PCE',
        'ISM Manufacturing', 'ISM Services', 'FOMC Minutes', 'Fed Chair Speech',
        'Unemployment Claims', 'Consumer Confidence',
    ],
    EUR: [
        'CPI Flash', 'GDP', 'PMI Manufacturing', 'PMI Services', 'ECB Rate Decision',
        'ECB Minutes', 'German IFO', 'ZEW Economic Sentiment', 'Unemployment Rate',
        'Retail Sales',
    ],
    GBP: [
        'CPI', 'GDP', 'PMI Manufacturing', 'PMI Services', 'BOE Rate Decision',
        'BOE Minutes', 'Employment Change', 'Retail Sales', 'Average Earnings',
    ],
    JPY: [
        'CPI', 'GDP', 'BOJ Rate Decision', 'BOJ Minutes', 'Tankan Survey',
        'PMI Manufacturing', 'Trade Balance', 'Unemployment Rate',
    ],
    AUD: [
        'CPI', 'GDP', 'RBA Rate Decision', 'Employment Change', 'Unemployment Rate',
        'Retail Sales', 'Trade Balance', 'NAB Business Confidence',
    ],
    CAD: [
        'CPI', 'GDP', 'BOC Rate Decision', 'Employment Change', 'Unemployment Rate',
        'Retail Sales', 'Trade Balance', 'Ivey PMI',
    ],
    NZD: [
        'CPI', 'GDP', 'RBNZ Rate Decision', 'Employment Change', 'Unemployment Rate',
        'Trade Balance', 'Business NZ PMI',
    ],
    CHF: [
        'CPI', 'GDP', 'SNB Rate Decision', 'Unemployment Rate', 'Trade Balance',
        'KOF Leading Indicator',
    ],
};

/** Fallback list for a currency with no specific vocabulary. */
export const DEFAULT_EVENTS: readonly string[] = [
    'CPI', 'GDP', 'PMI', 'Retail Sales', 'Interest Rate Decision',
    'Unemployment Rate', 'Trade Balance', 'Consumer Confidence', 'PPI', 'Autre',
];

export function commonEventsFor(currencyCode: string): readonly string[] {
    return COMMON_EVENTS[currencyCode] ?? DEFAULT_EVENTS;
}
