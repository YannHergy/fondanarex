"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  clearDismissed,
  dismissAlert,
  markAlertRead,
  markAllRead,
  saveAlertPreference,
} from "@/app/(app)/alertes/actions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function AlertRowActions({ id, read }: { id: string; read: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex shrink-0 items-center gap-1">
      {!read ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await markAlertRead(id);
              router.refresh();
            })
          }
          title="Marquer comme lue"
          aria-label="Marquer comme lue"
          className="text-subtle hover:text-brand-blue rounded p-1 transition-colors disabled:opacity-40"
        >
          <Icon name="mark_email_read" size={15} />
        </button>
      ) : null}

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await dismissAlert(id);
            router.refresh();
          })
        }
        title="Archiver"
        aria-label="Archiver"
        className="text-subtle hover:text-brand-red rounded p-1 transition-colors disabled:opacity-40"
      >
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}

export function BulkActions({ unread, dismissed }: { unread: number; dismissed: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending || unread === 0}
        onClick={() =>
          startTransition(async () => {
            await markAllRead();
            router.refresh();
          })
        }
        className="border-border-app text-muted hover:text-fg flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name="done_all" size={14} /> Tout marquer comme lu
      </button>

      <button
        type="button"
        disabled={pending || dismissed === 0}
        onClick={() =>
          startTransition(async () => {
            await clearDismissed();
            router.refresh();
          })
        }
        className="border-border-app text-muted hover:text-brand-red flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name="delete_sweep" size={14} /> Vider les archivées ({dismissed})
      </button>
    </div>
  );
}

const PRIORITIES = [
  { value: "LOW", label: "Toutes" },
  { value: "NORMAL", label: "Normale et +" },
  { value: "HIGH", label: "Haute et +" },
  { value: "CRITICAL", label: "Critique seulement" },
] as const;

export function PreferenceRow({
  currencyCode,
  enabled,
  minPriority,
}: {
  currencyCode: string;
  enabled: boolean;
  minPriority: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function save(next: { enabled?: boolean; minPriority?: string }) {
    startTransition(async () => {
      await saveAlertPreference({
        currencyCode,
        enabled: next.enabled ?? enabled,
        minPriority: next.minPriority ?? minPriority,
      });
      router.refresh();
    });
  }

  return (
    <div className="border-border-app flex items-center gap-3 border-b py-2 last:border-0">
      <span className="text-fg w-12 font-mono text-xs font-bold">{currencyCode}</span>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`Alertes ${currencyCode}`}
        disabled={pending}
        onClick={() => save({ enabled: !enabled })}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40",
          enabled ? "bg-brand-green" : "bg-border-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
            enabled ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>

      <label className="sr-only" htmlFor={`prio-${currencyCode}`}>
        Priorité minimale pour {currencyCode}
      </label>
      <select
        id={`prio-${currencyCode}`}
        value={minPriority}
        disabled={pending || !enabled}
        onChange={(e) => save({ minPriority: e.target.value })}
        className="bg-panel border-border-app text-fg flex-1 rounded-lg border px-2 py-1 text-xs outline-none disabled:opacity-40"
      >
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}
