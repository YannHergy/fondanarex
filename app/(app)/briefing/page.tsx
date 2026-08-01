import type { Metadata } from "next";

import { PendingView } from "@/components/ui/pending-view";

export const metadata: Metadata = { title: "Briefing IA" };

export default function Page() {
  return (
    <PendingView
      title="Briefing IA"
      legacyComponent="AIBriefing.tsx (765) + aiBriefingService.ts (643)"
      summary="Débat multi-modèles en cinq tours (Perplexity, Claude, Groq) avec consensus final par devise."
    />
  );
}
