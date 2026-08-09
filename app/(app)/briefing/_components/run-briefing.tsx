"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  closeBriefing,
  failBriefing,
  openBriefing,
  runBriefingGroupAction,
} from "@/app/(app)/briefing/actions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Drives the briefing from the browser, one action per currency group.
 *
 * THE ORCHESTRATION IS HERE ON PURPOSE. A single server action cannot hold the
 * whole debate: a serverless function is capped at sixty seconds and the run
 * needs several minutes, so it was killed after writing its rounds but before
 * computing the consensus. Splitting it means each invocation carries one
 * group and finishes comfortably — and the four run CONCURRENTLY, so the wall
 * time is one group rather than four.
 *
 * `useTransition` is deliberately NOT used. A rejected promise inside a
 * transition leaves `pending` stuck true, which is how an earlier version of
 * this app hung on "l'assistant réfléchit" forever. Plain state, and every
 * await wrapped.
 */
export function RunBriefing({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  async function run() {
    setStatus(null);
    setDone([]);
    setRunning(true);

    let sessionId: string | null = null;

    try {
      const opened = await openBriefing();
      sessionId = opened.sessionId;
      setTotal(opened.groups.length);

      // allSettled, not all: one group losing a provider must not discard the
      // three that succeeded — the consensus is computed from whatever voted.
      const outcomes = await Promise.allSettled(
        opened.groups.map(async (group) => {
          const result = await runBriefingGroupAction({
            sessionId: opened.sessionId,
            groupIndex: group.index,
          });
          setDone((current) => [...current, group.label]);
          return result;
        }),
      );

      const lost = outcomes.filter((o) => o.status === "rejected").length;
      const shortened = outcomes.filter(
        (o) => o.status === "fulfilled" && !o.value.peerReviewed,
      ).length;

      const summary = await closeBriefing(sessionId);

      const parts = [`${summary.rounds} tours`, `${summary.costUsd.toFixed(4)} $`];
      if (summary.failures > 0) parts.push(`${summary.failures} appel(s) en erreur`);
      if (lost > 0) parts.push(`${lost} groupe(s) perdu(s)`);
      if (shortened > 0) parts.push(`${shortened} groupe(s) sans relecture croisée`);

      const clean = summary.failures === 0 && lost === 0;
      setStatus({
        ok: clean,
        message: `${clean ? "Briefing terminé" : "Terminé partiellement"} · ${parts.join(" · ")}`,
      });
      router.refresh();
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Erreur inconnue";

      // A session left "running" would look like a briefing still in flight
      // forever. Marked failed so the page tells the truth.
      if (sessionId) {
        await failBriefing({ sessionId, reason: reason.slice(0, 300) }).catch(() => {});
      }

      setStatus({ ok: false, message: `Le briefing a échoué : ${reason}` });
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void run()}
        disabled={running || !enabled}
        title={enabled ? undefined : "Aucune clé API de modèle configurée"}
        className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon
          name={running ? "progress_activity" : "smart_toy"}
          size={16}
          className={running ? "animate-spin" : undefined}
        />
        {running ? "Débat en cours…" : "Lancer un briefing"}
      </button>

      {running ? (
        <span className="text-subtle text-xs">
          {total > 0 ? `${done.length}/${total} groupes` : "Ouverture de la session"}
          {done.length > 0 ? ` · ${done.join(", ")}` : ""}
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
