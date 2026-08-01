import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Corrélations" };

export default function Page() {
  return (
    <PendingView
      title="Corrélations"
      legacyComponent="Correlations.tsx (457 lignes)"
      summary="Matrice de corrélation entre paires et devises."
    />
  );
}
