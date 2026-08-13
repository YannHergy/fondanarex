import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  MIN_GAP,
  MIN_PER_SIDE,
  alignmentVerdict,
  type AlignmentReport,
} from "@/domain/journal/macro-alignment";
import { cn } from "@/lib/utils";

/**
 * Le score macro aide-t-il vraiment ?
 *
 * La seule mesure qui dise si l'édifice de scoring sert ou s'il décore. Chaque
 * trade clôturé est confronté au biais de sa paire AU JOUR OÙ IL A ÉTÉ OUVERT,
 * puis on compare ce que rapportent les trades pris dans le sens du score à
 * ceux pris contre.
 *
 * Le verdict reste « indécidable » tant que les deux colonnes n'ont pas assez
 * de trades, et c'est volontaire : annoncer que le score fonctionne sur six
 * trades serait exactement le genre de conclusion que cet écran existe pour
 * empêcher.
 */

const money = (n: number) =>
  `${n >= 0 ? "+" : ""}${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} $`;

const VERDICT = {
  aide: {
    label: "Le score aide",
    icon: "check_circle",
    className: "text-brand-green border-brand-green/40 bg-brand-green/10",
    hint: "Suivre le biais macro rapporte davantage que l'ignorer.",
  },
  neutre: {
    label: "Aucune différence",
    icon: "remove",
    className: "text-brand-amber border-brand-amber/40 bg-brand-amber/10",
    hint: "Les deux côtés se valent : le score ne change rien à vos résultats.",
  },
  nuit: {
    label: "Le score nuit",
    icon: "cancel",
    className: "text-brand-red border-brand-red/40 bg-brand-red/10",
    hint: "Aller contre le biais macro rapporte plus que le suivre. À creuser.",
  },
  indecidable: {
    label: "Pas encore mesurable",
    icon: "hourglass_empty",
    className: "text-subtle border-border-app bg-panel",
    hint: `Il faut au moins ${MIN_PER_SIDE} trades de CHAQUE côté pour comparer.`,
  },
} as const;

export function MacroAlignmentPanel({ report }: { report: AlignmentReport }) {
  const verdict = VERDICT[alignmentVerdict(report)];
  const compared = report.aligned.trades + report.against.trades;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="fact_check" className="mb-0">
          Votre score macro sert-il ?
        </CardTitle>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-bold uppercase",
            verdict.className,
          )}
        >
          <Icon name={verdict.icon} size={12} />
          {verdict.label}
        </span>
      </div>

      <p className="text-muted mb-3 text-xs leading-relaxed">{verdict.hint}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Side
          title="Dans le sens du score"
          tone="aligned"
          stats={report.aligned}
        />
        <Side title="À contresens" tone="against" stats={report.against} />
      </div>

      <p className="text-subtle mt-3 text-[11px] leading-relaxed">
        {compared} trade(s) comparé(s), {report.skipped} écarté(s) — encore ouverts, hors paire de
        devises, sans historique de score à leur date, ou pris quand l&apos;écart entre les deux
        devises était inférieur à {MIN_GAP} points, c&apos;est-à-dire sans signal macro net. Le
        score retenu est toujours celui qui existait le jour de l&apos;ouverture, jamais un
        relevé postérieur.
      </p>
    </Card>
  );
}

function Side({
  title,
  tone,
  stats,
}: {
  title: string;
  tone: "aligned" | "against";
  stats: AlignmentReport["aligned"];
}) {
  const good = tone === "aligned";
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        good ? "border-brand-blue/25 bg-brand-blue/5" : "border-border-app",
      )}
    >
      <p className="text-fg mb-2 text-xs font-semibold">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <Figure label="Trades" value={String(stats.trades)} />
        <Figure
          label="Réussite"
          value={stats.winRatePct === null ? "—" : `${stats.winRatePct} %`}
        />
        <Figure
          label="P&L"
          value={money(stats.netPnl)}
          tone={stats.netPnl >= 0 ? "text-brand-green" : "text-brand-red"}
        />
        <Figure
          label="Gain moyen"
          value={stats.expectancy === null ? "—" : money(stats.expectancy)}
          tone={(stats.expectancy ?? 0) >= 0 ? "text-brand-green" : "text-brand-red"}
        />
      </div>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-subtle font-mono text-[9px] tracking-wide uppercase">{label}</p>
      <p className={cn("tabular font-mono text-base font-bold", tone ?? "text-fg")}>{value}</p>
    </div>
  );
}
