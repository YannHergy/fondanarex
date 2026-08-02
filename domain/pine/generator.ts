// ================================================================
// PINE SCRIPT GENERATION
//
// Turns news rows and journal entries into TradingView indicators
// that draw vertical lines at the moment each event published.
//
// Pure — no I/O, no clock. `now` is passed in where needed.
// ================================================================

export interface NewsRow {
    id: string;
    enabled: boolean;
    /** "YYYY-MM-DD" */
    date: string;
    /** "HH:MM", UTC */
    time: string;
    label: string;
    currency: string;
    /** "#RRGGBB" */
    color: string;
    /** 1–5 */
    width: number;
}

export type Sentiment = 'bullish' | 'bearish' | 'neutral';
export type Appreciation = 'like' | 'neutral' | 'dislike';

export interface JournalRow {
    id: string;
    enabled: boolean;
    date: string;
    time: string;
    currency: string;
    category: string;
    title: string;
    note: string;
    sentiment: Sentiment;
    appreciation: Appreciation;
}

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF'] as const;

/**
 * Line colour per currency.
 *
 * GBP was pure white in the legacy palette, which is invisible on a light
 * chart — the one theme where a news line matters most is the one it vanished
 * in. It is a steel blue here; every colour is legible on both themes.
 */
export const CURRENCY_COLORS: Record<string, string> = {
    EUR: '#2962FF',
    USD: '#F23645',
    GBP: '#5C6BC0',
    JPY: '#9C27B0',
    AUD: '#FF6D00',
    CAD: '#00897B',
    NZD: '#C9A227',
    CHF: '#90A4AE',
};

export const JOURNAL_CATEGORIES = [
    'Fondamental',
    'Discours BC',
    'Technique',
    'Surprise',
    'Corrélation',
    'Autre',
] as const;

/** Short names for the release keys the currency records carry. */
export const EVENT_SHORT: Record<string, string> = {
    interestRate: 'Taux',
    stance: 'Discours BC',
    gdpQoQ: 'PIB QoQ',
    cpi: 'CPI',
    coreCpi: 'Core CPI',
    corePce: 'Core PCE',
    nfp: 'NFP',
    unemployment: 'Chômage',
    pmiManufacturing: 'PMI Manuf',
    pmiServices: 'PMI Services',
    wagePPI: 'PPI/Salaires',
    tradeBalance: 'Balance Com',
    retailSales: 'Ventes Détail',
    consumerConfidence: 'Confiance Conso',
    ifo: 'IFO',
    zew: 'ZEW',
};

/** Usual publication time in UTC, so a row starts from something plausible. */
export const EVENT_DEFAULT_TIME: Record<string, string> = {
    interestRate: '13:00',
    stance: '14:00',
    nfp: '13:30',
    gdpQoQ: '09:00',
    cpi: '09:00',
    coreCpi: '09:00',
    corePce: '13:30',
    unemployment: '09:00',
    pmiManufacturing: '09:00',
    pmiServices: '09:00',
    wagePPI: '09:00',
    tradeBalance: '09:00',
    retailSales: '09:00',
    consumerConfidence: '10:00',
    ifo: '09:00',
    zew: '10:00',
};

const SENTIMENT_CFG: Record<Sentiment, { label: string; color: string; transparency: number }> = {
    bullish: { label: 'Haussier', color: '#26A69A', transparency: 80 },
    bearish: { label: 'Baissier', color: '#EF5350', transparency: 80 },
    neutral: { label: 'Neutre', color: '#78909C', transparency: 85 },
};

const APPRECIATION_CFG: Record<Appreciation, { label: string }> = {
    like: { label: 'Favorable' },
    neutral: { label: 'Neutre' },
    dislike: { label: 'Défavorable' },
};

export function sentimentLabel(sentiment: Sentiment): string {
    return SENTIMENT_CFG[sentiment].label;
}

export function appreciationLabel(appreciation: Appreciation): string {
    return APPRECIATION_CFG[appreciation].label;
}

export const MAX_NEWS_ROWS = 15;
export const MAX_JOURNAL_ROWS = 10;

/**
 * Escapes a value for a Pine double-quoted string literal.
 *
 * Backslashes FIRST, then quotes — the other order would double-escape the
 * backslashes it just inserted. The legacy news generator escaped only quotes,
 * so a label containing a backslash produced a script that would not compile;
 * its journal generator got this right, which is how the inconsistency was
 * visible in the same file.
 *
 * Newlines are collapsed because a raw newline terminates a Pine string.
 */
export function escapePineString(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, ' ')
        .trim();
}

/** "#RRGGBB" to the "r, g, b" triple Pine's color.rgb() takes. */
export function hexToRgb(hex: string): string {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    // An unparseable colour falls back to grey rather than emitting NaN, which
    // would make the whole script fail to compile.
    if (!match) return '128, 128, 128';

    const value = match[1]!;
    return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)).join(', ');
}

/** Rows that will actually produce output. */
export function activeNewsRows(rows: readonly NewsRow[]): NewsRow[] {
    return rows.filter((row) => row.enabled && row.date && row.time && row.label.trim());
}

export function activeJournalRows(rows: readonly JournalRow[]): JournalRow[] {
    return rows.filter((row) => row.enabled && row.date && row.time && row.title.trim());
}

/** "lun. 03/08" for the comment above each line. */
function dayLabel(date: string): string {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return date;

    return parsed.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        timeZone: 'UTC',
    });
}

function longDate(date: string): string {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return date;

    return parsed.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

/**
 * The shared preamble: clears previous drawings and tracks the visible range.
 *
 * Both indicators redraw everything on the last bar. Deleting first is what
 * makes that safe — without it, every recalculation stacks another set of lines
 * until the 500-object ceiling silently truncates the newest ones.
 */
function preamble(topPadding: number): string[] {
    return [
        'var float _hi = na',
        'var float _lo = na',
        '_hi := na(_hi) ? high : math.max(_hi, high)',
        '_lo := na(_lo) ? low  : math.min(_lo, low)',
        '',
        'var line[]  _l  = array.new_line()',
        'var label[] _lb = array.new_label()',
        '',
        'if barstate.islast',
        '    int n = array.size(_l)',
        '    if n > 0',
        '        for i = 0 to n - 1',
        '            line.delete(array.get(_l, i))',
        '    array.clear(_l)',
        '    int m = array.size(_lb)',
        '    if m > 0',
        '        for i = 0 to m - 1',
        '            label.delete(array.get(_lb, i))',
        '    array.clear(_lb)',
        `    float yT = _hi + (_hi - _lo) * ${topPadding}`,
        '    float yB = _lo - (_hi - _lo) * 0.02',
        '',
    ];
}

/** News lines: one vertical line per release, coloured by currency. */
export function generateNewsPine(rows: readonly NewsRow[], now: Date): string {
    const active = activeNewsRows(rows);
    const week = longDate(active[0]?.date ?? now.toISOString().slice(0, 10));

    const lines: string[] = [
        '//@version=6',
        '// ===================================================================',
        `// NEWS LINES — semaine du ${week}`,
        '// Genere par Fondanarex',
        '// Toutes les heures sont en UTC. Ajustez si votre graphique utilise',
        '// un autre fuseau (Paris = UTC+1 en hiver, UTC+2 en ete).',
        '// ===================================================================',
        '',
        'indicator("News Lines", overlay=true, max_lines_count=500, max_labels_count=500)',
        '',
        'show_labels = input.bool(true,       "Afficher les labels")',
        'line_style  = input.string("Tirets", "Style de ligne", options=["Continu", "Tirets", "Pointille"])',
        'label_pos   = input.string("Haut",   "Position du label", options=["Haut", "Bas"])',
        '',
        'ls  = line_style == "Continu" ? line.style_solid : line_style == "Pointille" ? line.style_dotted : line.style_dashed',
        'lbl = label_pos  == "Haut"    ? label.style_label_down : label.style_label_up',
        '',
        ...preamble(0.02),
    ];

    if (active.length === 0) {
        lines.push('    // Aucune news activee — configurez des lignes puis regenerez.');
    } else {
        for (const row of active) {
            const stamp = `"${row.date} ${row.time} +0000"`;
            const label = escapePineString(row.label);

            lines.push(`    // ${label} — ${dayLabel(row.date)} ${row.time} UTC`);
            lines.push(
                `    array.push(_l, line.new(x1=timestamp(${stamp}), y1=yT, x2=timestamp(${stamp}), y2=yB, xloc=xloc.bar_time, color=${row.color}, width=${clampWidth(row.width)}, style=ls))`,
            );
            lines.push('    if show_labels');
            lines.push(
                `        array.push(_lb, label.new(x=timestamp(${stamp}), y=label_pos=="Haut"?yT:yB, xloc=xloc.bar_time, yloc=yloc.price, text="${label}", color=color.new(${row.color}, 78), textcolor=${row.color}, style=lbl, size=size.small))`,
            );
            lines.push('');
        }
    }

    return lines.join('\n').trimEnd();
}

/**
 * Event journal: a line per entry, carrying the read and the verdict.
 *
 * Labels use words rather than emoji. Pine renders emoji inconsistently across
 * platforms and they are unreadable at `size.small`, which is the size a chart
 * annotation has to be.
 */
export function generateJournalPine(rows: readonly JournalRow[]): string {
    const active = activeJournalRows(rows);

    const lines: string[] = [
        '//@version=6',
        '// ===================================================================',
        '// EVENT JOURNAL — journal contextuel fondamental',
        '// Genere par Fondanarex',
        '// Sentiment : Haussier / Baissier / Neutre',
        '// Verdict   : Favorable / Neutre / Defavorable',
        '// ===================================================================',
        '',
        'indicator("Event Journal", overlay=true, max_lines_count=500, max_labels_count=500)',
        '',
        'show_notes  = input.bool(true,     "Afficher les notes contextuelles")',
        'show_labels = input.bool(true,     "Afficher les labels")',
        'lbl_pos     = input.string("Haut", "Position du label", options=["Haut", "Bas"])',
        '',
        ...preamble(0.04),
        '    lbl = lbl_pos == "Haut" ? label.style_label_down : label.style_label_up',
        '',
    ];

    if (active.length === 0) {
        lines.push('    // Aucun evenement active — configurez des entrees puis regenerez.');
    } else {
        for (const row of active) {
            const sentiment = SENTIMENT_CFG[row.sentiment];
            const appreciation = APPRECIATION_CFG[row.appreciation];
            const stamp = `"${row.date} ${row.time} +0000"`;
            const rgb = hexToRgb(sentiment.color);

            const title = escapePineString(row.title);
            // Truncated so a long note cannot push the label off the chart.
            const note = escapePineString(row.note).slice(0, 120);

            const headline = `${sentiment.label} · ${appreciation.label} · ${row.currency} · ${title}`;
            const detail = `${row.category}${note ? ` — ${note}` : ''}`;

            lines.push(`    // ${row.category} · ${title} — ${dayLabel(row.date)} ${row.time} UTC`);
            lines.push(
                `    array.push(_l, line.new(x1=timestamp(${stamp}), y1=yT, x2=timestamp(${stamp}), y2=yB, xloc=xloc.bar_time, color=color.new(color.rgb(${rgb}), 25), width=2, style=line.style_solid))`,
            );
            lines.push('    if show_labels');
            lines.push(`        _txt = show_notes ? "${headline}\\n${detail}" : "${headline}"`);
            lines.push(
                `        array.push(_lb, label.new(x=timestamp(${stamp}), y=lbl_pos=="Haut"?yT:yB, xloc=xloc.bar_time, yloc=yloc.price, text=_txt, color=color.new(color.rgb(${rgb}), ${sentiment.transparency}), textcolor=color.rgb(${rgb}), style=lbl, size=size.small))`,
            );
            lines.push('');
        }
    }

    return lines.join('\n').trimEnd();
}

/** Pine accepts 1–5; anything else would fail to compile. */
function clampWidth(width: number): number {
    if (!Number.isFinite(width)) return 2;
    return Math.max(1, Math.min(5, Math.round(width)));
}
