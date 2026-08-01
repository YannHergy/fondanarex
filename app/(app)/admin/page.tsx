import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Admin données" };

export default function Page() {
  return (
    <PendingView
      title="Admin données"
      legacyComponent="Admin.tsx (920 lignes)"
      summary="Saisie manuelle des indicateurs et du contexte de marché, et réinitialisation des données."
    />
  );
}
