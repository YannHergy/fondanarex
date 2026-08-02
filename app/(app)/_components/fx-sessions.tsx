"use client";

import { useEffect, useState } from "react";

import { LocalTime } from "@/app/(app)/_components/local-time";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getSessionStatuses, type SessionStatus } from "@/domain/market/sessions";
import { cn } from "@/lib/utils";

function formatCountdown(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest > 0 ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
  return `${Math.floor(hours / 24)} j ${hours % 24} h`;
}

/**
 * Live FX session clock.
 *
 * Computed locally — no API, no key, cannot fail. The initial value is rendered
 * on the server and passed in, so the first paint matches the server markup
 * exactly and there is no hydration mismatch; the timer then takes over and
 * keeps the countdowns honest between page refreshes.
 */
export function FxSessions({ initial }: { initial: SessionStatus[] }) {
  const [sessions, setSessions] = useState(initial);

  useEffect(() => {
    const tick = () => setSessions(getSessionStatuses(new Date()));
    // Recompute promptly on mount in case the page was served from cache.
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);

  const openCount = sessions.filter((s) => s.isOpen).length;

  return (
    <Card>
      <div className="text-muted mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="schedule" size={16} />
          <h2 className="text-xs font-bold tracking-widest uppercase">Sessions FX en direct</h2>
        </div>
        <LocalTime />
      </div>

      <div className="grid grid-cols-4 gap-2">
        {sessions.map((session) => (
          <div
            key={session.name}
            className={cn(
              "rounded-lg border py-2 text-center",
              session.isOpen
                ? "bg-brand-green/10 border-brand-green/30"
                : "bg-panel border-border-app",
            )}
            title={`${session.name} — heure locale ${session.localTime}`}
          >
            <p className="text-fg text-[10px] font-bold">{session.name}</p>
            <p
              className={cn(
                "font-mono text-[9px]",
                session.isOpen ? "text-brand-green" : "text-subtle",
              )}
            >
              {session.isOpen ? "Ouverte" : "Fermée"}
            </p>
            <p className="text-subtle font-mono text-[9px]">{session.localTime}</p>
            {session.isOpen && session.closesInMin != null ? (
              <p className="text-subtle text-[8px]">ferme dans {formatCountdown(session.closesInMin)}</p>
            ) : null}
            {!session.isOpen && session.opensInMin != null ? (
              <p className="text-subtle text-[8px]">ouvre dans {formatCountdown(session.opensInMin)}</p>
            ) : null}
          </div>
        ))}
      </div>

      <p className="text-subtle mt-2 text-[10px]">
        {openCount === 0
          ? "Marché fermé — aucune session active."
          : openCount > 1
            ? `${openCount} sessions se chevauchent : liquidité maximale.`
            : "Une session active."}
      </p>
    </Card>
  );
}
