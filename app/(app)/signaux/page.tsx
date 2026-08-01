import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Signaux live" };

export default function Page() {
  return (
    <PendingView
      title="Signaux live"
      legacyComponent="LiveSignals.tsx (612 lignes)"
      summary="Signaux de paires générés à partir des scores, paires favorites et niveaux de conviction."
    />
  );
}
