import type { Metadata } from "next";

import { CurrencyEditor, type EditableField } from "@/app/(app)/admin/_components/currency-editor";
import { DangerZone } from "@/app/(app)/admin/_components/danger-zone";
import { MarketContextEditor } from "@/app/(app)/admin/_components/market-context-editor";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { MARKET_FIELDS } from "@/domain/market-context";
import { releaseCeilingIso, todayIso } from "@/domain/market-context/observation-date";
import { getApiValues, getMarketContext, getScoredCurrencies } from "@/lib/currencies";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Admin données" };

/** Fields exposed for manual correction, with their input step and unit. */
const FIELD_SPECS = [
  { key: "interestRate", label: "Taux directeur", unit: "%", step: "0.01" },
  { key: "gdpQoQ", label: "PIB QoQ", unit: "%", step: "0.1" },
  { key: "pmiManufacturing", label: "PMI manufacturier", unit: "", step: "0.1" },
  { key: "pmiServices", label: "PMI services", unit: "", step: "0.1" },
  { key: "cpi", label: "CPI", unit: "%", step: "0.1" },
  { key: "coreCpi", label: "CPI sous-jacent", unit: "%", step: "0.1" },
  { key: "ppi", label: "PPI", unit: "%", step: "0.1" },
  { key: "unemployment", label: "Chômage", unit: "%", step: "0.1" },
  { key: "retailSales", label: "Ventes au détail", unit: "%", step: "0.1" },
  { key: "wagePPI", label: "Salaires", unit: "%", step: "0.01" },
  { key: "tradeBalance", label: "Balance commerciale", unit: "Mds", step: "0.1" },
  { key: "currentAccount", label: "Compte courant", unit: "Mds", step: "0.1" },
  { key: "consumerConfidence", label: "Confiance ménages", unit: "", step: "0.1" },
  { key: "nfp", label: "NFP", unit: "k", step: "1" },
  { key: "corePce", label: "Core PCE", unit: "%", step: "0.1" },
  { key: "zew", label: "ZEW", unit: "", step: "0.1" },
  { key: "ifo", label: "ifo", unit: "", step: "0.1" },
] as const;

/** Indicators that only exist for certain currencies. */
const CURRENCY_SPECIFIC: Record<string, readonly string[]> = {
  nfp: ["USD"],
  corePce: ["USD"],
  zew: ["EUR"],
  ifo: ["EUR"],
};

export default async function AdminPage() {
  const userId = await requireUserId();

  const [currencies, marketContext, apiValues, overrides, counts] = await Promise.all([
    getScoredCurrencies(userId),
    getMarketContext(userId),
    getApiValues(),
    prisma.indicatorOverride.findMany({ where: { userId } }),
    Promise.all([
      prisma.indicatorOverride.count({ where: { userId } }),
      prisma.currencyNote.count({ where: { userId } }),
      prisma.marketContextValue.count({ where: { userId } }),
    ]),
  ]);

  // Resolved once on the SERVER and shared by every date input on the page, so
  // the ceiling offered matches the clock the action validates against — a
  // device with a skewed clock would otherwise offer a date the server refuses.
  const now = new Date();
  const today = todayIso(now);
  const releaseCeiling = releaseCeilingIso(now);

  const overrideSet = new Set(overrides.map((o) => `${o.currencyCode}:${o.indicatorKey}`));
  // Only the overrides that actually carry a date. A row with a null period
  // is still using its source's, and the editor must not claim otherwise.
  const datedOverrides = new Set(
    overrides.filter((o) => o.periodEnd).map((o) => `${o.currencyCode}:${o.indicatorKey}`),
  );
  const releaseOverrides = new Set(
    overrides.filter((o) => o.nextRelease).map((o) => `${o.currencyCode}:${o.indicatorKey}`),
  );

  const editors = Object.values(currencies).map((currency) => {
    const record = currency as unknown as Record<string, unknown>;

    const fields: EditableField[] = FIELD_SPECS.filter((spec) => {
      const restricted = CURRENCY_SPECIFIC[spec.key];
      return !restricted || restricted.includes(currency.code);
    }).map((spec) => {
      const value = record[spec.key];
      return {
        key: spec.key,
        label: spec.label,
        unit: spec.unit,
        step: spec.step,
        value: typeof value === "number" ? value : null,
        overridden: overrideSet.has(`${currency.code}:${spec.key}`),
        sourceValue: apiValues[currency.code]?.[spec.key] ?? null,
        period: currency.periods?.[spec.key] ?? null,
        periodOverridden: datedOverrides.has(`${currency.code}:${spec.key}`),
        // The date input needs AAAA-MM-JJ; nextReleases can carry a full local
        // timestamp because the release HOUR matters on the calendar screen.
        nextRelease: currency.nextReleases?.[spec.key]?.slice(0, 10) ?? null,
        nextReleaseOverridden: releaseOverrides.has(`${currency.code}:${spec.key}`),
      };
    });

    return {
      code: currency.code,
      name: currency.name,
      score: currency.scores.total,
      stance: currency.stance,
      geopoliticalRisks: currency.geopoliticalRisks,
      qualitativeAnalysis: currency.qualitativeAnalysis,
      eventsToWatch: currency.eventsToWatch,
      fields,
    };
  });

  const contextValues: Record<string, number | null> = {};
  for (const field of MARKET_FIELDS) {
    const key = field.key as string;
    const value = (marketContext as unknown as Record<string, unknown>)[key];
    contextValues[key] = typeof value === "number" ? value : null;
  }

  const [overrideCount, noteCount, contextCount] = counts;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Admin données"
        subtitle="Corrections manuelles et contexte de marché"
      />

      <Card className="border-brand-blue/30 bg-brand-blue/5">
        <div className="flex items-start gap-2.5">
          <Icon name="shield" size={16} className="text-brand-blue mt-0.5 shrink-0" />
          <p className="text-muted text-sm leading-relaxed">
            Vos corrections sont stockées séparément des données API. Une synchronisation
            automatique écrit uniquement les valeurs des sources et{" "}
            <strong>ne peut pas écraser une saisie manuelle</strong> — la correction gagne
            toujours à la lecture. Videz un champ pour redonner la main à l&apos;API.
          </p>
        </div>
      </Card>

      {/* `today` comes from the server, so the date field's ceiling is the same
          clock the action validates against. Reading it in the browser would
          let a device with a skewed clock offer a date the server refuses. */}
      <MarketContextEditor
        values={contextValues}
        lastUpdate={marketContext.lastUpdate}
        today={today}
      />

      <div className="space-y-2">
        <h2 className="text-subtle font-mono text-[10px] tracking-widest uppercase">
          Devises ({editors.length})
        </h2>
        {editors.map((data) => (
          <CurrencyEditor
            key={data.code}
            data={data}
            today={today}
            releaseCeiling={releaseCeiling}
          />
        ))}
      </div>

      <DangerZone
        counts={{
          overrides: overrideCount ?? 0,
          notes: noteCount ?? 0,
          context: contextCount ?? 0,
        }}
      />
    </div>
  );
}
