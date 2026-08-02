"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Keeps every screen current without a manual reload.
 *
 * `router.refresh()` re-runs the server components and swaps in the new markup
 * while preserving client state, scroll position and focus — so a value can
 * change under you mid-scroll without the page jumping.
 *
 * What this does and does not do:
 *
 *   - It re-READS the database. It does not call upstream APIs. Ingestion is a
 *     separate scheduled job (/api/cron/refresh-macro); if polling triggered
 *     fetches, every open tab would burn the OECD and FRED rate limits.
 *   - It therefore surfaces new data within one interval of the job writing it.
 *
 * Polling pauses while the tab is hidden and fires immediately on return, so a
 * backgrounded tab costs nothing and a foregrounded one is never stale.
 */
export function LiveRefresh({
  intervalMs = 45_000,
  label = "En direct",
}: {
  intervalMs?: number;
  label?: string;
}) {
  const router = useRouter();
  const [lastUpdate, setLastUpdate] = useState<number>(() => Date.now());
  const [ago, setAgo] = useState(0);
  // Held in a ref so the polling effect does not re-subscribe on every tick.
  const lastUpdateRef = useRef(lastUpdate);

  useEffect(() => {
    lastUpdateRef.current = lastUpdate;
  }, [lastUpdate]);

  useEffect(() => {
    function refresh() {
      router.refresh();
      setLastUpdate(Date.now());
    }

    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, intervalMs);

    function onVisibilityChange() {
      // Returning to a tab that has been hidden for a while: refresh at once
      // rather than showing stale values until the next interval elapses.
      if (!document.hidden && Date.now() - lastUpdateRef.current > intervalMs) {
        refresh();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, intervalMs]);

  // Separate, cheaper tick purely for the "x s ago" readout — it must not
  // trigger a server round trip.
  useEffect(() => {
    const timer = setInterval(() => setAgo(Math.round((Date.now() - lastUpdate) / 1000)), 1_000);
    return () => clearInterval(timer);
  }, [lastUpdate]);

  const stale = ago > intervalMs / 1000 + 15;

  return (
    <div
      className="text-subtle flex items-center gap-1.5 font-mono text-[10px] tracking-wide uppercase"
      title={`Actualisation automatique toutes les ${Math.round(intervalMs / 1000)} s`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {!stale ? (
          <span className="bg-brand-cyan absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
        ) : null}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            stale ? "bg-brand-amber" : "bg-brand-cyan",
          )}
        />
      </span>
      <span>{label}</span>
      <span className="opacity-60">· {ago < 60 ? `${ago}s` : `${Math.floor(ago / 60)}min`}</span>
    </div>
  );
}

/** Live refresh with no visible indicator, for screens with their own header. */
export function LiveRefreshSilent({ intervalMs = 45_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);

  return null;
}
