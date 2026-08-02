"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Relative timestamp that keeps ticking.
 *
 * Client-side for two reasons: rendering it on the server would freeze "il y a
 * 2 min" at whatever it was when the page was built, and reading the clock
 * during a server render breaks React's purity contract.
 *
 * The absolute time is always available in the title attribute, because
 * "il y a 3 j" is not good enough when you are reconciling a trade.
 */
export function TimeAgo({ date }: { date: string | Date }) {
  // Memoised so the effect below does not resubscribe on every render: a new
  // Date object is a new identity even when the instant is identical.
  const timestamp = useMemo(
    () => (typeof date === "string" ? new Date(date) : date),
    [date],
  );
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    function render() {
      const seconds = Math.max(0, Math.round((Date.now() - timestamp.getTime()) / 1000));
      if (seconds < 60) return setLabel("à l'instant");
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return setLabel(`il y a ${minutes} min`);
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return setLabel(`il y a ${hours} h`);
      return setLabel(`il y a ${Math.floor(hours / 24)} j`);
    }

    render();
    const timer = setInterval(render, 30_000);
    return () => clearInterval(timer);
  }, [timestamp]);

  return (
    <time dateTime={timestamp.toISOString()} title={timestamp.toLocaleString("fr-FR")}>
      {label}
    </time>
  );
}
