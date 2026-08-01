import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Comparateur" };

export default function Page() {
  return (
    <PendingView
      title="Comparateur"
      legacyComponent="Comparator.tsx (803 lignes)"
      summary="Comparaison de deux devises : radar par famille d'indicateurs, écarts et verdict de paire."
    />
  );
}
