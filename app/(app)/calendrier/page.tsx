import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Calendrier" };

export default function Page() {
  return (
    <PendingView
      title="Calendrier"
      legacyComponent="Calendar.tsx (279 lignes)"
      summary="Calendrier économique agrégé et prochaines publications par devise."
    />
  );
}
