"use client";

import { useState, useTransition } from "react";

import { saveIndicatorOverrides } from "@/app/(app)/admin/actions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * A macro value with an inline pencil to correct it.
 *
 * Writes through the same server action as the Admin screen, which stores
 * corrections in IndicatorOverride — a different table from the one a refresh
 * writes to. That separation is what makes a hand-entered figure survive the
 * next automatic pull instead of being silently overwritten.
 *
 * Submitting an empty field CLEARS the correction rather than storing a zero:
 * absence of a row is what "use the source value again" means, and a stored
 * zero would be indistinguishable from a genuine reading of zero.
 */
export function EditableValue({
  code,
  field,
  value,
  unit,
  decimals = 2,
}: {
  code: string;
  field: string;
  value: number;
  unit?: string;
  decimals?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setDraft(String(value));
    setError(null);
    setEditing(true);
  }

  function submit() {
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);

    if (parsed !== null && !Number.isFinite(parsed)) {
      setError("Nombre invalide");
      return;
    }

    startTransition(async () => {
      try {
        await saveIndicatorOverrides({ code, values: { [field]: parsed } });
        setEditing(false);
        setError(null);
      } catch {
        setError("Échec de l'enregistrement");
      }
    });
  }

  if (!editing) {
    return (
      <p className="text-fg tabular group flex items-center gap-1 font-mono text-sm font-semibold">
        {value.toFixed(decimals)}
        {unit ? <span className="text-subtle">{unit}</span> : null}
        <button
          type="button"
          onClick={open}
          aria-label={`Modifier ${field}`}
          title="Modifier cette valeur"
          className="text-subtle hover:text-brand-blue ml-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Icon name="edit" size={11} />
        </button>
      </p>
    );
  }

  return (
    <div className="mt-0.5">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          inputMode="decimal"
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setEditing(false);
          }}
          className={cn(
            "tabular border-border-app bg-panel text-fg w-20 rounded border px-1.5 py-0.5 font-mono text-sm",
            "focus:border-brand-blue focus:outline-none",
          )}
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          aria-label="Enregistrer"
          className="text-brand-green hover:text-brand-green/80 disabled:opacity-40"
        >
          <Icon name={pending ? "progress_activity" : "check"} size={14} className={pending ? "animate-spin" : ""} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          aria-label="Annuler"
          className="text-subtle hover:text-fg disabled:opacity-40"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      <p className="text-subtle mt-1 text-[9px] leading-tight">
        {error ? <span className="text-brand-red">{error}</span> : "Vider le champ rétablit la valeur de la source."}
      </p>
    </div>
  );
}
