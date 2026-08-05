import "server-only";

import type { AnalysedTrade } from "@/domain/journal/analytics";
import type { JournalTrade, TradeOrigin } from "@/domain/journal/filters";
import { netPnl, tradePips, tradePnl } from "@/domain/journal/trade-math";
import type { InstrumentSpec } from "@/domain/risk/position";
import { listAttachments, type AttachmentRow } from "@/lib/attachments";
import { prisma } from "@/lib/prisma";
import { Direction, EntryType, TradeSource } from "@/lib/generated/prisma/enums";

/**
 * Trading journal.
 *
 * Pips and P&L are DERIVED here, from the instrument's own pip size and
 * contract size, and stored alongside the trade for query performance. The
 * legacy service computed them in the browser from `pair.includes('JPY')` and a
 * flat "1 pip = 10 USD per lot" — correct only for a USD-quoted major on a USD
 * account, and silently wrong for the eleven other pairs in its own list.
 *
 * Because they are derived, a fix to an instrument's spec can be backfilled:
 * see `recomputeDerived`.
 */

const DIRECTION_TO_DB: Record<"Buy" | "Sell", Direction> = {
  Buy: Direction.BUY,
  Sell: Direction.SELL,
};

const SOURCE_FROM_DB: Record<TradeSource, TradeOrigin> = {
  [TradeSource.MANUAL]: "manual",
  [TradeSource.METAAPI]: "metaapi",
  [TradeSource.MT5_REPORT]: "mt5",
};

export interface TradeRow extends JournalTrade {
  accountId: string | null;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  lotSize: number;
  commission: number | null;
  swap: number | null;
  entryType: string | null;
  closeType: string | null;
  emotionBefore: string | null;
  emotionAfter: string | null;
  notes: string | null;
  positionId: string | null;
  screenshots: AttachmentRow[];
}

export interface TradeInput {
  accountId?: string | null;
  instrument: string;
  direction: "Buy" | "Sell";
  openedAt: Date;
  closedAt?: Date | null;
  entryPrice: number;
  exitPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  lotSize: number;
  commission?: number | null;
  swap?: number | null;
  strategy?: string | null;
  entryType?: string | null;
  session?: string | null;
  closeType?: string | null;
  emotionBefore?: string | null;
  emotionAfter?: string | null;
  notes?: string | null;
  tags?: string[];
}

function num(value: unknown): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

async function instrumentSpec(symbol: string): Promise<InstrumentSpec> {
  const instrument = await prisma.instrument.findUnique({
    where: { symbol },
    select: { symbol: true, pipSize: true, contractSize: true },
  });

  if (!instrument) throw new Error(`Instrument inconnu : ${symbol}`);

  return {
    symbol: instrument.symbol,
    pipSize: Number(instrument.pipSize),
    contractSize: Number(instrument.contractSize),
  };
}

/** Pips and net P&L for a trade, from the instrument spec. */
function derive(
  input: Pick<TradeInput, "direction" | "entryPrice" | "exitPrice" | "lotSize" | "commission" | "swap">,
  spec: InstrumentSpec,
): { pips: number | null; pnl: number | null } {
  // An open trade has no result. Storing 0 would make it indistinguishable
  // from a genuine breakeven in every aggregate that reads the column.
  if (input.exitPrice === null || input.exitPrice === undefined) {
    return { pips: null, pnl: null };
  }

  const pips = tradePips(input.direction, input.entryPrice, input.exitPrice, spec);
  const gross = tradePnl(pips, input.lotSize, spec);

  return { pips, pnl: netPnl(gross, input.commission ?? null, input.swap ?? null) };
}

export async function listTrades(userId: string, limit = 500): Promise<TradeRow[]> {
  const trades = await prisma.trade.findMany({
    where: { userId },
    orderBy: { openedAt: "desc" },
    take: limit,
  });

  const attachments = await prisma.attachment.findMany({
    where: { userId, tradeId: { in: trades.map((trade) => trade.id) } },
    orderBy: { position: "asc" },
    select: { id: true, tradeId: true, mimeType: true, sizeBytes: true, caption: true, position: true },
  });

  const byTrade = new Map<string, AttachmentRow[]>();
  for (const attachment of attachments) {
    if (!attachment.tradeId) continue;
    const row: AttachmentRow = {
      id: attachment.id,
      url: `/api/attachments/${attachment.id}`,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      caption: attachment.caption,
      position: attachment.position,
    };
    const bucket = byTrade.get(attachment.tradeId);
    if (bucket) bucket.push(row);
    else byTrade.set(attachment.tradeId, [row]);
  }

  return trades.map((trade) => ({
    id: trade.id,
    accountId: trade.accountId,
    instrument: trade.instrument,
    direction: trade.direction === Direction.SELL ? "Sell" : "Buy",
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    entryPrice: num(trade.entryPrice),
    exitPrice: nullableNum(trade.exitPrice),
    stopLoss: nullableNum(trade.stopLoss),
    takeProfit: nullableNum(trade.takeProfit),
    lotSize: num(trade.lotSize),
    pips: nullableNum(trade.pips),
    pnl: nullableNum(trade.pnl),
    commission: nullableNum(trade.commission),
    swap: nullableNum(trade.swap),
    strategy: trade.strategy,
    entryType: trade.entryType,
    session: trade.session,
    closeType: trade.closeType,
    emotionBefore: trade.emotionBefore,
    emotionAfter: trade.emotionAfter,
    notes: trade.notes,
    tags: trade.tags,
    source: SOURCE_FROM_DB[trade.source] ?? "manual",
    positionId: trade.positionId,
    screenshots: byTrade.get(trade.id) ?? [],
  }));
}

function toData(input: TradeInput, derived: { pips: number | null; pnl: number | null }) {
  return {
    accountId: input.accountId ?? null,
    instrument: input.instrument,
    direction: DIRECTION_TO_DB[input.direction],
    openedAt: input.openedAt,
    closedAt: input.closedAt ?? null,
    entryPrice: input.entryPrice,
    exitPrice: input.exitPrice ?? null,
    stopLoss: input.stopLoss ?? null,
    takeProfit: input.takeProfit ?? null,
    lotSize: input.lotSize,
    commission: input.commission ?? null,
    swap: input.swap ?? null,
    pips: derived.pips,
    pnl: derived.pnl,
    strategy: input.strategy ?? null,
    entryType: (input.entryType as EntryType | null) ?? null,
    session: input.session ?? null,
    closeType: input.closeType ?? null,
    emotionBefore: input.emotionBefore ?? null,
    emotionAfter: input.emotionAfter ?? null,
    notes: input.notes ?? null,
    tags: input.tags ?? [],
  };
}

export async function createTrade(userId: string, input: TradeInput): Promise<string> {
  const spec = await instrumentSpec(input.instrument);

  const trade = await prisma.trade.create({
    data: { userId, ...toData(input, derive(input, spec)) },
    select: { id: true },
  });

  return trade.id;
}

export async function updateTrade(
  userId: string,
  tradeId: string,
  input: TradeInput,
): Promise<void> {
  const existing = await prisma.trade.findFirst({
    where: { id: tradeId, userId },
    select: { id: true },
  });
  if (!existing) throw new Error("Trade introuvable");

  const spec = await instrumentSpec(input.instrument);

  await prisma.trade.update({
    where: { id: tradeId },
    data: toData(input, derive(input, spec)),
  });
}

export async function deleteTrade(userId: string, tradeId: string): Promise<void> {
  // Scoped by owner, so an id from another account is a no-op. Attachments
  // cascade with the row; their blobs are cleaned by the same pass.
  const attachments = await prisma.attachment.findMany({
    where: { userId, tradeId },
    select: { blobPath: true },
  });

  await prisma.trade.deleteMany({ where: { id: tradeId, userId } });

  const { deleteAttachment } = await import("@/lib/storage");
  await Promise.all(attachments.map((row) => deleteAttachment(row.blobPath)));
}

/**
 * Recomputes pips and P&L for every trade of an instrument.
 *
 * The derived columns exist for query speed, which means a wrong instrument
 * spec bakes wrong numbers into history. This is the backfill the schema
 * comment promises: correct the spec, then run this.
 */
export async function recomputeDerived(
  userId: string,
  instrument?: string,
): Promise<{ updated: number }> {
  const trades = await prisma.trade.findMany({
    where: { userId, ...(instrument ? { instrument } : {}), closedAt: { not: null } },
    select: {
      id: true,
      instrument: true,
      direction: true,
      entryPrice: true,
      exitPrice: true,
      lotSize: true,
      commission: true,
      swap: true,
    },
  });

  const specs = new Map<string, InstrumentSpec>();
  let updated = 0;

  for (const trade of trades) {
    let spec = specs.get(trade.instrument);
    if (!spec) {
      spec = await instrumentSpec(trade.instrument);
      specs.set(trade.instrument, spec);
    }

    const derived = derive(
      {
        direction: trade.direction === Direction.SELL ? "Sell" : "Buy",
        entryPrice: num(trade.entryPrice),
        exitPrice: nullableNum(trade.exitPrice),
        lotSize: num(trade.lotSize),
        commission: nullableNum(trade.commission),
        swap: nullableNum(trade.swap),
      },
      spec,
    );

    await prisma.trade.update({
      where: { id: trade.id },
      data: { pips: derived.pips, pnl: derived.pnl },
    });
    updated += 1;
  }

  return { updated };
}

/**
 * Trades for the behavioural analysis, by id.
 *
 * Reads the instrument's pip size alongside each trade: the stop distance is
 * stored as a PRICE, and turning it into the risk-in-pips the R multiple needs
 * is impossible without it. Joining here keeps the domain free of I/O.
 *
 * Scoped by owner, so ids belonging to someone else simply do not come back.
 */
export async function listTradesForAnalysis(
  userId: string,
  tradeIds: readonly string[],
): Promise<AnalysedTrade[]> {
  const trades = await prisma.trade.findMany({
    where: { userId, id: { in: [...tradeIds] } },
    select: {
      instrument: true,
      direction: true,
      openedAt: true,
      closedAt: true,
      entryPrice: true,
      stopLoss: true,
      lotSize: true,
      pips: true,
      pnl: true,
      instrumentRef: { select: { pipSize: true } },
    },
  });

  return trades.map((trade) => ({
    instrument: trade.instrument,
    direction: trade.direction === Direction.SELL ? "Sell" : "Buy",
    openedAt: trade.openedAt,
    closedAt: trade.closedAt,
    entryPrice: num(trade.entryPrice),
    stopLoss: nullableNum(trade.stopLoss),
    lotSize: num(trade.lotSize),
    pips: nullableNum(trade.pips),
    pnl: nullableNum(trade.pnl),
    pipSize: Number(trade.instrumentRef.pipSize),
  }));
}

/** Strategy names: the built-in set plus whatever the user has added. */
export async function listStrategies(userId: string): Promise<string[]> {
  const custom = await prisma.customStrategy.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  return custom.map((strategy) => strategy.name);
}

export async function addStrategy(userId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  // Upsert on the unique key rather than read-then-write: two tabs adding the
  // same name would otherwise race and one would throw.
  await prisma.customStrategy.upsert({
    where: { userId_name: { userId, name: trimmed } },
    create: { userId, name: trimmed },
    update: {},
  });
}

export async function removeStrategy(userId: string, name: string): Promise<void> {
  await prisma.customStrategy.deleteMany({ where: { userId, name } });
}

/** Instruments available for trade entry. */
export async function listInstruments(): Promise<string[]> {
  const instruments = await prisma.instrument.findMany({
    where: { isActive: true },
    orderBy: { symbol: "asc" },
    select: { symbol: true },
  });

  return instruments.map((instrument) => instrument.symbol);
}

export interface AccountOption {
  id: string;
  name: string;
  color: string;
  /** Lets the equity curve plot a real balance rather than P&L from zero. */
  initialCapital: number;
}

export async function listAccounts(userId: string): Promise<AccountOption[]> {
  const accounts = await prisma.tradingAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true, initialCapital: true },
  });

  return accounts.map((account) => ({
    ...account,
    initialCapital: Number(account.initialCapital),
  }));
}

export async function listTradeAttachments(
  userId: string,
  tradeId: string,
): Promise<AttachmentRow[]> {
  return listAttachments(userId, { kind: "trade", id: tradeId });
}
