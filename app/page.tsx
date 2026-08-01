import type { Metadata } from "next";
import { Icon } from "@/components/ui/icon";
import { CURRENCY_CODES, CURRENCY_COLOR_VAR } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Overview",
};

const PILLARS = [
  {
    icon: "monitoring",
    title: "Institutional scoring",
    body: "Each currency carries its own weighted indicator profile. Indicators with no data are excluded from the calculation rather than scored as zero, so a missing release never drags a currency toward neutral.",
  },
  {
    icon: "calendar_month",
    title: "Macro aggregation",
    body: "OECD and FRED series, plus news sentiment, fetched server-side and cached at the edge. Manual overrides always win over an API refresh.",
  },
  {
    icon: "forum",
    title: "AI briefing",
    body: "A structured multi-round debate across models, with per-round cost accounting and schema-enforced output rather than prompt-coaxed JSON.",
  },
  {
    icon: "receipt_long",
    title: "Trading journal",
    body: "Manual and MetaTrader-synced trades with per-instrument pip and P&L arithmetic, screenshots in object storage, and per-account risk tracking.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-6 py-16">
      <header>
        <p className="text-brand-cyan font-mono text-xs tracking-[0.2em] uppercase">
          Forex macro workstation
        </p>
        <h1 className="text-fg mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Fondanarex</h1>
        <p className="text-muted mt-4 max-w-2xl text-base leading-relaxed">
          A rebuild of DIPper In FOnda on Next.js — same analysis model, with a real database,
          authenticated APIs, and a tested scoring engine.
        </p>
      </header>

      <section aria-label="Tracked currencies" className="mt-10">
        <div className="flex flex-wrap gap-2">
          {CURRENCY_CODES.map((code) => (
            <span
              key={code}
              className="border-border-app bg-surface tabular rounded-lg border px-3 py-1.5 font-mono text-sm font-semibold"
              style={{ color: CURRENCY_COLOR_VAR[code] }}
            >
              {code}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-2">
        {PILLARS.map((pillar) => (
          <article
            key={pillar.title}
            className="border-border-app bg-surface rounded-xl border p-5"
          >
            <div className="flex items-center gap-2.5">
              <Icon name={pillar.icon} className="text-brand-blue" size={20} />
              <h2 className="text-fg text-sm font-semibold">{pillar.title}</h2>
            </div>
            <p className="text-muted mt-2.5 text-sm leading-relaxed">{pillar.body}</p>
          </article>
        ))}
      </section>

      <footer className="border-border-app text-subtle mt-12 border-t pt-6 text-xs">
        Build scaffold. Views are being ported from the legacy app — see the project README for
        status.
      </footer>
    </main>
  );
}
