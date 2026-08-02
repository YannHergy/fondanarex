// ================================================================
// ENTRY TYPES
//
// The setup taxonomy, with the observed statistics behind each one.
// These are measured from trading history, so they live in code
// where a change is reviewable — the same reasoning as the scoring
// weights.
//
// Identifiers match the EntryType enum in the database schema.
// ================================================================

export type EntryType =
    | 'M1_ENTRY'
    | 'M2_ENTRY'
    | 'A11_ENTRY'
    | 'A12_ENTRY'
    | 'A2_ENTRY'
    | 'A21_ENTRY'
    | 'A22_ENTRY'
    | 'GOLDEN_ENTRY';

export const ALL_ENTRY_TYPES: readonly EntryType[] = [
    'M1_ENTRY',
    'M2_ENTRY',
    'A11_ENTRY',
    'A12_ENTRY',
    'A2_ENTRY',
    'A21_ENTRY',
    'A22_ENTRY',
    'GOLDEN_ENTRY',
];

/**
 * Observed win rate per entry, percent.
 *
 * Undefined means "not enough history yet", which is different from zero and
 * must stay distinguishable: an entry with no measured rate is excluded from
 * weighted averages rather than dragging them to zero.
 */
export const ENTRY_WIN_RATES: Partial<Record<EntryType, number>> = {
    M2_ENTRY: 19,
    A12_ENTRY: 20,
    A2_ENTRY: 27,
    A21_ENTRY: 40,
    A22_ENTRY: 35,
    // GOLDEN_ENTRY: not yet measured.
};

/** Average interval between appearances, in trading days (5 per week). */
export const ENTRY_FREQUENCY_DAYS: Partial<Record<EntryType, number>> = {
    M2_ENTRY: 1,
    A12_ENTRY: 2,
    A2_ENTRY: 3,
    A21_ENTRY: 6,
    A22_ENTRY: 7,
};

/** Reward-to-risk typically achieved by each entry. */
export const ENTRY_RR: Partial<Record<EntryType, number>> = {
    M2_ENTRY: 4,
    A12_ENTRY: 6,
    A2_ENTRY: 8,
    A21_ENTRY: 7,
    A22_ENTRY: 4,
    GOLDEN_ENTRY: 6,
};

/**
 * Short display label.
 *
 * Subscript characters rather than an emoji star for GOLDEN: emoji render
 * inconsistently across platforms and carry no meaning to a screen reader.
 */
export const ENTRY_LABELS: Record<EntryType, string> = {
    M1_ENTRY: 'M₁',
    M2_ENTRY: 'M₂',
    A11_ENTRY: 'A₁₁',
    A12_ENTRY: 'A₁₂',
    A2_ENTRY: 'A₂',
    A21_ENTRY: 'A₂₁',
    A22_ENTRY: 'A₂₂',
    GOLDEN_ENTRY: 'GOLDEN',
};

export function entryLabel(entry: EntryType): string {
    return ENTRY_LABELS[entry] ?? entry.replace('_ENTRY', '');
}

/** Expected appearances per week, from the average interval in trading days. */
export function appearancesPerWeek(entry: EntryType): number {
    const interval = ENTRY_FREQUENCY_DAYS[entry];
    if (!interval || interval <= 0) return 0;
    return 5 / interval;
}
