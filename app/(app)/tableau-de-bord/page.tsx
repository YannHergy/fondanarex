import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Tableau de bord" };

export default function Page() {
  return (
    <PendingView
      title="Tableau de bord"
      legacyComponent="Dashboard.tsx (397 lignes)"
      summary="Grille de score par devise, rafraîchissement des données API, accès au détail et au profil de chaque devise."
    />
  );
}
