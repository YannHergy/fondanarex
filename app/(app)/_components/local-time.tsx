"use client";

import { useEffect, useState } from "react";

/**
 * The viewer's local time, next to the FX session panel.
 *
 * Client-only and mounted empty on purpose: rendering a server timestamp here
 * would show the server's clock and then hydrate to a different value.
 */
export function LocalTime() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const render = () =>
      setTime(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    render();
    const id = setInterval(render, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!time) return null;
  return <span className="text-subtle font-mono text-[10px]">{time} (heure locale)</span>;
}
