import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  AnnouncementsPanel,
  CalendarPanel,
  CarryMatrix,
  PanelSkeleton,
  PressReleasesPanel,
  RiskPanel,
  SessionsPanel,
} from "@/app/(app)/_components/overview-panels";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { getScoredCurrencyList } from "@/lib/currencies";
import { scoreBgClass, scoreTextClass, scoreVerdict } from "@/lib/score-display";
import { requireUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Vue d'ensemble" };

/**
 * Market overview.
 *
 * Only the currency ranking is awaited here — it comes from our own database
 * and is the reason to open this screen. Every FXMacroData panel is streamed
 * behind its own Suspense boundary, so a slow or unreachable upstream delays
 * one card instead of the page. The legacy version awaited all of them up front
 * and rendered nothing until the slowest resolved.
 */
export default async function OverviewPage() {
  const userId = await requireUserId();
  const currencies = await getScoredCurrencyList(userId);
  const ranked = [...currencies].sort((a, b) => b.scores.total - a.scores.total);

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-4 p-5 md:p-6">
      <PageHeader
        title="Vue d'ensemble du marché"
        subtitle="Classement propriétaire · données transversales FXMacroData"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Suspense
          fallback={
            <Card>
              <CardTitle icon="monitoring">Sentiment de marché</CardTitle>
              <PanelSkeleton lines={2} />
            </Card>
          }
        >
          <RiskPanel />
        </Suspense>

        <Suspense
          fallback={
            <Card>
              <CardTitle icon="schedule">Sessions FX en direct</CardTitle>
              <PanelSkeleton lines={2} />
            </Card>
          }
        >
          <SessionsPanel />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle>Classement de force des devises</CardTitle>
            <div className="space-y-1">
              {ranked.map((c, index) => (
                <Link
                  key={c.code}
                  href={`/devise/${c.code}`}
                  className="hover:bg-panel flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors"
                >
                  <span className="text-subtle w-5 font-mono text-xs">{index + 1}</span>
                  <CurrencyBadge code={c.code} />
                  <div className="bg-panel h-2 flex-1 overflow-hidden rounded-full">
                    <div
                      className={cn("h-full rounded-full", scoreBgClass(c.scores.total))}
                      style={{ width: `${c.scores.total}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "tabular w-10 text-right font-mono text-sm font-bold",
                      scoreTextClass(c.scores.total),
                    )}
                  >
                    {c.scores.total}
                  </span>
                  <span
                    className={cn(
                      "w-24 text-right text-xs font-semibold",
                      scoreTextClass(c.scores.total),
                    )}
                  >
                    {scoreVerdict(c.scores.total)}
                  </span>
                </Link>
              ))}
            </div>
          </Card>

          <Suspense
            fallback={
              <Card>
                <CardTitle icon="swap_horiz">Matrice carry — différentiels de taux</CardTitle>
                <PanelSkeleton lines={8} />
              </Card>
            }
          >
            <CarryMatrix currencies={currencies} />
          </Suspense>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Suspense
              fallback={
                <Card>
                  <CardTitle icon="calendar_month">Prochaines publications</CardTitle>
                  <PanelSkeleton />
                </Card>
              }
            >
              <CalendarPanel />
            </Suspense>

            <Suspense
              fallback={
                <Card>
                  <CardTitle>Dernières publications</CardTitle>
                  <PanelSkeleton />
                </Card>
              }
            >
              <AnnouncementsPanel />
            </Suspense>
          </div>
        </div>

        <Suspense
          fallback={
            <Card>
              <CardTitle icon="account_balance">Communiqués des banques centrales</CardTitle>
              <PanelSkeleton lines={6} />
            </Card>
          }
        >
          <PressReleasesPanel />
        </Suspense>
      </div>
    </div>
  );
}
