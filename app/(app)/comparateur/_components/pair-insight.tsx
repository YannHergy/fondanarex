"use client";

import { useState, useTransition } from "react";

import { generatePairInsight } from "@/app/(app)/comparateur/actions";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * "Expert AI Insight" — a single Claude-written narrative for the pair
 * currently open, gated by a weekly quota enforced server-side (see
 * actions.ts). The remaining count is only known after the first call in
 * this session, since it depends on the user's usage over the last 7 days.
 */
export function PairInsight({ baseCode, quoteCode }: { baseCode: string; quoteCode: string }) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await generatePairInsight(baseCode, quoteCode);
      setRemaining(result.remaining);
      if (result.error) {
        setError(result.error);
        setText(null);
      } else {
        setText(result.text);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="bg-fg text-bg flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
      >
        <Icon name={pending ? "progress_activity" : "psychology"} size={17} className={pending ? "animate-spin" : undefined} />
        {pending ? "Analyse en cours…" : "Expert AI Insight"}
      </button>

      {remaining !== null ? (
        <p className="text-subtle mt-1.5 text-center text-[10px]">
          {remaining} analyse{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""} cette semaine
        </p>
      ) : null}

      {error ? (
        <Card className="border-brand-red/30 bg-brand-red/5 mt-3">
          <p className="text-brand-red flex items-start gap-2 text-sm">
            <Icon name="error" size={16} className="mt-0.5 shrink-0" />
            {error}
          </p>
        </Card>
      ) : null}

      {text ? (
        <Card className={cn("border-brand-blue mt-3 border-t-4")}>
          <div className="text-brand-blue mb-3 flex items-center gap-2">
            <Icon name="psychology" size={18} />
            <span className="text-xs font-bold tracking-widest uppercase">Institutional Narrative</span>
          </div>
          <div className="text-muted text-sm leading-relaxed whitespace-pre-wrap">{text}</div>
        </Card>
      ) : null}
    </>
  );
}
