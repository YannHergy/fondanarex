import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  MIN_SAMPLE,
  summariseAlignment,
  type AlignedTrade,
} from "@/domain/journal/news-alignment";
import { cn } from "@/lib/utils";

/**
 * Did trading with the fundamentals actually pay?
 *
 * Two win rates side by side rather than one "alignment" percentage. A single
 * figure conflates how OFTEN you followed the news with whether doing so
 * WORKED, and only the second changes what you do next.
 */
export function NewsAlignmentPanel({ aligned }: { aligned: AlignedTrade[] }) {
  const summary = summariseAlignment(aligned);

  if (summary.total === 0) {
    return (
      <Card>
        <CardTitle icon="newspaper">Corrélation news et résultats</CardTitle>
        <p className="text-subtle text-sm">
          Aucun trade ne coïncide avec une publication notée. Renseignez l&apos;impact des
          événements dans le calendrier pour que cette analyse devienne possible.
        </p>
      </Card>
    );
  }

  const conclusive = summary.edge !== null;
  const favourable = summary.edge !== null && summary.edge > 0;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="newspaper" className="mb-0">
          Corrélation news et résultats
        </CardTitle>
        <span className="text-subtle font-mono text-[11px]">
          {summary.total} trade(s) sur jour de publication
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Side
          label="Dans le sens des news"
          count={summary.withNews}
          winRate={summary.withNewsWinRate}
          pnl={summary.withNewsPnl}
          icon="trending_up"
        />
        <Side
          label="À contre-courant"
          count={summary.againstNews}
          winRate={summary.againstNewsWinRate}
          pnl={summary.againstNewsPnl}
          icon="trending_down"
        />
      </div>

      <div
        className={cn(
          "mt-3 rounded-lg border p-3",
          !conclusive
            ? "border-border-app bg-panel"
            : favourable
              ? "border-brand-green/30 bg-brand-green/5"
              : "border-brand-amber/30 bg-brand-amber/5",
        )}
      >
        {!conclusive ? (
          <p className="text-muted flex items-start gap-2 text-xs leading-relaxed">
            <Icon name="info" size={14} className="text-subtle mt-0.5 shrink-0" />
            Pas encore assez de trades des deux côtés pour conclure — il en faut au moins{" "}
            {MIN_SAMPLE} dans chaque catégorie. Un taux calculé sur trois trades n&apos;est pas un
            résultat.
          </p>
        ) : (
          <p className="text-muted flex items-start gap-2 text-xs leading-relaxed">
            <Icon
              name={favourable ? "check_circle" : "warning"}
              size={14}
              className={cn("mt-0.5 shrink-0", favourable ? "text-brand-green" : "text-brand-amber")}
            />
            <span>
              Suivre les publications vous fait gagner{" "}
              <strong className={favourable ? "text-brand-green" : "text-brand-amber"}>
                {summary.edge! > 0 ? "+" : ""}
                {summary.edge} points
              </strong>{" "}
              de taux de réussite
              {favourable
                ? ". Le fondamental confirme vos entrées."
                : ". Vos meilleures entrées vont contre le flux de nouvelles — à comprendre avant d'en tirer une règle."}
            </span>
          </p>
        )}
      </div>

      <p className="text-subtle mt-2 text-[11px] leading-relaxed">
        L&apos;impact est compté <strong>pour la paire</strong> : une nouvelle sur la devise de
        base pousse à la hausse, une nouvelle sur la devise de cotation à la baisse. Les jours
        sans publication notée, et ceux où les deux jambes s&apos;annulent, sont exclus plutôt que
        comptés comme neutres.
      </p>
    </Card>
  );
}

function Side({
  label,
  count,
  winRate,
  pnl,
  icon,
}: {
  label: string;
  count: number;
  winRate: number | null;
  pnl: number;
  icon: string;
}) {
  return (
    <div className="border-border-app bg-panel rounded-lg border p-3">
      <p className="text-subtle mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase">
        <Icon name={icon} size={13} />
        {label}
      </p>
      <p
        className={cn(
          "font-mono text-2xl font-black",
          winRate === null
            ? "text-subtle"
            : winRate >= 50
              ? "text-brand-green"
              : "text-brand-red",
        )}
      >
        {winRate === null ? "—" : `${winRate} %`}
      </p>
      <p className="text-subtle font-mono text-[11px]">
        {count} trade(s) ·{" "}
        <span className={pnl > 0 ? "text-brand-green" : pnl < 0 ? "text-brand-red" : undefined}>
          {pnl > 0 ? "+" : ""}
          {pnl.toFixed(2)}
        </span>
      </p>
    </div>
  );
}
