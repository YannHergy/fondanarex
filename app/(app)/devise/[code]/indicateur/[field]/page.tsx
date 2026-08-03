import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HistoryChart } from "@/app/(app)/devise/[code]/indicateur/[field]/_components/history-chart";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import * as fx from "@/lib/integrations/fxmacrodata";
import { getScoredCurrencies } from "@/lib/currencies";
import { requireUserId } from "@/lib/session";
import { isCurrencyCode } from "@/lib/utils";

/**
 * Historical view for one macro field of one currency — the Trading
 * Economics-style drill-down: click a number on the Devise page, land on its
 * chart. Graph only for now, no written commentary (explicit decision: build
 * the chart first, add the narrative later once this is solid).
 */

const FIELD_LABELS: Record<string, { label: string; unit: string }> = {
  interestRate: { label: "Taux directeur", unit: "%" },
  cpi: { label: "Inflation (CPI)", unit: "%" },
  coreCpi: { label: "Inflation sous-jacente", unit: "%" },
  gdpQoQ: { label: "PIB (trimestriel)", unit: "%" },
  unemployment: { label: "Chômage", unit: "%" },
  wagePPI: { label: "Salaires", unit: "%" },
  tradeBalance: { label: "Balance commerciale", unit: "" },
  retailSales: { label: "Ventes au détail", unit: "%" },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string; field: string }>;
}): Promise<Metadata> {
  const { code, field } = await params;
  const meta = FIELD_LABELS[field];
  return { title: meta ? `${meta.label} — ${code.toUpperCase()}` : code.toUpperCase() };
}

export default async function IndicatorHistoryPage({
  params,
}: {
  params: Promise<{ code: string; field: string }>;
}) {
  const userId = await requireUserId();
  const { code, field } = await params;
  const upperCode = code.toUpperCase();

  const meta = FIELD_LABELS[field];
  if (!meta || !isCurrencyCode(upperCode) || !fx.hasIndicatorHistory(field)) notFound();

  const currencies = await getScoredCurrencies(userId);
  const currency = currencies[upperCode];
  if (!currency) notFound();

  let history: fx.IndicatorHistory | null = null;
  let error: string | null = null;

  if (fx.isConfigured()) {
    try {
      history = await fx.getIndicatorHistory(upperCode, field);
    } catch (err) {
      error = err instanceof Error ? err.message : "Erreur FXMacroData";
    }
  } else {
    error = "FXMACRODATA_API_KEY non configurée.";
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-5 md:p-6">
      <Link
        href={`/devise/${code.toLowerCase()}`}
        className="text-muted hover:text-fg inline-flex items-center gap-1.5 text-xs transition-colors"
      >
        <Icon name="arrow_back" size={14} /> Retour à {upperCode}
      </Link>

      <PageHeader title={`${meta.label} — ${currency.code}`} subtitle={currency.name} />

      <Card>
        {error ? (
          <p className="text-subtle flex items-start gap-2 text-sm">
            <Icon name="cloud_off" size={16} className="mt-0.5 shrink-0" />
            Historique indisponible : {error}
          </p>
        ) : history && history.points.length > 0 ? (
          <HistoryChart points={history.points} unit={meta.unit} />
        ) : (
          <p className="text-subtle text-sm">Aucune donnée historique trouvée.</p>
        )}
      </Card>

      {history && history.points.length > 0 ? (
        <Card>
          <p className="text-subtle text-xs">
            {history.points.length} publications · source : FXMacroData ({history.name})
          </p>
        </Card>
      ) : null}
    </div>
  );
}
