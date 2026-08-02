import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import {
  COUNTRY_PROFILES,
  GOLDEN_RULE,
  SENSITIVITY_BARS,
  SENSITIVITY_COLOR,
  TAG_COLOR,
  getProfileByCode,
} from "@/domain/data/country-profiles";
import { getCurrencyProfile } from "@/domain/scoring";
import { getScoredCurrencies } from "@/lib/currencies";
import { scoreTextClass, scoreVerdict } from "@/lib/score-display";
import { requireUserId } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Profils pays" };

const DIRECTION_LABEL = {
  positive: "Haussier",
  negative: "Baissier",
  mixed: "Mixte",
} as const;

const DIRECTION_ICON = {
  positive: "trending_up",
  negative: "trending_down",
  mixed: "trending_flat",
} as const;

export default async function CountryProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ devise?: string }>;
}) {
  const userId = await requireUserId();
  const [{ devise }, currencies] = await Promise.all([searchParams, getScoredCurrencies(userId)]);

  // The selected profile lives in the URL, so a profile is linkable and the
  // back button works. The legacy version held it in App.tsx state.
  const selectedCode = (devise ?? COUNTRY_PROFILES[0]?.code ?? "USD").toUpperCase();
  const profile = getProfileByCode(selectedCode) ?? COUNTRY_PROFILES[0];

  if (!profile) {
    return (
      <div className="p-6">
        <p className="text-muted text-sm">Aucun profil pays disponible.</p>
      </div>
    );
  }

  const scored = currencies[profile.code];
  const weights = getCurrencyProfile(profile.code);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader title="Profils pays" subtitle="Fiches structurelles des huit économies suivies" />

      <nav aria-label="Choisir une devise" className="flex flex-wrap gap-2">
        {COUNTRY_PROFILES.map((p) => {
          const active = p.code === profile.code;
          return (
            <Link
              key={p.code}
              href={`/profils?devise=${p.code}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition-colors",
                active
                  ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                  : "border-border-app text-muted hover:text-fg hover:border-border-strong",
              )}
            >
              {p.code}
            </Link>
          );
        })}
      </nav>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <CurrencyBadge code={profile.code} size="lg" />
            <div>
              <h2 className="text-fg text-xl font-bold">{profile.fullName}</h2>
              <p className="text-muted mt-0.5 text-sm">{profile.centralBank}</p>
              <span
                className={cn(
                  "mt-2 inline-block rounded border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  TAG_COLOR[profile.tagType],
                )}
              >
                {profile.tag}
              </span>
            </div>
          </div>

          {scored ? (
            <Link href={`/devise/${profile.code}`} className="text-right">
              <p
                className={cn(
                  "tabular font-mono text-3xl font-bold",
                  scoreTextClass(scored.scores.total),
                )}
              >
                {scored.scores.total}
                <span className="text-subtle text-base font-normal">/100</span>
              </p>
              <p className={cn("text-xs font-semibold", scoreTextClass(scored.scores.total))}>
                {scoreVerdict(scored.scores.total)}
              </p>
              <p className="text-subtle mt-1 inline-flex items-center gap-1 text-[10px]">
                Voir l&apos;analyse <Icon name="arrow_forward" size={10} />
              </p>
            </Link>
          ) : null}
        </div>

        <div className="border-border-app mt-4 grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-3">
          {[
            {
              icon: "add_circle",
              label: "Force",
              value: profile.miniStrength,
              tone: "text-brand-green",
            },
            {
              icon: "remove_circle",
              label: "Faiblesse",
              value: profile.miniWeakness,
              tone: "text-brand-red",
            },
            {
              icon: "insights",
              label: "Indicateur clé",
              value: profile.miniIndicator,
              tone: "text-brand-blue",
            },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-subtle mb-1 flex items-center gap-1.5 text-[10px] tracking-widest uppercase">
                <Icon name={item.icon} size={12} className={item.tone} />
                {item.label}
              </p>
              <p className="text-muted text-sm leading-relaxed">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle icon="trending_up">Forces structurelles</CardTitle>
          <ul className="space-y-2">
            {profile.strengths.map((item) => (
              <li key={item} className="text-muted flex gap-2 text-sm leading-relaxed">
                <Icon name="check" size={14} className="text-brand-green mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle icon="trending_down">Faiblesses structurelles</CardTitle>
          <ul className="space-y-2">
            {profile.weaknesses.map((item) => (
              <li key={item} className="text-muted flex gap-2 text-sm leading-relaxed">
                <Icon name="close" size={14} className="text-brand-red mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardTitle icon="bolt">Sensibilité aux événements</CardTitle>
        <div className="space-y-3">
          {profile.sensitivityRules.map((rule) => (
            <div
              key={rule.event}
              className="border-border-app border-b pb-3 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-fg text-sm font-medium">{rule.event}</p>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-mono text-[10px] font-bold tracking-wide uppercase",
                      SENSITIVITY_COLOR[rule.sensitivity],
                    )}
                  >
                    {rule.sensitivity}
                  </span>
                  <span className="text-subtle inline-flex items-center gap-1 text-[10px]">
                    <Icon name={DIRECTION_ICON[rule.direction]} size={12} />
                    {DIRECTION_LABEL[rule.direction]}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 flex gap-1" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      i < SENSITIVITY_BARS[rule.sensitivity] ? "bg-brand-amber" : "bg-panel",
                    )}
                  />
                ))}
              </div>
              {rule.note ? <p className="text-subtle mt-1.5 text-xs">{rule.note}</p> : null}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle icon="hub">Cascades secondaires</CardTitle>
          <ul className="space-y-2">
            {profile.secondaryCascades.map((item) => (
              <li key={item} className="text-muted flex gap-2 text-sm leading-relaxed">
                <Icon name="arrow_right" size={14} className="text-brand-blue mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle icon="tune">Indicateurs spécifiques</CardTitle>
          <ul className="mb-4 space-y-2">
            {profile.specialIndicators.map((item) => (
              <li key={item} className="text-muted flex gap-2 text-sm leading-relaxed">
                <Icon name="chevron_right" size={14} className="text-brand-cyan mt-0.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          {/* The weighting profile that actually drives this currency's score,
           * shown next to the qualitative sheet that describes it. */}
          {weights ? (
            <div className="border-border-app border-t pt-3">
              <p className="text-subtle mb-2 font-mono text-[10px] tracking-widest uppercase">
                Pondérations du score
              </p>
              <ul className="space-y-1">
                {weights.indicateurs.map((indicator) => (
                  <li key={indicator.id} className="flex items-center gap-2 text-xs">
                    <span className="text-muted flex-1 truncate">{indicator.nom}</span>
                    <div className="bg-panel h-1 w-16 overflow-hidden rounded-full">
                      <div
                        className="bg-brand-blue h-full rounded-full"
                        style={{ width: `${Math.min(100, (indicator.poids / 30) * 100)}%` }}
                      />
                    </div>
                    <span className="text-fg tabular w-8 text-right font-mono">
                      {indicator.poids}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="border-brand-amber/30 bg-brand-amber/5">
        <div className="flex items-start gap-2.5">
          <Icon name="lightbulb" size={18} className="text-brand-amber mt-0.5 shrink-0" />
          <div>
            <p className="text-brand-amber text-xs font-bold tracking-widest uppercase">
              Règle d&apos;or
            </p>
            <p className="text-muted mt-1 text-sm leading-relaxed">{GOLDEN_RULE}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
