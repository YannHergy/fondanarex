"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveRiskDefaults } from "@/app/(app)/simulateur/actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { simulateBreakeven } from "@/domain/risk/breakeven";
import { maxViableRiskPct, simulateCompound } from "@/domain/risk/compound";
import {
  calculatePositionSize,
  calculateRisk,
  type InstrumentSpec,
} from "@/domain/risk/position";
import { cn } from "@/lib/utils";

const money = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 0, minimumFractionDigits: 0 });

const money2 = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function Field({
  label,
  value,
  onChange,
  step = "1",
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label className="text-muted mb-1 block text-xs">
        {label}
        {suffix ? <span className="text-subtle"> ({suffix})</span> : null}
      </label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const parsed = Number.parseFloat(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className="bg-panel border-border-app text-fg focus:border-brand-blue tabular w-full rounded-lg border px-2.5 py-1.5 font-mono text-sm outline-none"
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "text-fg",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="border-border-app rounded-lg border p-3">
      <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">{label}</p>
      <p className={cn("tabular mt-1 font-mono text-lg font-bold", tone)}>{value}</p>
      {hint ? <p className="text-subtle mt-0.5 text-[10px]">{hint}</p> : null}
    </div>
  );
}

// ── Risk calculator ────────────────────────────────────────────────────────

export function RiskCalculator({
  defaults,
  instruments,
}: {
  defaults: { riskCapital: number; riskPct: number; riskRR: number };
  instruments: InstrumentSpec[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [capital, setCapital] = useState(defaults.riskCapital);
  const [riskPct, setRiskPct] = useState(defaults.riskPct);
  const [rr, setRr] = useState(defaults.riskRR);
  const [stopPips, setStopPips] = useState(20);
  const [symbol, setSymbol] = useState(instruments[0]?.symbol ?? "EUR/USD");
  const [saved, setSaved] = useState(false);

  const outcome = useMemo(
    () => calculateRisk({ capital, riskPct, rr }),
    [capital, riskPct, rr],
  );

  const instrument = instruments.find((i) => i.symbol === symbol) ?? instruments[0];
  const size = useMemo(
    () =>
      instrument
        ? calculatePositionSize(outcome.riskAmount, stopPips, instrument)
        : null,
    [instrument, outcome.riskAmount, stopPips],
  );

  const dirty =
    capital !== defaults.riskCapital ||
    riskPct !== defaults.riskPct ||
    rr !== defaults.riskRR;

  return (
    <Card>
      <CardTitle icon="calculate">Calculateur de risque</CardTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Capital" value={capital} onChange={setCapital} step="100" />
        <Field label="Risque" value={riskPct} onChange={setRiskPct} step="0.05" suffix="%" />
        <Field label="Objectif" value={rr} onChange={setRr} step="0.5" suffix="R" />
        <Field label="Stop" value={stopPips} onChange={setStopPips} step="1" suffix="pips" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Risque" value={`${money2(outcome.riskAmount)} $`} tone="text-brand-red" />
        <Stat label="Gain visé" value={`${money2(outcome.gainAmount)} $`} tone="text-brand-green" />
        <Stat
          label="Après perte"
          value={`${money(outcome.capitalAfterLoss)} $`}
          hint={`prochain risque ${money2(outcome.nextRiskAfterLoss)} $`}
        />
        <Stat
          label="Après gain"
          value={`${money(outcome.capitalAfterWin)} $`}
          hint={`prochain risque ${money2(outcome.nextRiskAfterWin)} $`}
        />
      </div>

      <div className="border-border-app mt-4 border-t pt-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="sim-instrument" className="text-muted mb-1 block text-xs">
              Instrument
            </label>
            <select
              id="sim-instrument"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="bg-panel border-border-app text-fg rounded-lg border px-2.5 py-1.5 text-sm outline-none"
            >
              {instruments.map((i) => (
                <option key={i.symbol} value={i.symbol}>
                  {i.symbol}
                </option>
              ))}
            </select>
          </div>
          {size ? (
            <p className="text-subtle text-[11px] leading-relaxed">
              Valeur du pip calculée depuis l&apos;instrument :{" "}
              <span className="text-fg font-mono">{money2(size.pipValuePerLot)} $</span> par lot
              standard.
            </p>
          ) : null}
        </div>

        {size ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Taille"
              value={`${size.lotsRounded.toFixed(2)} lot`}
              hint={`brut ${size.lots.toFixed(3)}, arrondi à la baisse`}
              tone="text-brand-blue"
            />
            <Stat
              label="Risque réel"
              value={`${money2(size.actualRisk)} $`}
              hint="au lot arrondi"
            />
            <Stat
              label="Perte journalière max"
              value={`${money2(outcome.dailyMaxLoss)} $`}
              hint={`${outcome.dailyMaxTrades} trade(s) perdants`}
              tone="text-brand-amber"
            />
            <Stat
              label="Pertes avant −8 %"
              value={String(outcome.tradesToBreach)}
              hint="pertes consécutives"
              tone="text-brand-red"
            />
          </div>
        ) : null}
      </div>

      <div className="border-border-app mt-4 flex items-center gap-3 border-t pt-3">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              await saveRiskDefaults({ riskCapital: capital, riskPct, riskRR: rr });
              setSaved(true);
              router.refresh();
            })
          }
          className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="save" size={14} /> Enregistrer par défaut
        </button>
        {saved && !dirty ? (
          <span role="status" className="text-brand-green text-xs">
            Enregistré
          </span>
        ) : null}
      </div>
    </Card>
  );
}

// ── Compound projection ────────────────────────────────────────────────────

export function CompoundSimulator({ defaultCapital }: { defaultCapital: number }) {
  const [capital, setCapital] = useState(defaultCapital);
  const [riskPct, setRiskPct] = useState(0.4);
  const [rr, setRr] = useState(6);
  const [winRatePct, setWinRatePct] = useState(35);
  const [tradesPerWeek, setTradesPerWeek] = useState(10);
  const [months, setMonths] = useState(6);
  const [targetPct, setTargetPct] = useState(8);
  const [maxDrawdownPct, setMaxDrawdownPct] = useState(8);
  const [dailyDrawdownPct, setDailyDrawdownPct] = useState(0.8);

  const result = useMemo(
    () =>
      simulateCompound({
        capital,
        riskPct,
        rr,
        winRatePct,
        tradesPerWeek,
        months,
        targetPct,
        maxDrawdownPct,
        dailyDrawdownPct,
      }),
    [
      capital,
      riskPct,
      rr,
      winRatePct,
      tradesPerWeek,
      months,
      targetPct,
      maxDrawdownPct,
      dailyDrawdownPct,
    ],
  );

  const viableRisk = useMemo(() => maxViableRiskPct(rr, winRatePct), [rr, winRatePct]);
  const shrinking = result.geometricFactor <= 1;
  const positiveExpectancy = result.expectancy > 0;

  const maxCapital = Math.max(...result.monthlyCapital, capital);
  const minCapital = Math.min(...result.monthlyCapital, capital);
  const range = Math.max(1, maxCapital - minCapital);

  return (
    <Card>
      <CardTitle icon="trending_up">Projection composée</CardTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Capital" value={capital} onChange={setCapital} step="500" />
        <Field label="Risque" value={riskPct} onChange={setRiskPct} step="0.1" suffix="%" />
        <Field label="Objectif" value={rr} onChange={setRr} step="0.5" suffix="R" />
        <Field label="Taux de réussite" value={winRatePct} onChange={setWinRatePct} step="1" suffix="%" />
        <Field label="Trades/semaine" value={tradesPerWeek} onChange={setTradesPerWeek} step="1" />
        <Field label="Mois" value={months} onChange={setMonths} step="1" />
        <Field label="Cible" value={targetPct} onChange={setTargetPct} step="1" suffix="%" />
        <Field label="Drawdown max" value={maxDrawdownPct} onChange={setMaxDrawdownPct} step="0.5" suffix="%" />
        <Field label="Drawdown/jour" value={dailyDrawdownPct} onChange={setDailyDrawdownPct} step="0.1" suffix="%" />
      </div>

      {shrinking && positiveExpectancy ? (
        <div className="border-brand-red/40 bg-brand-red/10 mt-4 flex items-start gap-2.5 rounded-lg border p-3">
          <Icon name="warning" size={16} className="text-brand-red mt-0.5 shrink-0" />
          <div>
            <p className="text-brand-red text-sm font-semibold">
              Espérance positive, mais le compte décroît
            </p>
            <p className="text-muted mt-1 text-sm leading-relaxed">
              L&apos;espérance arithmétique est de {(result.expectancy * 100).toFixed(2)} % par
              trade, mais le facteur géométrique vaut {result.geometricFactor.toFixed(4)} : les
              pertes se composent multiplicativement, donc la taille est trop grande pour cet edge.
              {viableRisk > 0
                ? ` Risque maximal viable : environ ${viableRisk} %.`
                : " Aucun niveau de risque ne rend cet edge viable."}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Capital final"
          value={`${money(result.finalCapital)} $`}
          tone={result.totalProfit >= 0 ? "text-brand-green" : "text-brand-red"}
          hint={`×${result.multiple.toFixed(2)}`}
        />
        <Stat
          label="Profit"
          value={`${result.totalProfit >= 0 ? "+" : ""}${money(result.totalProfit)} $`}
          tone={result.totalProfit >= 0 ? "text-brand-green" : "text-brand-red"}
          hint={`${result.profitPct.toFixed(1)} %`}
        />
        <Stat
          label="Trades → cible"
          value={result.tradesToTarget === null ? "jamais" : String(result.tradesToTarget)}
          hint={
            result.weeksToTarget === null
              ? "croissance non positive"
              : `≈ ${result.weeksToTarget} semaines`
          }
          tone={result.tradesToTarget === null ? "text-brand-red" : "text-fg"}
        />
        <Stat
          label="Pertes → drawdown"
          value={String(result.tradesToBreachDrawdown)}
          hint={`limite ${maxDrawdownPct} %`}
          tone="text-brand-amber"
        />
      </div>

      <div className="mt-4">
        <p className="text-subtle mb-2 font-mono text-[10px] tracking-widest uppercase">
          Capital par mois
        </p>
        <div className="flex h-32 items-end gap-1">
          {result.monthlyCapital.map((value, index) => (
            <div key={index} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={cn(
                  "w-full rounded-t",
                  value >= capital ? "bg-brand-green/60" : "bg-brand-red/60",
                )}
                style={{ height: `${((value - minCapital) / range) * 100 || 2}%` }}
                title={`${money(value)} $`}
              />
              <span className="text-subtle font-mono text-[9px]">
                {index === 0 ? "Init" : `M${index}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Breakeven ──────────────────────────────────────────────────────────────

export function BreakevenSimulator({ defaultCapital }: { defaultCapital: number }) {
  const [capital, setCapital] = useState(defaultCapital);
  const [riskPct, setRiskPct] = useState(0.5);
  const [winRatePct, setWinRatePct] = useState(55);
  const [rrSingle, setRrSingle] = useState(5);
  const [rrEntry1, setRrEntry1] = useState(5);
  const [rrEntry2, setRrEntry2] = useState(7);
  const [riskSplitPct, setRiskSplitPct] = useState(60);
  const [entry2Freq, setEntry2Freq] = useState(60);
  const [totalTrades, setTotalTrades] = useState(100);

  // Memoised as one object so the simulation depends on a single stable value
  // rather than eight loose fields kept in sync by hand.
  const inputs = useMemo(
    () => ({
      capital,
      riskPct,
      winRatePct,
      rrSingle,
      rrEntry1,
      rrEntry2,
      riskSplitPct,
      totalTrades,
    }),
    [capital, riskPct, winRatePct, rrSingle, rrEntry1, rrEntry2, riskSplitPct, totalTrades],
  );

  const result = useMemo(() => simulateBreakeven(inputs), [inputs]);

  const current = result.points.reduce((closest, point) =>
    Math.abs(point.frequency - entry2Freq) < Math.abs(closest.frequency - entry2Freq)
      ? point
      : closest,
  );

  const values = result.points.flatMap((p) => [p.single, p.split]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);

  return (
    <Card>
      <CardTitle icon="call_split">Entrée unique vs fractionnée</CardTitle>
      <p className="text-subtle mb-3 text-[11px] leading-relaxed">
        L&apos;entrée fractionnée échange une taille moyenne plus faible contre un objectif moyen
        meilleur. Le point de bascule est la fréquence à laquelle la seconde entrée doit
        réellement se présenter pour que ce compromis soit gagnant.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Capital" value={capital} onChange={setCapital} step="500" />
        <Field label="Risque total" value={riskPct} onChange={setRiskPct} step="0.1" suffix="%" />
        <Field label="Taux de réussite" value={winRatePct} onChange={setWinRatePct} step="1" suffix="%" />
        <Field label="R entrée unique" value={rrSingle} onChange={setRrSingle} step="0.5" />
        <Field label="R entrée 1" value={rrEntry1} onChange={setRrEntry1} step="0.5" />
        <Field label="R entrée 2" value={rrEntry2} onChange={setRrEntry2} step="0.5" />
        <Field label="Part entrée 1" value={riskSplitPct} onChange={setRiskSplitPct} step="5" suffix="%" />
        <Field label="Fréquence entrée 2" value={entry2Freq} onChange={setEntry2Freq} step="5" suffix="%" />
        <Field label="Trades simulés" value={totalTrades} onChange={setTotalTrades} step="10" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Risque entrée 1" value={`${money2(result.riskEntry1)} $`} />
        <Stat label="Risque entrée 2" value={`${money2(result.riskEntry2)} $`} />
        <Stat
          label="Unique"
          value={`${current.single >= 0 ? "+" : ""}${money(current.single)} $`}
          tone={current.single >= 0 ? "text-brand-green" : "text-brand-red"}
        />
        <Stat
          label="Fractionnée"
          value={`${current.split >= 0 ? "+" : ""}${money(current.split)} $`}
          tone={current.split >= current.single ? "text-brand-green" : "text-brand-amber"}
          hint={`${current.difference >= 0 ? "+" : ""}${money(current.difference)} $ vs unique`}
        />
      </div>

      {result.breakevenFrequency !== null ? (
        <div className="border-brand-amber/40 bg-brand-amber/10 mt-4 flex items-start gap-2.5 rounded-lg border p-3">
          <Icon name="bolt" size={16} className="text-brand-amber mt-0.5 shrink-0" />
          <p className="text-muted text-sm leading-relaxed">
            Point de bascule : <strong>{result.breakevenFrequency} %</strong>. En dessous,
            l&apos;entrée unique gagne ; au-dessus, la fractionnée.
          </p>
        </div>
      ) : (
        <p className="text-subtle mt-4 text-sm">
          Aucun croisement sur la plage : une approche domine l&apos;autre à toutes les fréquences.
        </p>
      )}

      <div className="mt-4">
        <svg viewBox="0 0 600 160" className="h-40 w-full" role="img" aria-label="Comparaison des deux approches">
          <polyline
            fill="none"
            stroke="var(--color-brand-steel)"
            strokeWidth={1.5}
            points={result.points
              .map((p) => `${(p.frequency / 100) * 600},${150 - ((p.single - min) / span) * 140}`)
              .join(" ")}
          />
          <polyline
            fill="none"
            stroke="var(--color-brand-blue)"
            strokeWidth={2}
            points={result.points
              .map((p) => `${(p.frequency / 100) * 600},${150 - ((p.split - min) / span) * 140}`)
              .join(" ")}
          />
          {result.breakevenFrequency !== null ? (
            <line
              x1={(result.breakevenFrequency / 100) * 600}
              x2={(result.breakevenFrequency / 100) * 600}
              y1={5}
              y2={150}
              stroke="var(--color-brand-amber)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}
        </svg>
        <div className="text-subtle flex items-center gap-4 text-[10px]">
          <span className="flex items-center gap-1.5">
            <span className="bg-brand-steel inline-block h-0.5 w-4" /> Entrée unique
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-brand-blue inline-block h-0.5 w-4" /> Fractionnée
          </span>
          <span className="ml-auto">Axe X : fréquence de la seconde entrée (0 → 100 %)</span>
        </div>
      </div>
    </Card>
  );
}
