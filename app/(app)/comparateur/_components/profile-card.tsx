import { Card } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import type { CurrencyWithScore } from "@/domain/types";
import { scoreTextClass, scoreVerdict } from "@/lib/score-display";
import { CURRENCY_COLOR_VAR, cn } from "@/lib/utils";

/**
 * Full macro profile for one side of the pair.
 *
 * Every headline reading in one place, so the comparison above can be checked
 * against the raw numbers without leaving the screen.
 */
export function CurrencyProfileCard({ currency }: { currency: CurrencyWithScore }) {
  const color = CURRENCY_COLOR_VAR[currency.code as never] ?? "var(--color-brand-steel)";

  const fields = [
    { label: "PIB QoQ", value: `${currency.gdpQoQ} %` },
    { label: "CPI", value: `${currency.cpi} %` },
    { label: "Core CPI", value: `${currency.coreCpi} %` },
    { label: "PMI manuf.", value: `${currency.pmiManufacturing}` },
    { label: "PMI services", value: `${currency.pmiServices}` },
    { label: "Chômage", value: `${currency.unemployment} %` },
    { label: "Taux directeur", value: `${currency.interestRate} %` },
    { label: "Taux réel", value: `${currency.scores.realRate} %` },
    { label: "Salaires", value: `${currency.wagePPI} %` },
    { label: "Balance comm.", value: `${currency.tradeBalance}` },
  ];

  return (
    <Card className="overflow-hidden p-0">
      <div className="h-1.5 w-full" style={{ backgroundColor: color }} />

      <div className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CurrencyBadge code={currency.code} size="lg" />
            <div>
              <p className="text-fg text-sm font-bold">{currency.name}</p>
              <p className="text-subtle text-[10px] tracking-widest uppercase">
                {currency.category}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={cn("font-mono text-xl font-black", scoreTextClass(currency.scores.total))}>
              {currency.scores.total}
              <span className="text-subtle text-xs font-normal">/100</span>
            </p>
            <p
              className={cn(
                "text-[10px] font-bold tracking-wide uppercase",
                scoreTextClass(currency.scores.total),
              )}
            >
              {scoreVerdict(currency.scores.total)}
            </p>
          </div>
        </div>

        <div className="bg-panel mb-3 h-1.5 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, currency.scores.total))}%`,
              backgroundColor: color,
            }}
          />
        </div>

        <dl className="grid grid-cols-5 gap-2">
          {fields.map((field) => (
            <div key={field.label} className="text-center">
              <dt className="text-subtle mb-0.5 truncate text-[8px] tracking-wide uppercase">
                {field.label}
              </dt>
              <dd className="text-fg font-mono text-[11px] font-bold">{field.value}</dd>
            </div>
          ))}
        </dl>

        <div className="border-border-app text-subtle mt-3 flex items-center justify-between border-t pt-2 font-mono text-[10px]">
          <span>Orientation : {currency.stance}</span>
          <span>Score brut : {currency.scores.rawTotal}</span>
        </div>
      </div>
    </Card>
  );
}
