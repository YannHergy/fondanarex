import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Engrenage" };

export default function Page() {
  return (
    <PendingView
      title="Engrenage"
      legacyComponent="GearGraph.tsx (757 lignes)"
      summary="Graphe des connexions fondamentales entre indicateurs et devises."
    />
  );
}
