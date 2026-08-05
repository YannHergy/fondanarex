import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Lean } from "@/domain/news/tagging";
import { listNewsFor } from "@/lib/news";
import { cn } from "@/lib/utils";

/**
 * Headlines about one currency, with the direction each leans FOR IT.
 *
 * The direction is per currency, not per article, because a single headline is
 * routinely bullish one and bearish another — "British Pound rises as soft ADP
 * jobs report weighs on Dollar" appears green on the GBP page and red on USD,
 * from the same row.
 *
 * Nothing is generated or summarised here: title, one sentence and a link back
 * to the publisher, which is what an RSS feed licences.
 */

const LEAN: Record<Lean, { icon: string; tone: string; label: string }> = {
  bullish: { icon: "trending_up", tone: "text-brand-green", label: "Haussier" },
  bearish: { icon: "trending_down", tone: "text-brand-red", label: "Baissier" },
  neutral: { icon: "remove", tone: "text-subtle", label: "Neutre" },
};

function ago(at: Date, now: Date): string {
  const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);

  if (minutes < 60) return `il y a ${Math.max(minutes, 1)} min`;
  if (minutes < 1440) return `il y a ${Math.round(minutes / 60)} h`;
  return `il y a ${Math.round(minutes / 1440)} j`;
}

export async function CurrencyNews({ code }: { code: string }) {
  const items = await listNewsFor(code, 8);
  const now = new Date();

  const bullish = items.filter((item) => item.lean === "bullish").length;
  const bearish = items.filter((item) => item.lean === "bearish").length;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="feed" className="mb-0">
          Actualités &amp; Sentiment
        </CardTitle>

        {items.length > 0 ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-brand-green flex items-center gap-1">
              <Icon name="trending_up" size={13} />
              {bullish}
            </span>
            <span className="text-brand-red flex items-center gap-1">
              <Icon name="trending_down" size={13} />
              {bearish}
            </span>
            <span className="text-subtle">{items.length} titres</span>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        /*
         * Said plainly rather than padded with general market news. A trader
         * shown three irrelevant articles under a currency stops trusting the
         * fourth, and silence about a quiet currency is itself accurate.
         */
        <div className="flex min-h-[180px] flex-col items-center justify-center gap-1 text-center">
          <Icon name="feed" size={22} className="text-subtle" />
          <p className="text-muted text-sm">Aucune actualité sur {code} en ce moment.</p>
          <p className="text-subtle max-w-sm text-xs">
            Rien n&apos;est affiché par défaut : plutôt que de remplir avec des titres de marché
            généraux, la section reste vide tant qu&apos;aucun article ne parle réellement de cette
            devise.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => {
            const lean = LEAN[item.lean];

            return (
              <a
                key={`${item.id}-${item.lean}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border-border-app bg-bg hover:border-brand-blue block rounded-lg border p-3 transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <Icon name={lean.icon} size={15} className={cn("mt-0.5 shrink-0", lean.tone)} />

                  <div className="min-w-0 flex-1">
                    <p className="text-fg text-sm leading-snug font-medium">{item.title}</p>
                    {item.summary ? (
                      <p className="text-muted mt-1 text-xs leading-relaxed">{item.summary}</p>
                    ) : null}
                    <p className="text-subtle mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                      <span className={lean.tone}>{lean.label}</span>
                      <span>·</span>
                      <span>{item.source}</span>
                      <span>·</span>
                      <span>{ago(item.publishedAt, now)}</span>
                    </p>
                  </div>

                  <Icon name="open_in_new" size={13} className="text-subtle mt-0.5 shrink-0" />
                </div>
              </a>
            );
          })}
        </div>
      )}

      <p className="text-subtle mt-3 text-[10px] leading-relaxed">
        Titres et liens repris de flux publics (FXStreet, Marketaux, GDELT). Le sens haussier ou
        baissier est déduit du texte par le code, pas par une IA — et il vaut pour {code}{" "}
        uniquement : le même article peut être haussier ici et baissier sur une autre devise.
      </p>
    </Card>
  );
}
