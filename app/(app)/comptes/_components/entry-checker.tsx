"use client";

import { useState } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { ALL_ENTRY_TYPES, ENTRY_WIN_RATES, type EntryType } from "@/domain/data/entry-types";
import { cn } from "@/lib/utils";

/**
 * Which accounts permit a given entry type.
 *
 * The question this answers is asked at the moment a setup appears, under time
 * pressure: "I have an A2 — where can I take it?" Reading four account cards
 * and comparing their allowed lists is exactly the kind of task that gets done
 * wrong in a hurry.
 */

export interface CheckerAccount {
  id: string;
  name: string;
  color: string;
  style: string;
  allowedEntries: string[];
}

/** Entry types offered. M1 and A11 are excluded, as in the legacy screen. */
const HIDDEN = new Set(["M1_ENTRY", "A11_ENTRY"]);

export function EntryChecker({ accounts }: { accounts: CheckerAccount[] }) {
  // Driven by the full taxonomy, not by which entries happen to have a
  // measured win rate — GOLDEN_ENTRY has none yet and must still be checkable.
  const entries = ALL_ENTRY_TYPES.filter((entry) => !HIDDEN.has(entry));
  const [selected, setSelected] = useState<EntryType>(
    entries.includes("A2_ENTRY") ? "A2_ENTRY" : entries[0]!,
  );

  return (
    <Card>
      <CardTitle icon="verified_user">Vérificateur d&apos;entrée</CardTitle>
      <p className="text-subtle -mt-2 mb-3 text-xs">
        Sur quels comptes ce type d&apos;entrée est-il autorisé ?
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {entries.map((entry) => {
          const winRate = ENTRY_WIN_RATES[entry];
          const golden = entry === "GOLDEN_ENTRY";

          return (
            <button
              key={entry}
              type="button"
              onClick={() => setSelected(entry)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors",
                selected === entry
                  ? golden
                    ? "border-brand-amber/60 bg-brand-amber/20 text-brand-amber"
                    : "border-brand-violet/60 bg-brand-violet/20 text-brand-violet"
                  : "border-border-app text-subtle hover:text-fg",
              )}
            >
              {entry.replace("_ENTRY", "")}
              {winRate !== undefined ? (
                <span className="ml-1 text-[10px] opacity-60">{winRate} %</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {accounts.map((account) => {
          const allowed = account.allowedEntries.includes(selected);

          return (
            <div
              key={account.id}
              className={cn(
                "rounded-xl border p-3 text-center transition-opacity",
                allowed
                  ? "border-brand-green/30 bg-brand-green/10"
                  : "border-brand-red/20 bg-brand-red/5 opacity-60",
              )}
            >
              <div className="mb-1.5 flex items-center justify-center gap-1.5">
                <Icon
                  name={allowed ? "check_circle" : "block"}
                  size={15}
                  className={allowed ? "text-brand-green" : "text-brand-red"}
                />
                <span className="text-fg text-sm font-bold">{account.name}</span>
              </div>
              <p className="text-subtle mb-1 text-[11px]">{account.style}</p>
              <p
                className={cn(
                  "text-[11px] font-bold tracking-wide uppercase",
                  allowed ? "text-brand-green" : "text-brand-red",
                )}
              >
                {allowed ? "Autorisé" : "Interdit"}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
