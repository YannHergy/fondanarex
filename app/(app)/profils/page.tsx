import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Profils pays" };

export default function Page() {
  return (
    <PendingView
      title="Profils pays"
      legacyComponent="CountryProfiles.tsx (583 lignes)"
      summary="Profil détaillé de chaque économie : pondérations, moteur principal et particularités."
    />
  );
}
