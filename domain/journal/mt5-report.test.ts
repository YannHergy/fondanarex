import { describe, expect, it } from 'vitest';

import {
    Mt5ParseError,
    normaliseSymbol,
    parseMt5Report,
    parseReportDate,
    parseReportNumber,
} from './mt5-report';

const KNOWN = ['EUR/USD', 'GBP/JPY', 'USD/CAD'] as const;

/** The Positions table as MT5 writes it, English terminal. */
function report(bodyRows: string, header = ENGLISH_HEADER): string {
    return `<html><body><table>
        <tr><td colspan="13"><b>Positions</b></td></tr>
        ${header}
        ${bodyRows}
    </table></body></html>`;
}

const ENGLISH_HEADER = `<tr align="center">
    <td>Time</td><td>Position</td><td>Symbol</td><td>Type</td><td>Volume</td>
    <td>Price</td><td>S / L</td><td>T / P</td><td>Time</td><td>Price</td>
    <td>Commission</td><td>Swap</td><td>Profit</td>
</tr>`;

const WINNER = `<tr align="right">
    <td>2026.07.14 09:12:03</td><td>1234567</td><td>EURUSD</td><td>buy</td><td>0.50</td>
    <td>1.09210</td><td>1.08900</td><td>1.09800</td>
    <td>2026.07.14 15:44:31</td><td>1.09655</td>
    <td>-3.50</td><td>-0.42</td><td>222.50</td>
</tr>`;

describe('parseMt5Report', () => {
    it('reads every field of a closed position', () => {
        const { positions, warnings } = parseMt5Report(report(WINNER));

        expect(warnings).toEqual([]);
        expect(positions).toHaveLength(1);
        expect(positions[0]).toEqual({
            positionId: '1234567',
            symbol: 'EURUSD',
            direction: 'Buy',
            openedAt: new Date('2026-07-14T09:12:03Z'),
            closedAt: new Date('2026-07-14T15:44:31Z'),
            entryPrice: 1.0921,
            exitPrice: 1.09655,
            stopLoss: 1.089,
            takeProfit: 1.098,
            lotSize: 0.5,
            commission: -3.5,
            swap: -0.42,
            profit: 222.5,
        });
    });

    it('reads a sell, and treats blank S/L and T/P as absent', () => {
        const row = `<tr>
            <td>2026.07.15 10:00:00</td><td>7654321</td><td>GBPJPY</td><td>sell</td><td>1.00</td>
            <td>195.400</td><td>&nbsp;</td><td></td>
            <td>2026.07.15 12:30:00</td><td>194.900</td>
            <td>-7.00</td><td>0.00</td><td>335.10</td>
        </tr>`;

        const { positions } = parseMt5Report(report(row));

        expect(positions[0]?.direction).toBe('Sell');
        expect(positions[0]?.stopLoss).toBeNull();
        expect(positions[0]?.takeProfit).toBeNull();
        // A zero swap is a real reading, not a missing one.
        expect(positions[0]?.swap).toBe(0);
    });

    it('reads profits carrying thousands separators', () => {
        const row = `<tr>
            <td>2026.07.16 08:00:00</td><td>1111111</td><td>EURUSD</td><td>buy</td><td>10.00</td>
            <td>1.08000</td><td></td><td></td>
            <td>2026.07.16 18:00:00</td><td>1.09500</td>
            <td>-70.00</td><td>-1.20</td><td>1&nbsp;500.00</td>
        </tr>`;

        expect(parseMt5Report(report(row)).positions[0]?.profit).toBe(1500);
    });

    it('skips a position that is still open', () => {
        const open = `<tr>
            <td>2026.07.17 08:00:00</td><td>2222222</td><td>EURUSD</td><td>buy</td><td>0.10</td>
            <td>1.08000</td><td></td><td></td>
            <td></td><td></td>
            <td></td><td></td><td></td>
        </tr>`;

        const { positions, warnings } = parseMt5Report(report(`${WINNER}${open}`));

        expect(positions.map((position) => position.positionId)).toEqual(['1234567']);
        // Silently, not as a warning: an open trade has no result to journal.
        expect(warnings).toEqual([]);
    });

    it('stops at the Orders section instead of reading its rows as positions', () => {
        const orders = `
            <tr><td colspan="11"><b>Orders</b></td></tr>
            <tr align="center"><td>Open Time</td><td>Order</td><td>Symbol</td><td>Type</td></tr>
            <tr><td>2026.07.14 09:12:03</td><td>9999999</td><td>EURUSD</td><td>buy</td></tr>`;

        const { positions } = parseMt5Report(report(`${WINNER}${orders}`));

        expect(positions.map((position) => position.positionId)).toEqual(['1234567']);
    });

    it('maps columns by name, so a reordered template still imports', () => {
        const header = `<tr>
            <td>Position</td><td>Symbol</td><td>Type</td><td>Volume</td>
            <td>Time</td><td>Price</td><td>Time</td><td>Price</td><td>Profit</td>
        </tr>`;
        const row = `<tr>
            <td>3333333</td><td>USDCAD</td><td>sell</td><td>0.25</td>
            <td>2026.07.18 07:00:00</td><td>1.37500</td>
            <td>2026.07.18 09:00:00</td><td>1.37200</td><td>54.60</td>
        </tr>`;

        const { positions } = parseMt5Report(report(row, header));

        expect(positions[0]).toMatchObject({
            positionId: '3333333',
            symbol: 'USDCAD',
            entryPrice: 1.375,
            exitPrice: 1.372,
            profit: 54.6,
            // Columns absent from this template, rather than misread from another.
            stopLoss: null,
            commission: null,
        });
    });

    it('reads a French terminal export', () => {
        const header = `<tr>
            <td>Heure</td><td>Position</td><td>Symbole</td><td>Type</td><td>Volume</td>
            <td>Prix</td><td>S / L</td><td>T / P</td><td>Heure</td><td>Prix</td>
            <td>Commission</td><td>Swap</td><td>Profit</td>
        </tr>`;

        const { positions } = parseMt5Report(report(WINNER, header));

        expect(positions[0]?.positionId).toBe('1234567');
        expect(positions[0]?.exitPrice).toBe(1.09655);
    });

    it('warns about an unreadable row but keeps the rest', () => {
        const broken = `<tr>
            <td>2026.07.19 08:00:00</td><td>4444444</td><td>EURUSD</td><td>buy</td><td>zéro</td>
            <td>1.08000</td><td></td><td></td>
            <td>2026.07.19 09:00:00</td><td>1.08500</td>
            <td></td><td></td><td>50.00</td>
        </tr>`;

        const { positions, warnings } = parseMt5Report(report(`${WINNER}${broken}`));

        expect(positions).toHaveLength(1);
        expect(warnings).toEqual(['Position 4444444 : volume illisible']);
    });

    // Shape taken verbatim from a FundedNext MT5 build, French interface.
    // Two traps live here, and together they read a real 26-trade export as
    // zero trades: the hidden spacer cell shifts every column after Type, so
    // the close time lands on the T/P price and each row looks still open.
    describe('real FundedNext export', () => {
        const FRENCH_HEADER = `<tr>
            <td nowrap style="height: 30px"><b>Heure</b></td><td nowrap><b>Position</b></td>
            <td nowrap><b>Symbole</b></td><td nowrap><b>Type</b></td><td nowrap><b>Volume</b></td>
            <td nowrap><b>Prix</b></td><td nowrap><b>S / L</b></td><td nowrap><b>T / P</b></td>
            <td nowrap><b>Heure</b></td><td nowrap><b>Prix</b></td>
            <td nowrap><b>Commission</b></td><td nowrap><b>Echange</b></td>
            <td nowrap colspan="2"><b>Profit</b></td>
        </tr>`;

        const REAL_ROW = `<tr>
            <td>2026.02.26 14:56:29</td><td>159270650</td><td>GBPUSD</td><td>sell</td>
            <td class="hidden" colspan="8"></td>
            <td class="">0.08</td><td class="">1.35467</td><td class="">1.35593</td>
            <td class="">1.33859</td><td class="">2026.03.02 00:18:16</td><td class="">1.34173</td>
            <td class="">-0.56</td><td class="">-0.48</td><td class="">103.52</td>
        </tr>`;

        it('ignores the hidden spacer cell so columns line up with the header', () => {
            const { positions, warnings } = parseMt5Report(report(REAL_ROW, FRENCH_HEADER));

            expect(warnings).toEqual([]);
            expect(positions).toHaveLength(1);
            expect(positions[0]).toMatchObject({
                positionId: '159270650',
                direction: 'Sell',
                lotSize: 0.08,
                entryPrice: 1.35467,
                // Read from the second Prix, not the S/L that sits before it.
                exitPrice: 1.34173,
                stopLoss: 1.35593,
                takeProfit: 1.33859,
                // The whole point: a real close time, not a price misread as one.
                closedAt: new Date('2026-03-02T00:18:16Z'),
            });
        });

        it('reads "Echange" as the swap column', () => {
            expect(parseMt5Report(report(REAL_ROW, FRENCH_HEADER)).positions[0]?.swap).toBe(-0.48);
        });

        it('nets profit against commission and swap the way the report does', () => {
            const position = parseMt5Report(report(REAL_ROW, FRENCH_HEADER)).positions[0];
            const net = (position?.profit ?? 0) + (position?.commission ?? 0) + (position?.swap ?? 0);

            // 103.52 - 0.56 - 0.48, matching the report's own "Profit Total Net".
            expect(Number(net.toFixed(2))).toBe(102.48);
        });
    });

    it('refuses a report written with comma decimals rather than misread prices', () => {
        const row = WINNER.replace('1.09210', '1,09210');

        expect(() => parseMt5Report(report(row))).toThrow(Mt5ParseError);
        expect(() => parseMt5Report(report(row))).toThrow(/virgule/);
    });

    it('rejects a file with no Positions table', () => {
        const other = `<html><body><table>
            <tr><td>Deal</td><td>Symbol</td></tr>
            <tr><td>1</td><td>EURUSD</td></tr>
        </table></body></html>`;

        expect(() => parseMt5Report(other)).toThrow(/Positions/);
    });

    it('rejects a file with no table at all', () => {
        expect(() => parseMt5Report('<html><body><p>rien</p></body></html>')).toThrow(
            /rapport MetaTrader/,
        );
    });
});

describe('parseReportNumber', () => {
    it('reads plain and signed values', () => {
        expect(parseReportNumber('1.09210')).toBe(1.0921);
        expect(parseReportNumber('-3.50')).toBe(-3.5);
        expect(parseReportNumber('0.00')).toBe(0);
    });

    it('strips thousands separators, including non-breaking spaces', () => {
        expect(parseReportNumber('1 500.00')).toBe(1500);
        expect(parseReportNumber('1 500.00')).toBe(1500);
        expect(parseReportNumber('1,500.00')).toBe(1500);
    });

    it('returns null for a blank or non-numeric cell', () => {
        expect(parseReportNumber('')).toBeNull();
        expect(parseReportNumber('   ')).toBeNull();
        expect(parseReportNumber('n/a')).toBeNull();
    });
});

describe('parseReportDate', () => {
    it('reads the MT5 stamp as UTC', () => {
        expect(parseReportDate('2026.07.14 09:12:03')).toEqual(new Date('2026-07-14T09:12:03Z'));
    });

    it('tolerates a missing seconds field', () => {
        expect(parseReportDate('2026.07.14 09:12')).toEqual(new Date('2026-07-14T09:12:00Z'));
    });

    it('returns null for anything else', () => {
        expect(parseReportDate('')).toBeNull();
        expect(parseReportDate('14/07/2026')).toBeNull();
    });
});

describe('normaliseSymbol', () => {
    it('inserts the slash', () => {
        expect(normaliseSymbol('EURUSD', KNOWN)).toBe('EUR/USD');
    });

    it('discards broker suffixes', () => {
        expect(normaliseSymbol('EURUSD.r', KNOWN)).toBe('EUR/USD');
        expect(normaliseSymbol('EURUSD-ECN', KNOWN)).toBe('EUR/USD');
        expect(normaliseSymbol('eurusd_i', KNOWN)).toBe('EUR/USD');
    });

    it('returns null for an instrument the journal does not carry', () => {
        expect(normaliseSymbol('XAUUSD', KNOWN)).toBeNull();
        expect(normaliseSymbol('US30', KNOWN)).toBeNull();
        expect(normaliseSymbol('EUR', KNOWN)).toBeNull();
    });
});
