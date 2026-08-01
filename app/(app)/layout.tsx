import { Sidebar } from "@/components/nav/sidebar";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { requireUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Shell for every authenticated screen.
 *
 * `requireUserId` redirects to /signin when there is no session. proxy.ts
 * already gates these paths; doing it again here means a routing mistake in the
 * matcher cannot silently expose a page, and it gives the children a userId that
 * is known to exist.
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
