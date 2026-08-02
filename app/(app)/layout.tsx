import { LiveRefresh } from "@/components/live-refresh";
import { SetupRequired } from "@/components/setup-required";
import { Sidebar } from "@/components/nav/sidebar";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { currentUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Every screen under this layout renders per request, never at build time.
 *
 * This is not a performance knob — it is required for the build to work at all.
 * Every page here reads live, user-scoped data from Postgres. While the app used
 * Auth.js, reading the session cookie made each route implicitly dynamic; with
 * authentication temporarily disabled nothing touches cookies any more, so Next
 * would happily try to PRERENDER these pages during `next build` and bake the
 * result into the deployment. That both requires a reachable database at build
 * time and serves stale data afterwards.
 */
export const dynamic = "force-dynamic";

/**
 * Shell for every screen.
 *
 * The database is resolved here rather than asserted. If it is unreachable —
 * overwhelmingly because DATABASE_URL has not been set on the deployment yet —
 * this renders instructions instead of throwing.
 *
 * That distinction matters: an exception in a LAYOUT is not caught by an
 * `error.tsx` in the same segment, so it escapes to the platform and Netlify
 * serves an opaque "A server error occurred" page with no indication of the
 * cause. Handling it here keeps a misconfigured deploy self-explanatory.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await currentUserId();
  if (!userId) return <SetupRequired />;

  const [settings, unreadAlerts] = await Promise.all([
    getSettings(),
    prisma.alert.count({ where: { userId, read: false, dismissed: false } }),
  ]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        collapsed={settings.sidebarCollapsed}
        theme={settings.theme}
        unreadAlerts={unreadAlerts}
      />
      <main
        className={cn(
          "relative min-w-0 flex-1 overflow-x-hidden transition-all duration-200",
          settings.sidebarCollapsed ? "ml-14" : "ml-14 md:ml-56",
        )}
      >
        {/* Every screen re-reads the database on an interval, so a figure that
         * changes upstream appears without a manual reload. `router.refresh()`
         * preserves client state, scroll and focus, so nothing jumps under the
         * cursor and the TradingView widget is not torn down. */}
        <div className="pointer-events-none fixed top-4 right-32 z-30 hidden sm:block">
          <LiveRefresh intervalMs={45_000} />
        </div>

        {children}
      </main>
    </div>
  );
}
