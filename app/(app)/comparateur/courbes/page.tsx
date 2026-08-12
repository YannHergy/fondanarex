import type { Metadata } from "next";
import Link from "next/link";

import { MultiScoreChart } from "@/components/multi-score-chart";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { getScoreSeries } from "@/lib/score-series";
import { requireUserId } from "@/lib/session";
import { CURRENCY_CODES, CURRENCY_COLOR_VAR, cn, isCurrencyCode } from "@/lib/utils";

export const metadata: Metadata = { title: "Courbes de score" };

/**
 * Superposition des courbes de score macro.
 *
 * La sélection vit dans l'URL (`?devises=EUR,USD`) et non dans un état client :
 * une comparaison se partage, se met en favori et survit à un rechargement.
 * C'est le même parti pris que le comparateur, dont la paire est déjà dans
 * l'URL.
 */

function parseSelection(raw: string | undefined): string[] {
  if (!raw) return [];
  const codes = raw
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(isCurrencyCode);
  return [...new Set(codes)];
}

export default async function ScoreCurvesPage({
  searchParams,
}: {
  searchParams: Promise<{ devises?: string }>;
}) {
  await requireUserId();
  const { devises } = await searchParams;

  const selected = parseSelection(devises);
  // Rien de demandé : on montre tout, ce qui rend la page utile dès l'arrivée
  // plutôt que d'exiger une sélection avant d'afficher quoi que ce soit.
  const shown = selected.length > 0 ? selected : [...CURRENCY_CODES];
  const series = await getScoreSeries(shown);

  function hrefWithout(code: string): string {
    const next = shown.filter((c) => c !== code);
    return next.length === 0 ? "/comparateur/courbes" : `/comparateur/courbes?devises=${next.join(",")}`;
  }

  function hrefWith(code: string): string {
    return `/comparateur/courbes?devises=${[...shown, code].join(",")}`;
  }

  return (
    <div className="space-y-6 p-6 pb-16 md:p-10">
      <div className="border-border-app border-b pb-5">
        <PageHeader
          title="Courbes de score comparées"
          subtitle="Superposition des scores macro · 0 – 100"
        >
          <Link
            href="/comparateur"
            className="border-border-app text-muted hover:text-fg hover:border-border-strong flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[10px] tracking-wide uppercase transition-all"
          >
            <Icon name="arrow_back" size={11} /> Comparateur
          </Link>
        </PageHeader>
      </div>

      <div className="border-border-app bg-surface flex flex-wrap items-center gap-2 rounded-xl border p-3">
        <span className="text-subtle mr-1 flex items-center gap-1.5 font-mono text-[10px] tracking-widest uppercase">
          <Icon name="stacked_line_chart" size={12} />
          Superposer
        </span>
        {CURRENCY_CODES.map((code) => {
          const on = shown.includes(code);
          return (
            <Link
              key={code}
              href={on ? hrefWithout(code) : hrefWith(code)}
              aria-pressed={on}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-[11px] tracking-wider transition-all",
                on
                  ? "text-fg"
                  : "border-border-app/60 text-subtle opacity-50 hover:opacity-100",
              )}
              style={
                on
                  ? {
                      borderColor: CURRENCY_COLOR_VAR[code],
                      backgroundColor: `color-mix(in oklab, ${CURRENCY_COLOR_VAR[code]} 12%, transparent)`,
                    }
                  : undefined
              }
            >
              <CurrencyBadge code={code} size="sm" />
              {code}
            </Link>
          );
        })}
        <span className="text-subtle ml-auto font-mono text-[10px]">
          {shown.length}/{CURRENCY_CODES.length}
        </span>
      </div>

      <Card>
        <CardTitle icon="show_chart">Score macro dans le temps</CardTitle>
        <MultiScoreChart series={series} height={300} />
      </Card>
    </div>
  );
}
