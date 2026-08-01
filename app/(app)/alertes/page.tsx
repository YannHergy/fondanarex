import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Alertes" };

export default function Page() {
  return (
    <PendingView
      title="Alertes"
      legacyComponent="AlertCenter.tsx (473) + alertService.ts + alertsService.ts"
      summary="Centre d'alertes unifié : surprises macro, changements de score, divergences et préférences par devise."
    />
  );
}
