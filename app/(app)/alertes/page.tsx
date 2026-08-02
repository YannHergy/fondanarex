import type { Metadata } from "next";
import Link from "next/link";

import {
  AlertRowActions,
  BulkActions,
  PreferenceRow,
} from "@/app/(app)/alertes/_components/alert-controls";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { TimeAgo } from "@/components/ui/time-ago";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { AlertPriority } from "@/lib/generated/prisma/enums";

export const metadata: Metadata = { title: "Alertes" };

const PRIORITY_STYLE: Record<AlertPriority, { label: string; className: string; icon: string }> = {
  CRITICAL: {
    label: "Critique",
    className: "text-brand-red border-brand-red/40 bg-brand-red/10",
    icon: "priority_high",
  },
  HIGH: {
    label: "Haute",
    className: "text-brand-amber border-brand-amber/40 bg-brand-amber/10",
    icon: "warning",
  },
  NORMAL: {
    label: "Normale",
    className: "text-brand-blue border-brand-blue/40 bg-brand-blue/10",
    icon: "info",
  },
  LOW: {
    label: "Basse",
    className: "text-muted border-border-app bg-panel",
    icon: "notifications",
  },
};

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
  const userId = await requireUserId();
  const { vue } = await searchParams;
  const showArchived = vue === "archivees";

  const [alerts, preferences, counts] = await Promise.all([
    prisma.alert.findMany({
      where: { userId, dismissed: showArchived },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.alertPreference.findMany({ where: { userId }, orderBy: { currencyCode: "asc" } }),
    Promise.all([
      prisma.alert.count({ where: { userId, read: false, dismissed: false } }),
      prisma.alert.count({ where: { userId, dismissed: true } }),
    ]),
  ]);

  const [unread, dismissed] = counts;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Alertes"
        subtitle="Mouvements de score détectés à chaque synchronisation"
      >
        <BulkActions unread={unread ?? 0} dismissed={dismissed ?? 0} />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/alertes"
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
            !showArchived
              ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
              : "border-border-app text-muted hover:text-fg",
          )}
        >
          Actives{unread ? ` (${unread} non lues)` : ""}
        </Link>
        <Link
          href="/alertes?vue=archivees"
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
            showArchived
              ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
              : "border-border-app text-muted hover:text-fg",
          )}
        >
          Archivées ({dismissed})
        </Link>
      </div>

      <Card>
        <CardTitle icon="notifications">
          {showArchived ? "Alertes archivées" : "Alertes actives"}
        </CardTitle>

        {alerts.length === 0 ? (
          <div className="py-8 text-center">
            <Icon name="notifications_off" size={28} className="text-subtle" />
            <p className="text-muted mt-2 text-sm">
              {showArchived ? "Aucune alerte archivée." : "Aucune alerte."}
            </p>
            {!showArchived ? (
              <p className="text-subtle mx-auto mt-1 max-w-md text-xs leading-relaxed">
                Les alertes sont générées automatiquement lorsqu&apos;une synchronisation fait
                bouger un score d&apos;au moins 5 points, ou lorsqu&apos;un mouvement plus petit
                change le verdict d&apos;une devise.
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert) => {
              const style = PRIORITY_STYLE[alert.priority];
              return (
                <li
                  key={alert.id}
                  className={cn(
                    "border-border-app flex items-start gap-3 rounded-lg border p-3 transition-colors",
                    !alert.read && "bg-brand-blue/5 border-brand-blue/20",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                      style.className,
                    )}
                  >
                    <Icon name={style.icon} size={15} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {alert.currencyCode ? (
                        <CurrencyBadge code={alert.currencyCode} size="sm" />
                      ) : null}
                      <p className="text-fg text-sm font-semibold">{alert.title}</p>
                      {!alert.read ? (
                        <span className="bg-brand-blue h-1.5 w-1.5 rounded-full" aria-label="Non lue" />
                      ) : null}
                    </div>
                    <p className="text-muted mt-0.5 text-xs leading-relaxed">{alert.message}</p>
                    <p className="text-subtle mt-1 font-mono text-[10px]">
                      {style.label} · <TimeAgo date={alert.createdAt} />
                    </p>
                  </div>

                  <AlertRowActions id={alert.id} read={alert.read} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon="tune">Préférences par devise</CardTitle>
        <p className="text-subtle mb-3 text-[11px] leading-relaxed">
          Le filtrage est appliqué à la génération : une alerte filtrée n&apos;est jamais
          enregistrée, donc le compteur ne peut pas inclure des alertes que vous ne verrez jamais.
        </p>
        <div>
          {preferences.map((preference) => (
            <PreferenceRow
              key={preference.currencyCode}
              currencyCode={preference.currencyCode}
              enabled={preference.enabled}
              minPriority={preference.minPriority}
            />
          ))}
          {preferences.length === 0 ? (
            <p className="text-subtle text-sm">Aucune préférence enregistrée.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
