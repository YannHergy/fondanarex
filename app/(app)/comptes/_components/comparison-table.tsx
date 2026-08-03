import { Card, CardTitle } from "@/components/ui/card";
import {
  expectancyPct,
  riskPerTrade,
  setupsPerWeek,
  weightedRR,
  weightedWinRate,
  type AccountConfig,
} from "@/domain/accounts/metrics";
import { cn } from "@/lib/utils";

export interface ComparisonAccount extends AccountConfig {
  id: string;
  name: string;
  color: string;
}

/**
 * The four accounts side by side on the metrics that actually differ.
 *
 * Read down a column and you see one account's profile; read across a row and
 * you see the trade-off. That second reading is the point — a tighter
 * drawdown limit buys a larger position size, and the table is where that
 * exchange becomes visible.
 */
export function ComparisonTable({ accounts }: { accounts: ComparisonAccount[] }) {
  if (accounts.length === 0) return null;

  const rows = accounts.map((account) => {
    const setups = setupsPerWeek(account);
    const winRate = weightedWinRate(account);
    const rr = weightedRR(account);
    const expectancy = expectancyPct(account);
    const risk = riskPerTrade(account);

    const targetAmount =
      account.targetPct === null ? null : account.initialCapital * (account.targetPct / 100);

    // Trades needed only means something with a POSITIVE expectancy: with a
    // negative edge the target is never reached, and printing a large number
    // would imply it eventually is.
    const tradesNeeded =
      expectancy !== null && expectancy > 0 && targetAmount !== null
        ? Math.ceil(targetAmount / ((expectancy / 100) * account.currentCapital))
        : null;

    const weeksNeeded =
      tradesNeeded !== null && setups > 0 ? Math.ceil(tradesNeeded / setups) : null;

    return { account, setups, winRate, rr, expectancy, risk, tradesNeeded, weeksNeeded };
  });

  const metrics = [
    {
      label: "Capital actuel",
      value: (row: (typeof rows)[number]) => `${row.account.currentCapital.toFixed(0)} $`,
      tone: () => "text-fg",
    },
    {
      label: "Risque par trade",
      value: (row: (typeof rows)[number]) => `${row.risk.toFixed(2)} $`,
      tone: () => "text-muted",
    },
    {
      label: "Setups / semaine",
      value: (row: (typeof rows)[number]) => `~${row.setups.toFixed(1)}`,
      tone: () => "text-brand-blue",
    },
    {
      label: "Taux de réussite pondéré",
      value: (row: (typeof rows)[number]) =>
        row.winRate === null ? "—" : `${row.winRate.toFixed(1)} %`,
      tone: (row: (typeof rows)[number]) =>
        row.winRate === null
          ? "text-subtle"
          : row.winRate >= 35
            ? "text-brand-green"
            : row.winRate >= 25
              ? "text-brand-amber"
              : "text-brand-red",
    },
    {
      label: "R:R pondéré",
      value: (row: (typeof rows)[number]) => (row.rr === null ? "—" : row.rr.toFixed(2)),
      tone: () => "text-muted",
    },
    {
      label: "Espérance / trade",
      value: (row: (typeof rows)[number]) =>
        row.expectancy === null
          ? "—"
          : `${row.expectancy > 0 ? "+" : ""}${row.expectancy.toFixed(3)} %`,
      tone: (row: (typeof rows)[number]) =>
        row.expectancy === null
          ? "text-subtle"
          : row.expectancy > 0
            ? "text-brand-green"
            : "text-brand-red",
    },
    {
      label: "Trades jusqu'à la cible",
      value: (row: (typeof rows)[number]) =>
        row.tradesNeeded === null ? "—" : String(row.tradesNeeded),
      tone: () => "text-muted",
    },
    {
      label: "Semaines estimées",
      value: (row: (typeof rows)[number]) =>
        row.weeksNeeded === null ? "—" : `${row.weeksNeeded} sem.`,
      tone: () => "text-muted",
    },
    {
      label: "Drawdown maximum",
      value: (row: (typeof rows)[number]) => `${row.account.maxDDPct} %`,
      tone: () => "text-brand-red/80",
    },
  ];

  return (
    <Card className="overflow-x-auto">
      <CardTitle icon="table_rows">Comparaison des comptes</CardTitle>

      <table className="w-full min-w-[34rem] text-xs">
        <caption className="sr-only">
          Métriques comparées entre les comptes de trading
        </caption>
        <thead>
          <tr className="border-border-app border-b">
            <th scope="col" className="text-subtle py-2 text-left font-medium">
              Métrique
            </th>
            {rows.map((row) => (
              <th
                key={row.account.id}
                scope="col"
                className="py-2 text-center font-bold"
                style={{ color: row.account.color }}
              >
                {row.account.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={metric.label} className="border-border-app border-b">
              <th scope="row" className="text-subtle py-2 text-left font-normal">
                {metric.label}
              </th>
              {rows.map((row) => (
                <td
                  key={row.account.id}
                  className={cn("py-2 text-center font-mono font-semibold", metric.tone(row))}
                >
                  {metric.value(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-subtle mt-2 text-[11px] leading-relaxed">
        Le taux de réussite et le R:R sont pondérés par la fréquence d&apos;apparition de chaque
        type d&apos;entrée autorisé, pas par une moyenne simple : une entrée rare ne pèse pas
        autant qu&apos;une entrée quotidienne. Un tiret signifie qu&apos;aucun historique mesuré
        ne permet le calcul — ce n&apos;est pas zéro.
      </p>
    </Card>
  );
}
