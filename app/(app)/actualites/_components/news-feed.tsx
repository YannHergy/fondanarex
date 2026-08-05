"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { FlagIcon } from "@/components/ui/flag-icon";
import { Icon } from "@/components/ui/icon";
import type { Lean } from "@/domain/news/tagging";
import type { GlobalNewsRow } from "@/lib/news";
import { cn } from "@/lib/utils";

/**
 * The full feed, filterable by currency.
 *
 * Every headline carries the flag of each currency it names, and one that names
 * none carries a globe instead of vanishing. That is the point of this page:
 * the currency views filter, this one shows the lot, so a story about oil or
 * risk appetite is still visible even though it belongs to no country.
 */

const ORDER = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"] as const;

const LEAN: Record<Lean, { icon: string; tone: string; label: string }> = {
  bullish: { icon: "trending_up", tone: "text-brand-green", label: "Haussier" },
  bearish: { icon: "trending_down", tone: "text-brand-red", label: "Baissier" },
  neutral: { icon: "remove", tone: "text-subtle", label: "Neutre" },
};

/** Marker for a headline that names no country. */
const GLOBAL = "global";

function ago(at: Date, now: Date): string {
  const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);

  if (minutes < 60) return `il y a ${Math.max(minutes, 1)} min`;
  if (minutes < 1440) return `il y a ${Math.round(minutes / 60)} h`;
  return `il y a ${Math.round(minutes / 1440)} j`;
}

export function NewsFeed({ items, now }: { items: GlobalNewsRow[]; now: string }) {
  const [filter, setFilter] = useState<string | null>(null);
  const nowDate = useMemo(() => new Date(now), [now]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { [GLOBAL]: 0 };
    for (const item of items) {
      if (item.tags.length === 0) out[GLOBAL] = (out[GLOBAL] ?? 0) + 1;
      for (const tag of item.tags) out[tag.currency] = (out[tag.currency] ?? 0) + 1;
    }
    return out;
  }, [items]);

  const visible = useMemo(() => {
    if (filter === null) return items;
    if (filter === GLOBAL) return items.filter((item) => item.tags.length === 0);
    return items.filter((item) => item.tags.some((tag) => tag.currency === filter));
  }, [items, filter]);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={filter === null} onClick={() => setFilter(null)} count={items.length}>
            Tout
          </Chip>

          {ORDER.map((code) => (
            <Chip
              key={code}
              active={filter === code}
              onClick={() => setFilter(filter === code ? null : code)}
              count={counts[code] ?? 0}
            >
              <span className="h-3 w-[18px] overflow-hidden rounded-[2px]">
                <FlagIcon code={code} />
              </span>
              {code}
            </Chip>
          ))}

          <Chip
            active={filter === GLOBAL}
            onClick={() => setFilter(filter === GLOBAL ? null : GLOBAL)}
            count={counts[GLOBAL] ?? 0}
          >
            <Icon name="public" size={13} />
            Marché global
          </Chip>
        </div>
      </Card>

      <Card>
        {visible.length === 0 ? (
          <p className="text-subtle py-10 text-center text-sm">
            Aucune actualité pour ce filtre en ce moment.
          </p>
        ) : (
          <div className="space-y-1.5">
            {visible.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border-border-app bg-bg hover:border-brand-blue block rounded-lg border p-3 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Les drapeaux d'abord : on voit de qui on parle avant de lire. */}
                  <div className="flex w-[62px] shrink-0 flex-wrap gap-1 pt-0.5">
                    {item.tags.length === 0 ? (
                      <span
                        className="border-border-app text-subtle flex h-4 w-[26px] items-center justify-center rounded-[3px] border"
                        title="Aucun pays précis — marché global"
                      >
                        <Icon name="public" size={11} />
                      </span>
                    ) : (
                      item.tags.map((tag) => (
                        <span
                          key={tag.currency}
                          title={`${tag.currency} · ${LEAN[tag.lean].label}`}
                          className={cn(
                            "h-4 w-[26px] overflow-hidden rounded-[3px] ring-1",
                            tag.lean === "bullish"
                              ? "ring-brand-green"
                              : tag.lean === "bearish"
                                ? "ring-brand-red"
                                : "ring-border-app",
                          )}
                        >
                          <FlagIcon code={tag.currency} />
                        </span>
                      ))
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-fg text-sm leading-snug font-medium">{item.title}</p>
                    {item.summary ? (
                      <p className="text-muted mt-1 text-xs leading-relaxed">{item.summary}</p>
                    ) : null}

                    <p className="text-subtle mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                      {item.tags.length === 0 ? (
                        <span>Marché global</span>
                      ) : (
                        item.tags.map((tag) => (
                          <span key={tag.currency} className={LEAN[tag.lean].tone}>
                            {tag.currency} {LEAN[tag.lean].label.toLowerCase()}
                          </span>
                        ))
                      )}
                      <span>·</span>
                      <span>{item.source}</span>
                      <span>·</span>
                      <span>{ago(item.publishedAt, nowDate)}</span>
                    </p>
                  </div>

                  <Icon name="open_in_new" size={13} className="text-subtle mt-0.5 shrink-0" />
                </div>
              </a>
            ))}
          </div>
        )}

        <p className="text-subtle mt-3 text-[10px] leading-relaxed">
          Titres et liens repris de flux publics. Le drapeau indique la devise que l&apos;article
          nomme, et sa bordure le sens pour ELLE : un même article peut être bordé de vert pour une
          devise et de rouge pour une autre. Le globe signale un titre qui ne nomme aucun pays.
        </p>
      </Card>
    </>
  );
}

function Chip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0 && !active}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-brand-blue text-white"
          : "text-subtle hover:text-fg hover:bg-panel disabled:opacity-30 disabled:hover:bg-transparent",
      )}
    >
      {children}
      <span className={cn("tabular", active ? "text-white/70" : "text-subtle")}>{count}</span>
    </button>
  );
}
