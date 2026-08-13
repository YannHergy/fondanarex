import "server-only";

import { foldDealsIntoPositions } from "@/domain/journal/metaapi-deals";
import { normaliseSymbol } from "@/domain/journal/mt5-report";
import { netPnl, tradePips } from "@/domain/journal/trade-math";
import type { InstrumentSpec } from "@/domain/risk/position";
import { fetchMetaApiDeals } from "@/lib/integrations/metaapi";
import { prisma } from "@/lib/prisma";
import { Direction, TradeSource } from "@/lib/generated/prisma/enums";

/**
 * Synchronisation d'un compte MetaApi vers le journal.
 *
 * MÊME CHEMIN D'ÉCRITURE que l'import de rapport MT5 : mêmes pips recalculés
 * depuis les prix, même P&L net pris chez le broker, même déduplication sur
 * `positionId` via @@unique([userId, positionId]). Les deux voies produisent
 * donc des lignes identiques, et un trade déjà importé par fichier n'est pas
 * réécrit par la synchro — c'est ce que prévoit déjà le schéma.
 *
 * Un second convertisseur en parallèle aurait fini par diverger : deux calculs
 * de pips, deux façons de dériver le P&L, et un jour deux chiffres différents
 * pour le même trade.
 */

export interface SyncSummary {
  imported: number;
  duplicates: number;
  skippedInstruments: { symbol: string; count: number }[];
  /** Positions clôturées vues chez MetaApi, avant filtrage. */
  seen: number;
}

/** Fenêtre reprise à chaque synchro quand aucune n'a encore eu lieu. */
const FIRST_SYNC_DAYS = 365;
/**
 * Recouvrement volontaire sur les synchros suivantes : un trade peut être
 * enregistré chez le broker avec quelques minutes de retard, et repartir
 * exactement de la dernière synchro le manquerait définitivement. La
 * déduplication rend ce recouvrement gratuit.
 */
const OVERLAP_DAYS = 3;

export async function syncMetaApiAccount(
  userId: string,
  link: { metaApiAccountId: string; region: string | null; lastSyncAt: Date | null },
  tradingAccountId: string | null,
): Promise<SyncSummary> {
  const since = link.lastSyncAt
    ? new Date(link.lastSyncAt.getTime() - OVERLAP_DAYS * 24 * 60 * 60 * 1000)
    : new Date(Date.now() - FIRST_SYNC_DAYS * 24 * 60 * 60 * 1000);

  const deals = await fetchMetaApiDeals(link.metaApiAccountId, link.region ?? "new-york", since);
  const positions = foldDealsIntoPositions(deals);

  const instruments = await prisma.instrument.findMany({
    where: { isActive: true },
    select: { symbol: true, pipSize: true, contractSize: true },
  });
  const specs = new Map<string, InstrumentSpec>(
    instruments.map((i) => [
      i.symbol,
      { symbol: i.symbol, pipSize: Number(i.pipSize), contractSize: Number(i.contractSize) },
    ]),
  );
  const known = instruments.map((i) => i.symbol);

  // Un compte appartenant à quelqu'un d'autre rattacherait la synchro au
  // journal d'un tiers : vérifié plutôt que cru sur parole.
  let accountId: string | null = null;
  if (tradingAccountId) {
    const account = await prisma.tradingAccount.findFirst({
      where: { id: tradingAccountId, userId },
      select: { id: true },
    });
    accountId = account?.id ?? null;
  }

  const skipped = new Map<string, number>();
  const rows = [];

  for (const position of positions) {
    const instrument = normaliseSymbol(position.symbol, known);
    if (!instrument) {
      skipped.set(position.symbol, (skipped.get(position.symbol) ?? 0) + 1);
      continue;
    }
    const spec = specs.get(instrument);
    if (!spec) {
      skipped.set(position.symbol, (skipped.get(position.symbol) ?? 0) + 1);
      continue;
    }
    rows.push({ position, instrument, spec });
  }

  const existing = await prisma.trade.findMany({
    where: { userId, positionId: { in: rows.map((r) => r.position.positionId) } },
    select: { positionId: true },
  });
  const alreadyThere = new Set(existing.map((t) => t.positionId));
  const fresh = rows.filter((r) => !alreadyThere.has(r.position.positionId));

  if (fresh.length > 0) {
    await prisma.trade.createMany({
      data: fresh.map(({ position, instrument, spec }) => ({
        userId,
        accountId,
        instrument,
        direction: position.direction === "Sell" ? Direction.SELL : Direction.BUY,
        openedAt: position.openedAt,
        closedAt: position.closedAt,
        entryPrice: position.entryPrice,
        exitPrice: position.exitPrice,
        stopLoss: null,
        takeProfit: null,
        lotSize: position.lotSize,
        pips: tradePips(position.direction, position.entryPrice, position.exitPrice, spec),
        pnl: netPnl(position.profit, position.commission, position.swap),
        commission: position.commission,
        swap: position.swap,
        source: TradeSource.METAAPI,
        positionId: position.positionId,
        tags: [],
      })),
      skipDuplicates: true,
    });
  }

  return {
    imported: fresh.length,
    duplicates: rows.length - fresh.length,
    seen: positions.length,
    skippedInstruments: [...skipped.entries()]
      .map(([symbol, count]) => ({ symbol, count }))
      .sort((a, b) => b.count - a.count),
  };
}
