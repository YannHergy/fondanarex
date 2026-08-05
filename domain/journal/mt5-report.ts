// ================================================================
// METATRADER 5 REPORT PARSER
//
// Reads the HTML report MT5 writes from
// History -> right click -> Report, and returns closed positions.
//
// This exists because the broker refuses third-party terminal
// connections, so MetaApi can never reach the account. The report
// carries the same fields the MetaApi history endpoint would have
// returned — including the position id, which is the dedup key the
// Trade table already unique-indexes on — so an import is a
// complete substitute rather than a downgrade.
//
// Parsed with regexes rather than a DOM library on purpose: this
// module is domain code, and domain code takes no dependencies and
// does no I/O. MT5 emits machine-generated, highly regular markup.
//
// Pure — no I/O.
// ================================================================

export interface Mt5Position {
    /** MT5 position ticket. Stable across the life of the position. */
    positionId: string;
    /** Raw broker symbol, e.g. "EURUSD" or "EURUSD.r". Not yet normalised. */
    symbol: string;
    direction: 'Buy' | 'Sell';
    openedAt: Date;
    closedAt: Date;
    entryPrice: number;
    exitPrice: number;
    stopLoss: number | null;
    takeProfit: number | null;
    lotSize: number;
    commission: number | null;
    swap: number | null;
    /** Broker-reported profit, in account currency, before commission and swap. */
    profit: number | null;
}

export interface Mt5ParseResult {
    positions: Mt5Position[];
    /** Rows that looked like positions but could not be read, with the reason. */
    warnings: string[];
}

export class Mt5ParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'Mt5ParseError';
    }
}

// ----------------------------------------------------------------
// Markup
// ----------------------------------------------------------------

const ROW_RE = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi;

/**
 * A cell MT5 renders but never shows.
 *
 * Every data row in the Positions table carries a `<td class="hidden"
 * colspan="8">` after Type — scaffolding for the report's expandable deal
 * detail, absent from the header row. Counted as a column it shifts everything
 * after Type by one, which lands the close TIME on the T/P PRICE. That parses
 * as no date at all, so each row looks like a still-open position and is
 * dropped without a warning: a real export read as zero trades.
 *
 * Dropping these cells realigns data rows with the header exactly.
 */
const HIDDEN_CELL = /\bclass\s*=\s*["'][^"']*\bhidden\b/i;

const ENTITIES: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
};

/** Visible text of one cell: tags stripped, entities decoded, whitespace collapsed. */
function cellText(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? ' ')
        .replace(/ /g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tableRows(html: string): string[][] {
    const rows: string[][] = [];

    for (const rowMatch of html.matchAll(ROW_RE)) {
        const cells: string[] = [];
        for (const cellMatch of (rowMatch[1] ?? '').matchAll(CELL_RE)) {
            if (HIDDEN_CELL.test(cellMatch[1] ?? '')) continue;
            cells.push(cellText(cellMatch[2] ?? ''));
        }
        if (cells.length > 0) rows.push(cells);
    }

    return rows;
}

// ----------------------------------------------------------------
// Numbers
// ----------------------------------------------------------------

/**
 * Detects a report written with comma decimal separators.
 *
 * MT5 normally writes report numbers with a dot, whatever the terminal
 * language. A localised build that writes "1,09543" would be read as
 * 109543 by the parser below — a price wrong by five orders of magnitude,
 * silently, on every row. Rather than guess, the import refuses the file:
 * a loud failure is recoverable, a journal full of plausible-looking wrong
 * prices is not.
 *
 * The signature is a comma followed by four or more digits, which no
 * thousands separator ever produces.
 */
function usesCommaDecimals(html: string): boolean {
    return /\d,\d{4,}/.test(html);
}

/**
 * A number from a report cell.
 *
 * Spaces (including non-breaking, which MT5 uses) and commas are thousands
 * separators; the dot is the decimal point. Returns null for blank cells,
 * which is how MT5 writes an absent stop loss or take profit.
 */
export function parseReportNumber(text: string): number | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const cleaned = trimmed.replace(/[\s ,]/g, '');
    if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;

    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
}

/**
 * A timestamp from a report cell, e.g. "2026.08.04 14:23:45".
 *
 * Read as UTC, which is a deliberate simplification: MT5 stamps history in
 * BROKER SERVER time, and the report does not say what that offset is. Any
 * conversion here would be an invention. The caller surfaces the caveat to
 * the user, who can shift the whole import if their server is not UTC.
 */
export function parseReportDate(text: string): Date | null {
    const match = /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
        text.trim(),
    );
    if (!match) return null;

    const [, year, month, day, hour, minute, second] = match;
    const stamp = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second ?? '0'),
    );

    return Number.isNaN(stamp) ? null : new Date(stamp);
}

// ----------------------------------------------------------------
// Header
// ----------------------------------------------------------------

/**
 * Column positions in the Positions table.
 *
 * Mapped by header name rather than by fixed offset, so a broker template
 * that adds or reorders a column still imports. Names are matched in both
 * English and French because the report follows the terminal's language.
 *
 * "Time" and "Price" each appear TWICE — open then close — which is why
 * they are collected as lists and taken by ordinal.
 */
interface ColumnMap {
    positionId: number;
    symbol: number;
    type: number;
    volume: number;
    openedAt: number;
    closedAt: number;
    entryPrice: number;
    exitPrice: number;
    stopLoss: number | null;
    takeProfit: number | null;
    commission: number | null;
    swap: number | null;
    profit: number | null;
}

const HEADER_PATTERNS = {
    position: /^position$/i,
    symbol: /^(symbol|symbole)$/i,
    type: /^type$/i,
    volume: /^volume$/i,
    time: /^(time|heure)$/i,
    price: /^(price|prix)$/i,
    stopLoss: /^s\s*\/\s*l$/i,
    takeProfit: /^t\s*\/\s*p$/i,
    commission: /^commission$/i,
    // A French terminal writes the swap column "Echange", accent optional
    // depending on the build.
    swap: /^(swap|[ée]change)$/i,
    profit: /^(profit|bénéfice|benefice)$/i,
} as const;

/**
 * Start of a LATER section, which ends the Positions table.
 *
 * Matches both the section title ("Orders") and that section's own id column
 * ("Order"), since templates differ on which of the two comes first.
 */
const NEXT_SECTION = /^(orders?|deals?|ordres?|transactions?)$/i;

function indexOfAll(cells: string[], pattern: RegExp): number[] {
    const found: number[] = [];
    cells.forEach((cell, index) => {
        if (pattern.test(cell)) found.push(index);
    });
    return found;
}

function first(cells: string[], pattern: RegExp): number | null {
    const index = cells.findIndex((cell) => pattern.test(cell));
    return index === -1 ? null : index;
}

/**
 * Reads the Positions header, or null if this row is not it.
 *
 * A row qualifies only when it carries every column a trade cannot be
 * reconstructed without, and two Time and two Price columns. The Deals
 * table also has Symbol, Type and Volume, so the stricter test is what
 * keeps the two apart.
 */
function readHeader(cells: string[]): ColumnMap | null {
    const positionId = first(cells, HEADER_PATTERNS.position);
    const symbol = first(cells, HEADER_PATTERNS.symbol);
    const type = first(cells, HEADER_PATTERNS.type);
    const volume = first(cells, HEADER_PATTERNS.volume);
    if (positionId === null || symbol === null || type === null || volume === null) return null;

    const times = indexOfAll(cells, HEADER_PATTERNS.time);
    const prices = indexOfAll(cells, HEADER_PATTERNS.price);
    if (times.length < 2 || prices.length < 2) return null;

    const [openedAt, closedAt] = times as [number, number];
    const [entryPrice, exitPrice] = prices as [number, number];

    return {
        positionId,
        symbol,
        type,
        volume,
        openedAt,
        closedAt,
        entryPrice,
        exitPrice,
        stopLoss: first(cells, HEADER_PATTERNS.stopLoss),
        takeProfit: first(cells, HEADER_PATTERNS.takeProfit),
        commission: first(cells, HEADER_PATTERNS.commission),
        swap: first(cells, HEADER_PATTERNS.swap),
        profit: first(cells, HEADER_PATTERNS.profit),
    };
}

// ----------------------------------------------------------------
// Rows
// ----------------------------------------------------------------

function at(cells: string[], index: number | null): string {
    if (index === null || index >= cells.length) return '';
    return cells[index] ?? '';
}

function optionalNumber(cells: string[], index: number | null): number | null {
    return parseReportNumber(at(cells, index));
}

/**
 * One position from a data row, or a reason it could not be read.
 *
 * Returning the reason rather than throwing lets a single malformed row be
 * reported to the user while the rest of the file still imports.
 */
function readRow(cells: string[], columns: ColumnMap): Mt5Position | string {
    const positionId = at(cells, columns.positionId);
    if (!/^\d+$/.test(positionId)) return '';

    const rawType = at(cells, columns.type).toLowerCase();
    const direction = rawType === 'buy' ? 'Buy' : rawType === 'sell' ? 'Sell' : null;
    if (!direction) return '';

    const symbol = at(cells, columns.symbol);
    if (!symbol) return `Position ${positionId} : symbole absent`;

    const openedAt = parseReportDate(at(cells, columns.openedAt));
    const closedAt = parseReportDate(at(cells, columns.closedAt));
    if (!openedAt) return `Position ${positionId} : date d'ouverture illisible`;
    // An open position has no close time. It has no result either, so there is
    // nothing to journal yet — skip it silently rather than invent a close.
    if (!closedAt) return '';

    const entryPrice = parseReportNumber(at(cells, columns.entryPrice));
    const exitPrice = parseReportNumber(at(cells, columns.exitPrice));
    const lotSize = parseReportNumber(at(cells, columns.volume));

    if (entryPrice === null || entryPrice <= 0) return `Position ${positionId} : prix d'entrée illisible`;
    if (exitPrice === null || exitPrice <= 0) return `Position ${positionId} : prix de sortie illisible`;
    if (lotSize === null || lotSize <= 0) return `Position ${positionId} : volume illisible`;

    return {
        positionId,
        symbol,
        direction,
        openedAt,
        closedAt,
        entryPrice,
        exitPrice,
        stopLoss: optionalNumber(cells, columns.stopLoss),
        takeProfit: optionalNumber(cells, columns.takeProfit),
        lotSize,
        commission: optionalNumber(cells, columns.commission),
        swap: optionalNumber(cells, columns.swap),
        profit: optionalNumber(cells, columns.profit),
    };
}

// ----------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------

/**
 * Closed positions from an MT5 HTML report.
 *
 * Throws only when the file is not a report at all, or when its number
 * format cannot be trusted. Individual bad rows become warnings.
 */
export function parseMt5Report(html: string): Mt5ParseResult {
    if (usesCommaDecimals(html)) {
        throw new Mt5ParseError(
            "Ce rapport utilise la virgule comme séparateur décimal, ce que l'import ne sait pas " +
                'lire sans risque de contresens sur les prix. Réexporte-le depuis un terminal ' +
                'MetaTrader en anglais.',
        );
    }

    const rows = tableRows(html);
    if (rows.length === 0) {
        throw new Mt5ParseError("Aucun tableau trouvé : ce fichier n'est pas un rapport MetaTrader.");
    }

    const headerIndex = rows.findIndex((cells) => readHeader(cells) !== null);
    if (headerIndex === -1) {
        throw new Mt5ParseError(
            'Tableau « Positions » introuvable. Dans MetaTrader : onglet Historique, clic droit, ' +
                'Rapport, puis enregistre en HTML.',
        );
    }

    const columns = readHeader(rows[headerIndex] as string[]) as ColumnMap;
    const positions: Mt5Position[] = [];
    const warnings: string[] = [];

    for (const cells of rows.slice(headerIndex + 1)) {
        // The Orders and Deals tables follow, and their rows would otherwise be
        // read as positions with the wrong columns.
        if (cells.some((cell) => NEXT_SECTION.test(cell))) break;

        const outcome = readRow(cells, columns);
        if (typeof outcome !== 'string') positions.push(outcome);
        else if (outcome) warnings.push(outcome);
    }

    return { positions, warnings };
}

/**
 * Broker symbol to journal instrument, e.g. "EURUSD.r" -> "EUR/USD".
 *
 * Brokers suffix symbols to mark an account type — ".r", "m", "_i", "-ECN" —
 * and prop firms are among the worst for it. Only the leading six letters
 * carry the pair, so everything else is discarded before matching.
 *
 * Returns null for anything not in the journal's instrument list, including
 * metals and indices. The caller reports those as skipped: writing them would
 * violate the Trade -> Instrument foreign key.
 */
export function normaliseSymbol(raw: string, known: readonly string[]): string | null {
    const letters = raw.toUpperCase().replace(/[^A-Z]/g, '');
    if (letters.length < 6) return null;

    const candidate = `${letters.slice(0, 3)}/${letters.slice(3, 6)}`;
    return known.includes(candidate) ? candidate : null;
}
