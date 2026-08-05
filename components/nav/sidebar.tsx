"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOptimistic, useTransition } from "react";

import { setSidebarCollapsed, setTheme } from "@/app/(app)/preferences-actions";
import { Icon } from "@/components/ui/icon";
import { LiveRefresh } from "@/components/live-refresh";
import { NAV_ITEMS, isActiveRoute } from "@/components/nav/nav-items";
import { cn } from "@/lib/utils";

export function Sidebar({
  collapsed,
  theme,
  unreadAlerts,
}: {
  collapsed: boolean;
  theme: "dark" | "light";
  unreadAlerts: number;
}) {
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  // Both preferences are persisted server-side, which means a round trip. An
  // optimistic value keeps the toggle instant; if the action fails React reverts
  // it automatically.
  const [optimisticCollapsed, setOptimisticCollapsed] = useOptimistic(collapsed);
  const [optimisticTheme, setOptimisticTheme] = useOptimistic(theme);

  function toggleCollapsed() {
    startTransition(async () => {
      const next = !optimisticCollapsed;
      setOptimisticCollapsed(next);
      await setSidebarCollapsed(next);
    });
  }

  function toggleTheme() {
    startTransition(async () => {
      const next = optimisticTheme === "dark" ? "light" : "dark";
      setOptimisticTheme(next);
      await setTheme(next);
    });
  }

  // Below `md` the sidebar is always icon-only — there is not enough width for
  // labels regardless of the stored preference.
  const labelClass = optimisticCollapsed ? "hidden" : "hidden md:block";

  return (
    <div
      className={cn(
        "bg-surface border-border-app fixed top-0 left-0 z-50 flex h-dvh flex-col border-r transition-all duration-200",
        optimisticCollapsed ? "w-14" : "w-14 md:w-56",
      )}
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        title={optimisticCollapsed ? "Agrandir le menu" : "Réduire le menu"}
        aria-label={optimisticCollapsed ? "Agrandir le menu" : "Réduire le menu"}
        aria-expanded={!optimisticCollapsed}
        className="bg-surface border-border-app text-subtle hover:text-brand-blue hover:border-brand-blue/50 absolute top-16 -right-3 z-10 hidden h-6 w-6 items-center justify-center rounded-full border transition-all md:flex"
      >
        <Icon name={optimisticCollapsed ? "chevron_right" : "chevron_left"} size={14} />
      </button>

      <div className="border-border-app flex h-14 items-center gap-3 border-b px-4">
        <div className="bg-brand-blue flex h-6 w-6 shrink-0 items-center justify-center rounded-sm">
          <span className="font-mono text-xs font-bold text-white">F</span>
        </div>
        <div className={labelClass}>
          <p className="text-fg text-sm leading-none font-semibold tracking-tight">Fondanarex</p>
          <p className="text-subtle mt-0.5 font-mono text-[9px] tracking-widest uppercase">
            Macro Terminal
          </p>
        </div>
      </div>

      <nav aria-label="Navigation principale" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-4">
        {NAV_ITEMS.map((item) => {
          const active = isActiveRoute(item.href, pathname);
          const badge = item.href === "/alertes" ? unreadAlerts : 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={optimisticCollapsed ? item.label : undefined}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded border-l-2 px-3 py-2.5 text-left transition-all duration-100",
                active
                  ? "bg-brand-blue/10 text-brand-blue border-brand-blue"
                  : "text-muted hover:bg-panel hover:text-fg border-transparent",
              )}
            >
              <Icon name={item.icon} size={16} filled={active} className="shrink-0" />
              <span
                className={cn(
                  "flex-1 items-center justify-between text-xs font-medium tracking-wide",
                  optimisticCollapsed ? "hidden" : "hidden md:flex",
                )}
              >
                {item.label}
                {badge > 0 ? (
                  <span className="bg-brand-red flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              {/* Dot badge for the icon-only widths, where the count has nowhere to go. */}
              {badge > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "bg-brand-red absolute top-1 right-1 h-2 w-2 rounded-full",
                    optimisticCollapsed ? "" : "md:hidden",
                  )}
                />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-border-app space-y-0.5 border-t p-2">
        {/* Mounted once in the shell, so every screen re-reads its server data
         * on an interval without a manual reload. */}
        <div className={cn("flex justify-center py-1.5", optimisticCollapsed && "px-0")}>
          <LiveRefresh label={optimisticCollapsed ? "" : "En direct"} />
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          className="text-muted hover:text-fg hover:bg-panel flex w-full items-center justify-center gap-2 rounded p-2.5 text-xs transition-all"
        >
          <Icon name={optimisticTheme === "dark" ? "light_mode" : "dark_mode"} size={14} />
          <span className={cn(labelClass, "tracking-wide")}>
            {optimisticTheme === "dark" ? "Mode clair" : "Mode sombre"}
          </span>
        </button>

        {/* Legacy had a "Reset Data" button here that wiped every manual edit
         * behind a single window.confirm. It now lives on the Admin page, next
         * to the data it destroys.
         *
         * Sign-out lived here too, until authentication was temporarily
         * disabled — see lib/session.ts. */}
      </div>
    </div>
  );
}
