import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Graphiques" };

export default function Page() {
  return (
    <PendingView
      title="Graphiques"
      legacyComponent="Charts.tsx (523 lignes)"
      summary="Séries historiques de scores et d'indicateurs par devise."
    />
  );
}
