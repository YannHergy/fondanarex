"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * A field that saves itself when it loses focus.
 *
 * Neither of the legacy behaviours. It first auto-saved the ENTIRE plan on
 * every keystroke — rewriting every base64 screenshot with it — and was then
 * changed to a manual Save button, which moved the cost onto the user: leaving
 * the week without pressing it lost the work, and `navigateWeek` saved the
 * outgoing plan and loaded the next one in the same tick.
 *
 * Blur is the natural commit point: one write per field actually edited, no
 * debounce timer to race with navigation, and nothing lost by looking away.
 */
export function SavedField({
  label,
  value,
  onSave,
  multiline = false,
  rows = 4,
  placeholder,
  className,
}: {
  label?: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const committed = useRef(value);

  // A refresh from the server replaces the draft only when the user is not
  // mid-edit, so a background revalidation cannot wipe what is being typed.
  useEffect(() => {
    if (committed.current !== value) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  function commit() {
    const next = draft.trim() === "" ? "" : draft;
    if (next === committed.current) return;

    startTransition(async () => {
      try {
        await onSave(next);
        committed.current = next;
        setState("saved");
      } catch {
        setState("error");
      }
    });
  }

  const Control = multiline ? "textarea" : "input";

  return (
    <div className={className}>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-subtle text-[10px] font-bold tracking-widest uppercase">
            {label}
          </label>
          <span className="text-[10px]" aria-live="polite">
            {pending ? (
              <span className="text-subtle">enregistrement…</span>
            ) : state === "saved" ? (
              <span className="text-brand-green flex items-center gap-0.5">
                <Icon name="check" size={11} />
                enregistré
              </span>
            ) : state === "error" ? (
              <span className="text-brand-red">échec</span>
            ) : null}
          </span>
        </div>
      ) : null}

      <Control
        value={draft}
        rows={multiline ? rows : undefined}
        placeholder={placeholder}
        onChange={(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          setDraft(event.target.value);
          setState("idle");
        }}
        onBlur={commit}
        className={cn(
          "bg-panel border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-3 py-2 text-sm focus:outline-none",
          multiline && "resize-y leading-relaxed",
        )}
      />
    </div>
  );
}
