"use client";

import { useState, useTransition } from "react";

import { forceRefreshNews } from "@/app/(app)/devise/[code]/actions";
import { Icon } from "@/components/ui/icon";

/** Forces a refresh now, for the minutes before a release when waiting costs. */
export function RefreshNewsButton() {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {note ? <span className="text-subtle text-[11px]">{note}</span> : null}

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setNote(null);
            // A server action that throws rejects this promise, and a rejection
            // inside a transition leaves `pending` stuck at true for good.
            try {
              const result = await forceRefreshNews();
              setNote(
                result.ok
                  ? result.stored > 0
                    ? `${result.stored} nouveau${result.stored > 1 ? "x" : ""}`
                    : "déjà à jour"
                  : result.error,
              );
            } catch {
              setNote("Flux injoignable");
            }
          })
        }
        className="border-border-app text-subtle hover:border-brand-blue hover:text-fg flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
      >
        <Icon name={pending ? "hourglass_empty" : "refresh"} size={13} />
        {pending ? "Lecture…" : "Actualiser"}
      </button>
    </div>
  );
}
