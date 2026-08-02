import type { Metadata } from "next";

import { ReportsView } from "@/app/(app)/rapports/_components/reports-view";
import { listTrades } from "@/lib/journal";
import { requireUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Rapports" };
export const dynamic = "force-dynamic";

export default async function RapportsPage() {
  const userId = await requireUserId();

  // Reads the journal directly rather than keeping its own store: a report that
  // can disagree with the journal it describes is worse than no report.
  const trades = await listTrades(userId, 2000);

  return <ReportsView trades={trades} now={new Date().toISOString()} />;
}
