import { Sidebar } from "@/components/nav/sidebar";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { requireUserId } from "@/lib/session";
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
 * `requireUserId` resolves the workspace user. Authentication is currently
 * disabled (see lib/session.ts) so this always succeeds unless the database is
 * unreachable — but the signature is unchanged, so restoring auth needs no edit
 * here.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await requireUserId();
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
        {children}
      </main>
    </div>
  );
}
