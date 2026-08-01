import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Rapports" };

export default function Page() {
  return (
    <PendingView
      title="Rapports"
      legacyComponent="TradingReports.tsx (736 lignes)"
      summary="Rapports de performance : par session, par stratégie, par type d'entrée et par émotion."
    />
  );
}
