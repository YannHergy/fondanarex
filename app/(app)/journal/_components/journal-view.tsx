"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { TradeForm } from "@/app/(app)/journal/_components/trade-form";
import {
  deleteTradeScreenshot,
  removeTrade,
  uploadTradeScreenshot,
} from "@/app/(app)/journal/actions";
import { AnalysisView } from "@/app/(app)/journal/_components/analysis-view";
import { EquityCurve } from "@/app/(app)/journal/_components/equity-curve";
import { ImportMt5 } from "@/app/(app)/journal/_components/import-mt5";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  filterTrades,
  isImported,
  journalStats,
  monthCalendar,
  ORIGIN_LABELS,
  SESSIONS,
  sortTrades,
  tradesByDay,
  type JournalFilters,
  type PeriodFilter,
  type ResultFilter,
  type SortColumn,
  type SortDirection,
} from "@/domain/journal/filters";
import { MAX_UPLOAD_BYTES } from "@/domain/media/image-type";
import type { InstrumentSpec } from "@/domain/risk/position";
import type { AnalysisRunRow } from "@/lib/analysis-history";
import type { AccountOption, TradeRow } from "@/lib/journal";
import { cn } from "@/lib/utils";

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/**
 * The journal's views.
 *
 * A view is a way of reading the SAME filtered set, never a different subset —
 * the filter bar and the stat row above stay put while this switches, so a
 * number cannot change meaning just because the shape below it did.
 */
type Tab = "list" | "calendar" | "equity" | "analysis";

export function JournalView({
  trades,
  instruments,
  specs,
  strategies,
  accounts,
  analysisHistory,
  now,
}: {
  trades: TradeRow[];
  instruments: string[];
  specs: Record<string, InstrumentSpec>;
  strategies: string[];
  accounts: AccountOption[];
  analysisHistory: AnalysisRunRow[];
  /** Server clock, so filtering does not depend on the visitor's machine. */
  now: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("list");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TradeRow | null>(null);
  const [selected, setSelected] = useState<TradeRow | null>(null);
  const [filters, setFilters] = useState<JournalFilters>({});
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [month, setMonth] = useState(() => new Date(now));

  const nowDate = useMemo(() => new Date(now), [now]);

  const visible = useMemo(() => {
    const filtered = filterTrades(trades, filters, nowDate);
    return sortTrades(filtered, sortColumn, sortDirection);
  }, [trades, filters, nowDate, sortColumn, sortDirection]);

  // Stats follow the filters: the figures describe the list you are looking at,
  // not a global total that ignores what you selected.
  const stats = useMemo(() => journalStats(visible), [visible]);

  // Spelled out for the AI analysis, which would otherwise describe "the
  // journal" while looking at a single pair over one week.
  const periodLabel = useMemo(() => {
    const parts: string[] = [];
    if (filters.period === "week") parts.push("cette semaine");
    else if (filters.period === "month") parts.push("ce mois");
    else parts.push("toute la période");

    if (filters.instrument) parts.push(`paire ${filters.instrument}`);
    if (filters.strategy) parts.push(`stratégie ${filters.strategy}`);
    if (filters.session) parts.push(`session ${filters.session}`);
    if (filters.result && filters.result !== "all") parts.push(`résultat : ${filters.result}`);

    return parts.join(", ");
  }, [filters]);

  const calendar = useMemo(
    () => monthCalendar(month.getUTCFullYear(), month.getUTCMonth(), tradesByDay(trades)),
    [month, trades],
  );

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  }

  function openForm(trade: TradeRow | null) {
    setEditing(trade);
    setFormOpen(true);
    setSelected(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Journal"
        subtitle="Chaque trade, ce qui l'a motivé et ce qu'il a réellement donné"
      >
        <ImportMt5 accounts={accounts} />
        <button
          type="button"
          onClick={() => openForm(null)}
          className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-colors"
        >
          <Icon name="add" size={16} />
          Nouveau trade
        </button>
      </PageHeader>

      {/*
        Vue et filtres AVANT les chiffres : chaque statistique ci-dessous est
        calculée sur l'ensemble filtré, pas sur le journal entier. Les placer
        au-dessus laissait croire l'inverse — on lisait un total, puis on
        découvrait le filtre qui l'avait produit.
      */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(
            [
              { id: "list", label: "Liste", icon: "list" },
              { id: "calendar", label: "Calendrier", icon: "calendar_month" },
              { id: "equity", label: "Évolution du compte", icon: "show_chart" },
              { id: "analysis", label: "Analyse IA", icon: "psychology" },
            ] as const
          ).map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                tab === entry.id
                  ? "bg-brand-blue text-white"
                  : "text-subtle hover:text-fg hover:bg-panel",
              )}
            >
              <Icon name={entry.icon} size={14} />
              {entry.label}
            </button>
          ))}

          <input
            value={filters.search ?? ""}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="Rechercher…"
            className="bg-panel border-border-app text-fg focus:border-brand-blue ml-auto rounded-lg border px-3 py-1.5 text-xs focus:outline-none"
          />
        </div>

        <div className="border-border-app flex flex-wrap gap-2 border-t pt-3">
          <FilterSelect
            value={filters.instrument ?? ""}
            onChange={(value) => setFilters((c) => ({ ...c, instrument: value || undefined }))}
            options={instruments}
            placeholder="Toutes les paires"
          />
          <FilterSelect
            value={filters.strategy ?? ""}
            onChange={(value) => setFilters((c) => ({ ...c, strategy: value || undefined }))}
            options={strategies}
            placeholder="Toutes les stratégies"
          />
          <FilterSelect
            value={filters.session ?? ""}
            onChange={(value) => setFilters((c) => ({ ...c, session: value || undefined }))}
            options={[...SESSIONS]}
            placeholder="Toutes les sessions"
          />
          <FilterSelect
            value={filters.result ?? "all"}
            onChange={(value) =>
              setFilters((c) => ({ ...c, result: (value || "all") as ResultFilter }))
            }
            options={["all", "win", "loss", "breakeven", "open"]}
            labels={{
              all: "Tous les résultats",
              win: "Gagnants",
              loss: "Perdants",
              breakeven: "Neutres",
              open: "Ouverts",
            }}
          />
          <FilterSelect
            value={filters.period ?? "all"}
            onChange={(value) =>
              setFilters((c) => ({ ...c, period: (value || "all") as PeriodFilter }))
            }
            options={["all", "week", "month"]}
            labels={{ all: "Toute la période", week: "Cette semaine", month: "Ce mois" }}
          />
          {Object.values(filters).some(Boolean) ? (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="text-subtle hover:text-fg text-xs"
            >
              Réinitialiser
            </button>
          ) : null}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Trades" value={String(stats.total)} sub={`${stats.open} ouverts`} />
        <Stat
          label="P&L net"
          value={stats.netPnl.toFixed(2)}
          tone={stats.netPnl > 0 ? "green" : stats.netPnl < 0 ? "red" : undefined}
        />
        <Stat
          label="Réussite"
          value={stats.closed === 0 ? "—" : `${stats.winRate} %`}
          sub={`${stats.wins}V / ${stats.losses}D`}
        />
        <Stat
          label="Facteur profit"
          value={stats.profitFactor === null ? "—" : stats.profitFactor.toFixed(2)}
          sub={stats.profitFactor === null ? "aucune perte" : undefined}
        />
        <Stat
          label="Espérance"
          value={stats.closed === 0 ? "—" : stats.expectancy.toFixed(2)}
          sub="par trade clôturé"
        />
        <Stat label="Pips" value={stats.totalPips.toFixed(1)} />
      </div>

      {formOpen ? (
        <TradeForm
          instruments={instruments}
          specs={specs}
          strategies={strategies}
          accounts={accounts}
          editing={editing}
          onDone={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      ) : null}

      <Card>
        {/* Sur `visible` : chaque vue lit l'ensemble filtré, jamais un autre. */}
        {tab === "analysis" ? (
          <AnalysisView trades={visible} periodLabel={periodLabel} history={analysisHistory} />
        ) : tab === "equity" ? (
          <EquityCurve trades={visible} accounts={accounts} />
        ) : tab === "list" ? (
          visible.length === 0 ? (
            <p className="text-subtle py-6 text-center text-sm">
              {trades.length === 0
                ? "Aucun trade enregistré."
                : "Aucun trade ne correspond à ces filtres."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-subtle border-border-app border-b">
                    {(
                      [
                        { id: "date", label: "Date" },
                        { id: "instrument", label: "Paire" },
                        { id: "pips", label: "Pips" },
                        { id: "pnl", label: "P&L" },
                      ] as const
                    ).map((column) => (
                      <th key={column.id} className="px-2 py-1.5 text-left font-semibold">
                        <button
                          type="button"
                          onClick={() => toggleSort(column.id)}
                          className="hover:text-fg flex items-center gap-0.5"
                        >
                          {column.label}
                          {sortColumn === column.id ? (
                            <Icon
                              name={sortDirection === "asc" ? "arrow_upward" : "arrow_downward"}
                              size={11}
                            />
                          ) : null}
                        </button>
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-left font-semibold">Stratégie</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Session</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((trade) => {
                    const full = trades.find((t) => t.id === trade.id)!;
                    return (
                      <tr
                        key={trade.id}
                        onClick={() => setSelected(full)}
                        className="border-border-app hover:bg-panel cursor-pointer border-b transition-colors"
                      >
                        <td className="text-muted px-2 py-1.5 font-mono">
                          {trade.openedAt.toISOString().slice(0, 10)}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="text-fg font-mono font-bold">{trade.instrument}</span>
                          <span
                            className={cn(
                              "ml-1.5 font-semibold",
                              trade.direction === "Buy" ? "text-brand-green" : "text-brand-red",
                            )}
                          >
                            {trade.direction === "Buy" ? "A" : "V"}
                          </span>
                          {isImported(trade.source) ? (
                            <Icon
                              name="sync"
                              size={11}
                              className="text-subtle ml-1 inline align-text-bottom"
                            />
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 font-mono",
                            trade.pips === null
                              ? "text-subtle"
                              : trade.pips > 0
                                ? "text-brand-green"
                                : trade.pips < 0
                                  ? "text-brand-red"
                                  : "text-muted",
                          )}
                        >
                          {trade.pips === null ? "—" : trade.pips.toFixed(1)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 font-mono font-bold",
                            trade.pnl === null
                              ? "text-subtle"
                              : trade.pnl > 0
                                ? "text-brand-green"
                                : trade.pnl < 0
                                  ? "text-brand-red"
                                  : "text-muted",
                          )}
                        >
                          {trade.pnl === null ? "ouvert" : trade.pnl.toFixed(2)}
                        </td>
                        <td className="text-muted px-2 py-1.5">{trade.strategy ?? "—"}</td>
                        <td className="text-muted px-2 py-1.5">{trade.session ?? "—"}</td>
                        <td className="px-2 py-1.5">
                          <Icon name="chevron_right" size={14} className="text-subtle" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <CalendarTab
            calendar={calendar}
            month={month}
            onMonth={setMonth}
            onSelect={(trade) => setSelected(trade)}
          />
        )}
      </Card>

      {selected ? (
        <TradeDetail
          trade={selected}
          onClose={() => setSelected(null)}
          onEdit={() => openForm(selected)}
          onDelete={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function CalendarTab({
  calendar,
  month,
  onMonth,
  onSelect,
}: {
  calendar: ReturnType<typeof monthCalendar>;
  month: Date;
  onMonth: (date: Date) => void;
  onSelect: (trade: TradeRow) => void;
}) {
  const [day, setDay] = useState<string | null>(null);
  const selectedCell = calendar.find((cell) => cell?.date === day) ?? null;

  function step(direction: -1 | 1) {
    const next = new Date(month);
    next.setUTCMonth(next.getUTCMonth() + direction);
    onMonth(next);
    setDay(null);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Mois précédent"
          className="text-subtle hover:text-fg"
        >
          <Icon name="chevron_left" size={18} />
        </button>
        <span className="text-fg min-w-40 text-center text-sm font-bold capitalize">
          {month.toLocaleDateString("fr-FR", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Mois suivant"
          className="text-subtle hover:text-fg"
        >
          <Icon name="chevron_right" size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map((name) => (
          <div key={name} className="text-subtle py-1 text-center text-[10px] font-bold uppercase">
            {name}
          </div>
        ))}

        {calendar.map((cell, index) =>
          cell === null ? (
            <div key={`blank-${index}`} />
          ) : (
            <button
              key={cell.date}
              type="button"
              onClick={() => setDay(cell.trades.length > 0 ? cell.date : null)}
              disabled={cell.trades.length === 0}
              className={cn(
                "min-h-14 rounded-lg border p-1 text-left transition-colors",
                cell.trades.length === 0
                  ? "border-border-app text-subtle"
                  : cell.pnl > 0
                    ? "border-brand-green/40 bg-brand-green/10"
                    : cell.pnl < 0
                      ? "border-brand-red/40 bg-brand-red/10"
                      : "border-border-app bg-panel",
                day === cell.date && "ring-brand-blue ring-2",
              )}
            >
              <span className="text-muted font-mono text-[10px]">{cell.day}</span>
              {cell.trades.length > 0 ? (
                <>
                  <p
                    className={cn(
                      "font-mono text-[11px] font-bold",
                      cell.pnl > 0
                        ? "text-brand-green"
                        : cell.pnl < 0
                          ? "text-brand-red"
                          : "text-muted",
                    )}
                  >
                    {cell.pnl > 0 ? "+" : ""}
                    {cell.pnl.toFixed(0)}
                  </p>
                  <p className="text-subtle text-[9px]">{cell.trades.length} trade(s)</p>
                </>
              ) : null}
            </button>
          ),
        )}
      </div>

      {selectedCell ? (
        <div className="border-border-app mt-3 border-t pt-3">
          <p className="text-subtle mb-2 text-[10px] font-bold tracking-widest uppercase">
            {selectedCell.date}
          </p>
          <ul className="space-y-1">
            {selectedCell.trades.map((trade) => (
              <li key={trade.id}>
                <button
                  type="button"
                  onClick={() => onSelect(trade as TradeRow)}
                  className="border-border-app hover:bg-panel flex w-full items-center gap-2 rounded-lg border p-2 text-xs"
                >
                  <span className="text-fg font-mono font-bold">{trade.instrument}</span>
                  <span
                    className={cn(
                      trade.direction === "Buy" ? "text-brand-green" : "text-brand-red",
                    )}
                  >
                    {trade.direction === "Buy" ? "Achat" : "Vente"}
                  </span>
                  <span
                    className={cn(
                      "ml-auto font-mono font-bold",
                      (trade.pnl ?? 0) > 0
                        ? "text-brand-green"
                        : (trade.pnl ?? 0) < 0
                          ? "text-brand-red"
                          : "text-subtle",
                    )}
                  >
                    {trade.pnl === null ? "ouvert" : trade.pnl.toFixed(2)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function TradeDetail({
  trade,
  onClose,
  onEdit,
  onDelete,
}: {
  trade: TradeRow;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`Fichier trop volumineux (maximum ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo)`);
      return;
    }

    const body = new FormData();
    body.set("tradeId", trade.id);
    body.set("file", file);

    startTransition(async () => {
      const result = await uploadTradeScreenshot(body);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Trade ${trade.instrument}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="bg-surface border-border-app max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-2xl"
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-fg font-mono text-lg font-bold">{trade.instrument}</span>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs font-bold",
              trade.direction === "Buy"
                ? "bg-brand-green/15 text-brand-green"
                : "bg-brand-red/15 text-brand-red",
            )}
          >
            {trade.direction === "Buy" ? "Achat" : "Vente"}
          </span>
          {isImported(trade.source) ? (
            <span className="text-subtle flex items-center gap-1 text-[11px]">
              <Icon name="sync" size={12} />
              {ORIGIN_LABELS[trade.source]}
            </span>
          ) : null}

          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="text-subtle hover:text-brand-blue"
              title="Modifier"
            >
              <Icon name="edit" size={16} />
            </button>
            {confirming ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await removeTrade(trade.id);
                      onDelete();
                    })
                  }
                  disabled={pending}
                  className="bg-brand-red/15 text-brand-red rounded px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-subtle hover:text-fg text-[11px]"
                >
                  Annuler
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-subtle hover:text-brand-red"
                title="Supprimer"
              >
                <Icon name="delete" size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="text-subtle hover:text-fg"
            >
              <Icon name="close" size={18} />
            </button>
          </span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Pips" value={trade.pips === null ? "—" : trade.pips.toFixed(1)} />
          <Stat
            label="P&L net"
            value={trade.pnl === null ? "ouvert" : trade.pnl.toFixed(2)}
            tone={
              trade.pnl === null ? undefined : trade.pnl > 0 ? "green" : trade.pnl < 0 ? "red" : undefined
            }
          />
          <Stat label="Lots" value={trade.lotSize.toFixed(2)} />
          <Stat label="Entrée" value={String(trade.entryPrice)} />
        </div>

        <dl className="mb-4 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
          <Row label="Ouvert" value={trade.openedAt.toISOString().slice(0, 16).replace("T", " ")} />
          <Row
            label="Clôturé"
            value={
              trade.closedAt
                ? trade.closedAt.toISOString().slice(0, 16).replace("T", " ")
                : "position ouverte"
            }
          />
          <Row label="Stop loss" value={trade.stopLoss === null ? "—" : String(trade.stopLoss)} />
          <Row
            label="Take profit"
            value={trade.takeProfit === null ? "—" : String(trade.takeProfit)}
          />
          <Row label="Sortie" value={trade.exitPrice === null ? "—" : String(trade.exitPrice)} />
          <Row label="Stratégie" value={trade.strategy ?? "—"} />
          <Row label="Type d'entrée" value={trade.entryType?.replace("_", " ") ?? "—"} />
          <Row label="Session" value={trade.session ?? "—"} />
          <Row label="Clôture" value={trade.closeType ?? "—"} />
          <Row label="Commission" value={trade.commission === null ? "—" : String(trade.commission)} />
          <Row label="Swap" value={trade.swap === null ? "—" : String(trade.swap)} />
          <Row
            label="Émotions"
            value={[trade.emotionBefore, trade.emotionAfter].filter(Boolean).join(" puis ") || "—"}
          />
        </dl>

        {trade.tags.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-1">
            {trade.tags.map((tag) => (
              <span key={tag} className="bg-panel text-muted rounded px-2 py-0.5 text-[11px]">
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {trade.notes ? (
          <div className="border-border-app mb-4 rounded-lg border p-3">
            <p className="text-subtle mb-1 text-[10px] font-bold tracking-widest uppercase">
              Notes
            </p>
            <p className="text-muted text-sm leading-relaxed whitespace-pre-line">{trade.notes}</p>
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-subtle text-[10px] font-bold tracking-widest uppercase">
              Captures ({trade.screenshots.length})
            </span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              className="text-subtle hover:text-brand-blue flex items-center gap-1 text-[11px] disabled:opacity-40"
            >
              <Icon
                name={pending ? "progress_activity" : "add_photo_alternate"}
                size={13}
                className={pending ? "animate-spin" : undefined}
              />
              Ajouter
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={upload}
          />

          {error ? <p className="text-brand-red mb-2 text-[11px]">{error}</p> : null}

          {trade.screenshots.length === 0 ? (
            <p className="text-subtle text-xs">Aucune capture.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {trade.screenshots.map((image) => (
                <div key={image.id} className="group relative">
                  <Image
                    src={image.url}
                    alt="Capture du trade"
                    width={160}
                    height={112}
                    unoptimized
                    className="border-border-app h-28 w-40 rounded-lg border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await deleteTradeScreenshot(image.id);
                        router.refresh();
                      })
                    }
                    className="bg-surface border-border-app text-subtle hover:text-brand-red absolute -top-1.5 -right-1.5 rounded-full border p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                    title="Supprimer"
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-subtle">{label}</dt>
      <dd className="text-muted font-mono">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="border-border-app bg-panel rounded-lg border p-2.5">
      <p className="text-subtle text-[10px] font-bold tracking-widest uppercase">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-lg font-black",
          tone === "green" ? "text-brand-green" : tone === "red" ? "text-brand-red" : "text-fg",
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-subtle text-[10px]">{sub}</p> : null}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  labels,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="bg-panel border-border-app text-muted focus:border-brand-blue rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none"
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option}
        </option>
      ))}
    </select>
  );
}
