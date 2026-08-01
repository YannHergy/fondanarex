import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Prévisions" };

export default function Page() {
  return (
    <PendingView
      title="Prévisions"
      legacyComponent="WeeklyPlan.tsx (1194 lignes)"
      summary="Plan hebdomadaire : setups par paire, contexte fondamental, revue de semaine et captures."
    />
  );
}
