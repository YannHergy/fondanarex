import Link from "next/link";

import { Card, NotConfigured, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { chinaDemandVerdict } from "@/domain/china/demand";
import { buildChinaDemandIndex } from "@/lib/china";
import { fetchChinaReadings, isConfigured } from "@/lib/integrations/fxmacrodata";
import { cn } from "@/lib/utils";

/**
 * "Demande chinoise" has no time series of its own to chart — it is a
 * composite recombined fresh on every request from five Chinese series (see
 * domain/china/demand.ts), so there is nothing in IndicatorValue to plot.
 *
 * What this shows instead: EVERY component that goes into the number on the
 * card, fetched live right now, so a genuinely stuck composite (five inputs
 * frozen) is visibly different from one that is simply unchanged because
 * nothing in China moved this week — the two look identical from the card
 * alone, which is the whole reason this page exists.
 */
export async function ChinaDemandBreakdown({
  code,
  currencyName,
}: {
  code: "AUD" | "NZD";
  currencyName: string;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-5 md:p-6">
      <Link
        href={`/devise/${code.toLowerCase()}`}
        className="text-muted hover:text-fg inline-flex items-center gap-1.5 text-xs transition-colors"
      >
        <Icon name="arrow_back" size={14} /> Retour à {code}
      </Link>

      <PageHeader title={`Demande chinoise — ${code}`} subtitle={currencyName} />

      <Card>{!isConfigured() ? <NotConfigured what="FXMacroData" /> : <Breakdown />}</Card>
    </div>
  );
}

async function Breakdown() {
  let readings;
  try {
    readings = await fetchChinaReadings();
  } catch (err) {
    return (
      <p className="text-subtle flex items-start gap-2 text-sm">
        <Icon name="cloud_off" size={16} className="mt-0.5 shrink-0" />
        Lecture des séries chinoises impossible :{" "}
        {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }

  const current = buildChinaDemandIndex(readings, 0);
  const previous = buildChinaDemandIndex(readings, 1);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-subtle text-[10px] font-bold tracking-wide uppercase">
            Indice composite (référence : 50)
          </p>
          <p className="tabular text-fg mt-1 font-mono text-3xl font-bold">
            {current.value === null ? "—" : current.value.toFixed(1)}
          </p>
          {current.value !== null ? (
            <p className="text-muted mt-0.5 text-xs">{chinaDemandVerdict(current.value)}</p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-subtle text-[10px] font-bold tracking-wide uppercase">Précédent</p>
          <p className="tabular text-muted mt-1 font-mono text-lg">
            {previous.value === null ? "—" : previous.value.toFixed(1)}
          </p>
        </div>
      </div>

      <p className="text-subtle border-border-app mt-3 border-t pt-3 text-xs">
        Dernière période lue : {readings.latestPeriod ?? "inconnue"} · couverture :{" "}
        {Math.round(current.coverage * 100)}% du poids prévu
        {current.missing.length > 0 ? ` · manquant : ${current.missing.join(", ")}` : ""}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-subtle border-border-app border-b text-[10px] font-bold tracking-wide uppercase">
              <th className="pb-2 pr-3">Composante</th>
              <th className="pb-2 pr-3 text-right">Valeur</th>
              <th className="pb-2 pr-3 text-right">Neutre</th>
              <th className="pb-2 pr-3 text-right">Poids</th>
              <th className="pb-2 text-right">Contribution</th>
            </tr>
          </thead>
          <tbody>
            {current.components.map((c) => {
              const contribution = c.deviation * c.weight;
              return (
                <tr key={c.key} className="border-border-app/60 border-b last:border-0">
                  <td className="py-2 pr-3">{c.label}</td>
                  <td className="tabular py-2 pr-3 text-right font-mono">{c.value.toFixed(2)}</td>
                  <td className="tabular text-subtle py-2 pr-3 text-right font-mono">
                    {c.neutral === 0 ? "variation" : c.neutral.toFixed(1)}
                  </td>
                  <td className="tabular text-subtle py-2 pr-3 text-right font-mono">
                    {Math.round(c.weight * 100)}%
                  </td>
                  <td
                    className={cn(
                      "tabular py-2 text-right font-mono font-bold",
                      contribution > 0 ? "text-brand-green" : contribution < 0 ? "text-brand-red" : "text-subtle",
                    )}
                  >
                    {contribution > 0 ? "+" : ""}
                    {contribution.toFixed(2)}
                  </td>
                </tr>
              );
            })}
            {current.missing.map((label) => (
              <tr key={label} className="border-border-app/60 border-b text-subtle last:border-0">
                <td className="py-2 pr-3">{label}</td>
                <td colSpan={4} className="py-2 text-right italic">
                  aucune donnée disponible pour cette lecture
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-subtle mt-4 text-xs leading-relaxed">
        Recombinaison arithmétique de séries chinoises publiées, pas une véritable enquête PMI —
        aucune source officielle chinoise n&apos;est accessible gratuitement. Recalculée en direct à
        chaque chargement de cette page, à partir des mêmes cinq séries que celles qui alimentent
        la carte du tableau de bord.
      </p>
    </>
  );
}
