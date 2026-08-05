import type { Metadata } from "next";

import { JournalView } from "@/app/(app)/journal/_components/journal-view";
import { DEFAULT_STRATEGIES } from "@/domain/journal/filters";
import type { InstrumentSpec } from "@/domain/risk/position";
import { listAnalysisRuns } from "@/lib/analysis-history";
import { listAccounts, listStrategies, listTrades } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Journal" };
export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const userId = await requireUserId();

  const [trades, custom, accounts, instruments, analysisHistory] = await Promise.all([
    listTrades(userId),
    listStrategies(userId),
    listAccounts(userId),
    // The spec travels to the client so the form can preview pips and P&L with
    // the same functions the server writes with — no second implementation.
    prisma.instrument.findMany({
      where: { isActive: true },
      orderBy: { symbol: "asc" },
      select: { symbol: true, pipSize: true, contractSize: true },
    }),
    listAnalysisRuns(userId),
  ]);

  const specs: Record<string, InstrumentSpec> = Object.fromEntries(
    instruments.map((instrument) => [
      instrument.symbol,
      {
        symbol: instrument.symbol,
        pipSize: Number(instrument.pipSize),
        contractSize: Number(instrument.contractSize),
      },
    ]),
  );

  return (
    <JournalView
      trades={trades}
      instruments={instruments.map((instrument) => instrument.symbol)}
      specs={specs}
      // Built-ins first, then whatever the user added — deduplicated, so a
      // custom entry matching a built-in name does not appear twice.
      strategies={[...new Set([...DEFAULT_STRATEGIES, ...custom])]}
      accounts={accounts}
      analysisHistory={analysisHistory}
      now={new Date().toISOString()}
    />
  );
}
