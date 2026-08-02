"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { refreshMacroAction } from "@/app/(app)/refresh-actions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Triggers a macro refresh and reports what happened.
 *
 * Shows the outcome rather than just spinning: a refresh that reaches the OECD
 * but writes nothing because a dataset changed shape is a silent failure
 * otherwise, and the legacy version of this button gave no feedback at all
 * beyond a spinner.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function refresh() {
    setResult(null);
    startTransition(async () => {
      try {
        const report = await refreshMacroAction();
        setResult({
          ok: report.written > 0,
          message:
            report.written > 0
              ? `${report.written} valeurs mises à jour${
                  report.errors.length > 0 ? ` · ${report.errors.length} source(s) en erreur` : ""
                }`
              : "Aucune donnée reçue — sources indisponibles",
        });
        // Re-render the server components with the newly written values.
        router.refresh();
      } catch {
        setResult({ ok: false, message: "Échec de la synchronisation" });
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {result ? (
        <span
          role="status"
          className={cn(
            "text-[10px] font-medium",
            result.ok ? "text-brand-green" : "text-brand-amber",
          )}
        >
          {result.message}
        </span>
      ) : null}

      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        title="Récupérer les dernières publications OECD et FRED"
        className="border-border-app text-muted hover:text-brand-cyan hover:border-brand-cyan/30 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] tracking-wide uppercase transition-all disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name="refresh" size={13} className={pending ? "animate-spin" : undefined} />
        {pending ? "Synchronisation…" : "Actualiser"}
      </button>
    </div>
  );
}
