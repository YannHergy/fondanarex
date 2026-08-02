// ================================================================
// WEEKLY PLAN
//
// A plan is keyed by the Monday of its week. Everything here works
// in UTC, matching domain/events/week.ts — the legacy version used
// `setHours(12,0,0,0)` and `getDay()` on a LOCAL date, so the same
// instant produced different Mondays depending on the machine's
// timezone, and a plan written on a Sunday evening west of
// Greenwich was filed under the wrong week.
//
// Pure — no I/O, no clock. `now` is passed in.
// ================================================================

import type { CurrencyWithScore } from '../types';

export type TechnicalBias = 'Bullish' | 'Bearish' | 'Neutral';

const DAY_MS = 86_400_000;

/** Pairs the plan offers. Ordered majors first, then the crosses actually traded. */
export const FORECAST_PAIRS = [
    'EUR/USD',
    'GBP/USD',
    'USD/JPY',
    'AUD/USD',
    'NZD/USD',
    'EUR/NZD',
    'GBP/NZD',
    'NZD/JPY',
    'NZD/CAD',
    'EUR/AUD',
    'EUR/CAD',
    'GBP/CAD',
    'EUR/GBP',
    'GBP/NOK',
] as const;

/** Monday of the week containing `date`, as "YYYY-MM-DD". */
export function weekStartOf(date: Date): string {
    const d = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    // getUTCDay: Sunday is 0, so shift it to 6 to make Monday the first day.
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
}

/** The Monday..Friday dates of a week, as "YYYY-MM-DD". */
export function weekdays(weekStart: string): string[] {
    const monday = Date.parse(`${weekStart}T00:00:00Z`);
    return Array.from({ length: 5 }, (_, i) =>
        new Date(monday + i * DAY_MS).toISOString().slice(0, 10),
    );
}

export function adjacentWeekStart(weekStart: string, direction: -1 | 1): string {
    return new Date(Date.parse(`${weekStart}T00:00:00Z`) + direction * 7 * DAY_MS)
        .toISOString()
        .slice(0, 10);
}

export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'] as const;

/** "Semaine du 3 août 2026". Formatted in UTC so it matches the key it describes. */
export function weekLabel(weekStart: string): string {
    return `Semaine du ${new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    })}`;
}

export interface PairBias {
    base: string;
    quote: string;
    baseScore: number;
    quoteScore: number;
    diff: number;
    bias: TechnicalBias;
}

/**
 * Difference in threshold for calling a pair directional.
 *
 * Below it the two currencies are scored too closely for the difference to
 * mean anything, and the honest answer is Neutral rather than a bias derived
 * from noise.
 */
const BIAS_THRESHOLD = 8;

/**
 * The fundamental read on a pair, from the two currency scores.
 *
 * Shown next to the trader's own technical bias so a disagreement between the
 * two is visible at the moment the setup is written down — that disagreement is
 * the point of putting them side by side.
 */
export function pairFundamentalBias(
    pair: string,
    currencies: readonly CurrencyWithScore[],
): PairBias {
    const [base = '', quote = ''] = pair.split('/');

    // A currency missing from the list scores 50 — neutral — rather than 0,
    // which would read as a maximally bearish signal for a pair we simply have
    // no data on.
    const scoreOf = (code: string) =>
        currencies.find((c) => c.code === code)?.scores.total ?? 50;

    const baseScore = Math.round(scoreOf(base));
    const quoteScore = Math.round(scoreOf(quote));
    const diff = baseScore - quoteScore;

    return {
        base,
        quote,
        baseScore,
        quoteScore,
        diff,
        bias: diff > BIAS_THRESHOLD ? 'Bullish' : diff < -BIAS_THRESHOLD ? 'Bearish' : 'Neutral',
    };
}

/** Whether the trader's technical read contradicts the fundamental one. */
export function isConflicted(technical: TechnicalBias, fundamental: TechnicalBias): boolean {
    if (technical === 'Neutral' || fundamental === 'Neutral') return false;
    return technical !== fundamental;
}

export type EventImpact = 'High' | 'Medium' | 'Low';

export interface EventInfo {
    label: string;
    impact: EventImpact;
}

/**
 * Indicator key to its release name and market impact.
 *
 * Must cover every key the currency records actually publish in
 * `nextReleases`. The legacy map missed four of them — `nfp`, `corePce`, `ifo`
 * and `zew` — so they fell through to the raw-key fallback and were graded
 * Low. Non-farm payrolls is among the highest-impact releases in the calendar;
 * labelling it "nfp · Low" in the one view meant to plan around the week's
 * risk is exactly backwards.
 */
const EVENT_INFO: Record<string, EventInfo> = {
    interestRate: { label: 'Décision taux directeur', impact: 'High' },
    stance: { label: 'Discours banque centrale', impact: 'High' },
    gdpQoQ: { label: 'PIB trimestriel (QoQ)', impact: 'High' },
    cpi: { label: 'Inflation CPI (YoY)', impact: 'High' },
    coreCpi: { label: 'Core CPI (YoY)', impact: 'High' },
    corePce: { label: 'Core PCE (indicateur Fed)', impact: 'High' },
    nfp: { label: 'Emplois non agricoles (NFP)', impact: 'High' },
    unemployment: { label: 'Taux de chômage', impact: 'High' },
    pmiManufacturing: { label: 'PMI manufacturier', impact: 'Medium' },
    pmiServices: { label: 'PMI services', impact: 'Medium' },
    wagePPI: { label: 'PPI / croissance salaires', impact: 'Medium' },
    tradeBalance: { label: 'Balance commerciale', impact: 'Medium' },
    retailSales: { label: 'Ventes au détail', impact: 'Medium' },
    consumerConfidence: { label: 'Confiance consommateur', impact: 'Medium' },
    ifo: { label: 'Climat des affaires IFO', impact: 'Medium' },
    zew: { label: 'Sentiment économique ZEW', impact: 'Medium' },
};

/**
 * Every key the currency records can carry a release date for.
 *
 * Kept next to the map so the test can assert the two agree — the failure mode
 * is silent (a real release grading itself Low), so it needs a guard.
 */
export const PUBLISHED_RELEASE_KEYS = [
    'coreCpi',
    'corePce',
    'cpi',
    'gdpQoQ',
    'ifo',
    'interestRate',
    'nfp',
    'pmiManufacturing',
    'pmiServices',
    'retailSales',
    'tradeBalance',
    'unemployment',
    'wagePPI',
    'zew',
] as const;

export function getEventInfo(key: string): EventInfo {
    return EVENT_INFO[key] ?? { label: key, impact: 'Low' };
}

export interface WeekEvent {
    /** "USD-interestRate" — also the stable key the impact note is stored against. */
    key: string;
    date: string;
    currency: string;
    label: string;
    impact: EventImpact;
}

const IMPACT_RANK: Record<EventImpact, number> = { High: 0, Medium: 1, Low: 2 };

/**
 * The releases falling inside a week, across all currencies.
 *
 * Sorted by date then by impact, so the release that will actually move the
 * week reads first within its day. The legacy comparator returned
 * `(a.impact === 'High' ? -1 : 1) - (b.impact === 'High' ? -1 : 1)`, which
 * cannot distinguish Medium from Low and, being applied after a date sort in
 * the same pass, reshuffled days into each other.
 */
export function weekEventsFor(
    currencies: readonly CurrencyWithScore[],
    weekStart: string,
): WeekEvent[] {
    const dates = new Set(weekdays(weekStart));
    const events: WeekEvent[] = [];

    for (const currency of currencies) {
        for (const [key, date] of Object.entries(currency.nextReleases ?? {})) {
            if (!date || !dates.has(date)) continue;

            const info = getEventInfo(key);
            events.push({
                key: `${currency.code}-${key}`,
                date,
                currency: currency.code,
                label: info.label,
                impact: info.impact,
            });
        }
    }

    return events.sort(
        (a, b) => a.date.localeCompare(b.date) || IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact],
    );
}

/** Events grouped by weekday, empty days dropped. */
export function eventsByDay(
    events: readonly WeekEvent[],
    weekStart: string,
): { day: string; date: string; events: WeekEvent[] }[] {
    return weekdays(weekStart)
        .map((date, index) => ({
            day: DAY_NAMES[index] ?? date,
            date,
            events: events.filter((e) => e.date === date),
        }))
        .filter((entry) => entry.events.length > 0);
}

/** Restricts events to the two currencies of a pair. */
export function filterEventsByPair(
    events: readonly WeekEvent[],
    pair: string | null,
): WeekEvent[] {
    if (!pair) return [...events];
    const [base, quote] = pair.split('/');
    return events.filter((e) => e.currency === base || e.currency === quote);
}

/** Currencies referenced by the week's setups, deduplicated. */
export function currenciesInSetups(pairs: readonly string[]): string[] {
    const codes = new Set<string>();
    for (const pair of pairs) {
        for (const code of pair.split('/')) {
            if (code) codes.add(code);
        }
    }
    return [...codes].sort();
}

/**
 * One-line summary of how the week's setups lean on a currency.
 *
 * Fed to the week-ahead prompt so the model knows what position it is being
 * asked to stress-test rather than commenting in the abstract.
 */
export function setupBiasSummary(
    setups: readonly { instrument: string; technicalBias: TechnicalBias }[],
    code: string,
): string | null {
    const related = setups.filter((s) => s.instrument.includes(code));
    if (related.length === 0) return null;

    const biases = new Set(related.map((s) => s.technicalBias));
    if (biases.size === 1) {
        const [only] = [...biases];
        return `${only} sur ${related.map((s) => s.instrument).join(', ')}`;
    }

    return related.map((s) => `${s.technicalBias} ${s.instrument}`).join(' · ');
}
