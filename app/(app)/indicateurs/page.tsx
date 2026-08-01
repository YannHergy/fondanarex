import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Indicateurs" };

export default function Page() {
  return (
    <PendingView
      title="Indicateurs"
      legacyComponent="PineScriptIndicators.tsx (1069 lignes)"
      summary="Générateur de configuration pour les indicateurs Pine Script (lignes de news, journal d'événements)."
    />
  );
}
