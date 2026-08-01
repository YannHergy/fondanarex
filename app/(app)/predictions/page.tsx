import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Prédictions" };

export default function Page() {
  return (
    <PendingView
      title="Prédictions"
      legacyComponent="Predictions.tsx (601) + predictionService.ts (308)"
      summary="Prédictions en cascade générées par le moteur fondamental, avec suivi de confirmation."
    />
  );
}
