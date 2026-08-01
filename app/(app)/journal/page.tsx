import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Journal" };

export default function Page() {
  return (
    <PendingView
      title="Journal"
      legacyComponent="TradingJournal.tsx (1086 lignes)"
      summary="Journal de trades manuels et synchronisés MetaTrader, captures d'écran et statistiques."
    />
  );
}
