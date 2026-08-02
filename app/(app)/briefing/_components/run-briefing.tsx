"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { startBriefing } from "@/app/(app)/briefing/actions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function RunBriefing({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  function run() {
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await startBriefing();
        setStatus({
          ok: result.failures === 0,
          message:
            result.failures === 0
              ? `Briefing terminé · ${result.rounds} tours · ${result.costUsd.toFixed(4)} $`
              : `Terminé avec ${result.failures} erreur(s) sur ${result.rounds} tours · ${result.costUsd.toFixed(4)} $`,
        });
        router.refresh();
      } catch {
        setStatus({ ok: false, message: "Le briefing a échoué. Consultez la session ci-dessous." });
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending || !enabled}
        title={enabled ? undefined : "Aucune clé API de modèle configurée"}
        className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name={pending ? "progress_activity" : "smart_toy"} size={16} className={pending ? "animate-spin" : undefined} />
        {pending ? "Débat en cours…" : "Lancer un briefing"}
      </button>

      {pending ? (
        <span className="text-subtle text-xs">
          20 appels de modèles, plusieurs minutes. Chaque tour est enregistré au fur et à mesure.
        </span>
      ) : null}

      {status ? (
        <span
          role="status"
          className={cn("text-xs font-medium", status.ok ? "text-brand-green" : "text-brand-amber")}
        >
          {status.message}
        </span>
      ) : null}
    </div>
  );
}
