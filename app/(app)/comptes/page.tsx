import type { Metadata } from "next";

import { AccountCard } from "@/app/(app)/comptes/_components/account-card";
import { AddAccountButton } from "@/app/(app)/comptes/_components/add-account";
import { ComparisonTable } from "@/app/(app)/comptes/_components/comparison-table";
import { EntryChecker } from "@/app/(app)/comptes/_components/entry-checker";
import { EquityProjection } from "@/app/(app)/comptes/_components/equity-projection";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  drawdownRemaining,
  riskPerTrade,
  setupsPerWeek,
  weightedRR,
  weightedWinRate,
} from "@/domain/accounts/metrics";
import { getTradingAccounts } from "@/lib/accounts";
import { metaApiConfigured } from "@/lib/integrations/metaapi";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Comptes" };

const money = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });

export default async function AccountsPage() {
  const userId = await requireUserId();
  const [accounts, metaApiLinks] = await Promise.all([
    getTradingAccounts(userId),
    prisma.metaApiAccount.findMany({ where: { userId } }),
  ]);
  const active = accounts.filter((a) => a.isActive);

  // Une connexion par compte de trading. Un lien orphelin — dont le compte a
  // été supprimé — n'apparaît nulle part plutôt que sur le mauvais compte.
  const linkByAccount = new Map(
    metaApiLinks
      .filter((link) => link.tradingAccountId)
      .map((link) => [
        link.tradingAccountId!,
        {
          id: link.id,
          metaApiAccountId: link.metaApiAccountId,
          region: link.region,
          connectionStatus: link.connectionStatus,
          lastSyncAt: link.lastSyncAt?.toISOString() ?? null,
          lastSyncStatus: link.lastSyncStatus,
          lastSyncError: link.lastSyncError,
          lastSyncTradeCount: link.lastSyncTradeCount,
        },
      ]),
  );
  const metaApiEnabled = metaApiConfigured();

  const totalCapital = active.reduce((sum, a) => sum + a.currentCapital, 0);
  const totalInitial = active.reduce((sum, a) => sum + a.initialCapital, 0);
  const totalRisk = active.reduce((sum, a) => sum + riskPerTrade(a), 0);
  const totalHeadroom = active.reduce((sum, a) => sum + Math.max(0, drawdownRemaining(a)), 0);
  const totalPnl = totalCapital - totalInitial;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Comptes de trading"
        subtitle={`${active.length} compte(s) actif(s) sur ${accounts.length}`}
      >
        <AddAccountButton />
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">
            Capital total
          </p>
          <p className="text-fg tabular mt-1 font-mono text-xl font-bold">
            {money(totalCapital)} $
          </p>
          <p
            className={cn(
              "tabular font-mono text-[10px]",
              totalPnl > 0 ? "text-brand-green" : totalPnl < 0 ? "text-brand-red" : "text-subtle",
            )}
          >
            {totalPnl >= 0 ? "+" : ""}
            {money(totalPnl)} $
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">
            Risque cumulé
          </p>
          <p className="text-fg tabular mt-1 font-mono text-xl font-bold">{money(totalRisk)} $</p>
          <p className="text-subtle text-[10px]">si tous les comptes tradent</p>
        </Card>

        <Card className="p-4">
          <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">
            Marge de perte
          </p>
          <p className="text-fg tabular mt-1 font-mono text-xl font-bold">
            {money(totalHeadroom)} $
          </p>
          <p className="text-subtle text-[10px]">avant dépassement</p>
        </Card>

        <Card className="p-4">
          <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">
            Comptes en alerte
          </p>
          <p className="text-fg tabular mt-1 font-mono text-xl font-bold">
            {active.filter((a) => drawdownRemaining(a) <= 0).length}
          </p>
          <p className="text-subtle text-[10px]">drawdown dépassé</p>
        </Card>
      </div>

      <Card className="border-brand-blue/30 bg-brand-blue/5">
        <div className="flex items-start gap-2.5">
          <Icon name="info" size={16} className="text-brand-blue mt-0.5 shrink-0" />
          <p className="text-muted text-sm leading-relaxed">
            L&apos;espérance et le taux de réussite sont pondérés par la fréquence
            d&apos;apparition de chaque entrée autorisée. Les entrées sans historique mesuré sont
            exclues du calcul plutôt que comptées comme nulles — un tiret signifie
            &laquo; pas assez de données &raquo;, pas &laquo; zéro &raquo;.
          </p>
        </div>
      </Card>

      <div className="space-y-4">
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            metaApiLink={linkByAccount.get(account.id) ?? null}
            metaApiEnabled={metaApiEnabled}
          />
        ))}
      </div>

      {active.length > 0 ? (
        <>
          <EntryChecker
            accounts={active.map((account) => ({
              id: account.id,
              name: account.name,
              color: account.color,
              style: account.style,
              allowedEntries: [...account.allowedEntries],
            }))}
          />

          <EquityProjection
            accounts={active.map((account) => ({
              id: account.id,
              name: account.name,
              color: account.color,
              initialCapital: account.initialCapital,
              currentCapital: account.currentCapital,
              riskPct: account.riskPct,
              maxDDPct: account.maxDDPct,
              targetPct: account.targetPct,
              setupsPerWeek: setupsPerWeek(account),
              winRatePct: weightedWinRate(account),
              rr: weightedRR(account),
            }))}
          />

          <ComparisonTable
            accounts={active.map((account) => ({
              ...account,
              id: account.id,
              name: account.name,
              color: account.color,
            }))}
          />
        </>
      ) : null}

      {accounts.length === 0 ? (
        <Card>
          <p className="text-muted text-sm">
            Aucun compte. Ajoutez-en un pour commencer à suivre votre capital et vos limites.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
