import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Simulateur" };

export default function Page() {
  return (
    <PendingView
      title="Simulateur"
      legacyComponent="Simulator.tsx (953) + BreakevenSimulator.tsx (414) + RiskCalculator.tsx (159)"
      summary="Simulateur de progression de compte, calcul de risque et simulateur de seuil de rentabilité."
    />
  );
}
