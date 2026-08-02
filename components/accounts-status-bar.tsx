import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { accountHealth, drawdownUsedPct, riskPerTrade } from "@/domain/accounts/metrics";
import { getTradingAccounts } from "@/lib/accounts";
import { cn } from "@/lib/utils";

const HEALTH_DOT = {
  healthy: "bg-brand-green",
  warning: "bg-brand-amber",
  critical: "bg-brand-red",
  breached: "bg-brand-red animate-pulse",
} as const;

/**
 * Compact account status strip.
 *
 * Shown on the dashboard so drawdown state is visible while analysing, not
 * only when the accounts screen is open — a breached account should be
 * impossible to miss on the screen you look at first.
 */
export async function AccountsStatusBar({ userId }: { userId: string }) {
  const accounts = (await getTradingAccounts(userId)).filter((a) => a.isActive);
  if (accounts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {accounts.map((account) => {
        const health = accountHealth(account);
        const used = drawdownUsedPct(account);

        return (
          <Link
            key={account.id}
            href="/comptes"
            className="border-border-app bg-surface hover:border-border-strong flex min-w-[190px] flex-1 items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors"
          >
            <span
              className="h-6 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: account.color }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-fg truncate text-xs font-semibold">{account.name}</p>
              <p className="text-subtle tabular font-mono text-[10px]">
                {account.currentCapital.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} $ ·{" "}
                {riskPerTrade(account).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} $/trade
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-subtle tabular font-mono text-[10px]">
                {used.toFixed(0)} %
              </span>
              <span className={cn("h-2 w-2 rounded-full", HEALTH_DOT[health])} />
            </div>
            {health === "breached" ? (
              <Icon name="warning" size={14} className="text-brand-red shrink-0" />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
