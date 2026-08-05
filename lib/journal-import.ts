import "server-only";

import { netPnl, tradePips } from "@/domain/journal/trade-math";
import {
  normaliseSymbol,
  parseMt5Report,
  type Mt5Position,
} from "@/domain/journal/mt5-report";
import type { InstrumentSpec } from "@/domain/risk/position";
import { prisma } from "@/lib/prisma";
import { Direction, TradeSource } from "@/lib/generated/prisma/enums";

/**
 * MetaTrader 5 report import.
 *
 * The intended path for trade history was MetaApi, but the broker is a prop
 * firm and refuses third-party terminal connections — two separately created
 * MetaApi accounts sat at DISCONNECTED with no error, on credentials verified
 * character by character against the broker's own dashboard. The report export
 * carries the same fields, including the position id, so nothing is lost.
 *
 * Provenance is preserved: rows land as MT5_REPORT, never MANUAL, and the
 * position id is stored so a future MetaApi sync deduplicates against them
 * through the existing @@unique([userId, positionId]).
 */

export interface ImportSummary {
  /** Positions written as new trades. */
  imported: number;
  /** Positions already in the journal, left untouched. */
  duplicates: number;
  /** Instruments the journal does not carry, with how many trades each cost. */
  skippedInstruments: { symbol: string; count: number }[];
  /** Rows that could not be read, one message each. */
  warnings: string[];
}

/**
 * Result of one imported position.
 *
 * Pips are recomputed from the prices, because they are currency-independent
 * and our instrument specs are exact. P&L is taken from the BROKER instead:
 * it is already denominated in the account currency, whereas `tradePnl` yields
 * the quote currency and would need a conversion rate we do not have for a
 * trade closed months ago. The broker's figure is also the one the user's
 * balance actually moved by.
 */
function derive(
  position: Mt5Position,
  spec: InstrumentSpec,
): { pips: number; pnl: number | null } {
  const pips = tradePips(position.direction, position.entryPrice, position.exitPrice, spec);

  // MT5 reports Profit gross of costs, with Commission and Swap in their own
  // columns; the report's own "Total Net Profit" is their sum.
  const pnl =
    position.profit === null
      ? null
      : netPnl(position.profit, position.commission, position.swap);

  return { pips, pnl };
}

export async function importMt5Report(
  userId: string,
  html: string,
  options: { accountId?: string | null } = {},
): Promise<ImportSummary> {
  // Throws Mt5ParseError when the file is not a report or its numbers cannot
  // be trusted; the caller turns that into a message for the user.
  const { positions, warnings } = parseMt5Report(html);

  const instruments = await prisma.instrument.findMany({
    where: { isActive: true },
    select: { symbol: true, pipSize: true, contractSize: true },
  });

  const specs = new Map<string, InstrumentSpec>(
    instruments.map((instrument) => [
      instrument.symbol,
      {
        symbol: instrument.symbol,
        pipSize: Number(instrument.pipSize),
        contractSize: Number(instrument.contractSize),
      },
    ]),
  );
  const known = instruments.map((instrument) => instrument.symbol);

  // An account id from another user would attach the import to someone else's
  // account, so it is verified rather than trusted.
  let accountId: string | null = null;
  if (options.accountId) {
    const account = await prisma.tradingAccount.findFirst({
      where: { id: options.accountId, userId },
      select: { id: true },
    });
    accountId = account?.id ?? null;
  }

  const skipped = new Map<string, number>();
  const rows: {
    positionId: string;
    instrument: string;
    position: Mt5Position;
    spec: InstrumentSpec;
  }[] = [];

  for (const position of positions) {
    const instrument = normaliseSymbol(position.symbol, known);
    const spec = instrument ? specs.get(instrument) : undefined;

    // Metals, indices and anything else outside the journal's pair list. Writing
    // them would violate the Trade -> Instrument foreign key, so they are
    // reported back rather than dropped in silence.
    if (!instrument || !spec) {
      skipped.set(position.symbol, (skipped.get(position.symbol) ?? 0) + 1);
      continue;
    }

    rows.push({ positionId: position.positionId, instrument, position, spec });
  }

  // Already-journalled positions are LEFT ALONE, not overwritten. Re-importing a
  // wider date range is the normal way to use this, and the trades it overlaps
  // may by then carry notes, emotions and screenshots the report knows nothing
  // about. Skipping protects them; the summary reports the count.
  const existing = await prisma.trade.findMany({
    where: { userId, positionId: { in: rows.map((row) => row.positionId) } },
    select: { positionId: true },
  });
  const alreadyThere = new Set(existing.map((trade) => trade.positionId));

  const fresh = rows.filter((row) => !alreadyThere.has(row.positionId));

  if (fresh.length > 0) {
    await prisma.trade.createMany({
      data: fresh.map(({ position, instrument, spec }) => {
        const { pips, pnl } = derive(position, spec);
        return {
          userId,
          accountId,
          instrument,
          direction: position.direction === "Sell" ? Direction.SELL : Direction.BUY,
          openedAt: position.openedAt,
          closedAt: position.closedAt,
          entryPrice: position.entryPrice,
          exitPrice: position.exitPrice,
          stopLoss: position.stopLoss,
          takeProfit: position.takeProfit,
          lotSize: position.lotSize,
          pips,
          pnl,
          commission: position.commission,
          swap: position.swap,
          source: TradeSource.MT5_REPORT,
          positionId: position.positionId,
          tags: [],
        };
      }),
      // Belt and braces against two imports racing: the unique index is the
      // real guarantee, this stops it from aborting the whole batch.
      skipDuplicates: true,
    });
  }

  return {
    imported: fresh.length,
    duplicates: rows.length - fresh.length,
    skippedInstruments: [...skipped.entries()]
      .map(([symbol, count]) => ({ symbol, count }))
      .sort((a, b) => b.count - a.count),
    warnings,
  };
}
