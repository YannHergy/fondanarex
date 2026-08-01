import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Comptes" };

export default function Page() {
  return (
    <PendingView
      title="Comptes"
      legacyComponent="Accounts.tsx (1122 lignes)"
      summary="Comptes de trading, capital, drawdown, objectifs et types d'entrée autorisés."
    />
  );
}
