"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { fetchConfig, persistConfig, removeConfig } from "@/app/(app)/indicateurs/actions";
import { Card, CardTitle, PageHeader } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import {
    CURRENCIES,
    CURRENCY_COLORS,
    EVENT_DEFAULT_TIME,
    EVENT_SHORT,
    generateJournalPine,
    generateNewsPine,
    JOURNAL_CATEGORIES,
    MAX_JOURNAL_ROWS,
    MAX_NEWS_ROWS,
    activeJournalRows,
    activeNewsRows,
    type Appreciation,
    type JournalRow,
    type NewsRow,
    type Sentiment,
} from "@/domain/pine/generator";
import type { SavedConfig, UpcomingRelease } from "@/lib/pine";
import { cn } from "@/lib/utils";

type Tab = "news" | "journal";

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptyNews(date = ""): NewsRow {
  return {
    id: uid(),
    enabled: true,
    date,
    time: "13:30",
    label: "",
    currency: "USD",
    color: CURRENCY_COLORS.USD!,
    width: 2,
  };
}

function emptyJournal(date = ""): JournalRow {
  return {
    id: uid(),
    enabled: true,
    date,
    time: "13:30",
    currency: "USD",
    category: "Fondamental",
    title: "",
    note: "",
    sentiment: "neutral",
    appreciation: "neutral",
  };
}

export function PineView({
  newsConfigs,
  journalConfigs,
  releases,
  today,
}: {
  newsConfigs: SavedConfig[];
  journalConfigs: SavedConfig[];
  releases: UpcomingRelease[];
  today: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("news");

  const [newsRows, setNewsRows] = useState<NewsRow[]>([emptyNews(today)]);
  const [journalRows, setJournalRows] = useState<JournalRow[]>([emptyJournal(today)]);

  const [configName, setConfigName] = useState("");
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Regenerated from state on every render rather than stored: the legacy
  // screen kept the code in state and refreshed it from an effect, so the
  // panel could show a script that no longer matched the rows above it.
  const code = useMemo(
    () =>
      tab === "news"
        ? generateNewsPine(newsRows, new Date(`${today}T12:00:00Z`))
        : generateJournalPine(journalRows),
    [tab, newsRows, journalRows, today],
  );

  const activeCount =
    tab === "news" ? activeNewsRows(newsRows).length : activeJournalRows(journalRows).length;

  const configs = tab === "news" ? newsConfigs : journalConfigs;
  const maxRows = tab === "news" ? MAX_NEWS_ROWS : MAX_JOURNAL_ROWS;
  const rowCount = tab === "news" ? newsRows.length : journalRows.length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("Copie impossible — sélectionnez le code et copiez-le manuellement.");
    }
  }

  function download() {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = tab === "news" ? "news-lines.pine" : "event-journal.pine";
    link.click();
    URL.revokeObjectURL(url);
  }

  function save() {
    const name = configName.trim();
    if (!name) {
      setNotice("Donnez un nom à la configuration.");
      return;
    }

    startTransition(async () => {
      try {
        await persistConfig({ kind: tab, name, rows: tab === "news" ? newsRows : journalRows });
        setNotice(`Configuration « ${name} » enregistrée.`);
        setConfigName("");
        router.refresh();
      } catch {
        setNotice("Enregistrement impossible.");
      }
    });
  }

  function load(configId: string) {
    startTransition(async () => {
      const config = await fetchConfig(configId);
      if (!config) return;

      if (config.kind === "news") setNewsRows(config.rows as NewsRow[]);
      else setJournalRows(config.rows as JournalRow[]);

      setNotice(`Configuration « ${config.name} » chargée.`);
    });
  }

  /** Pre-fills rows from the releases already scheduled this week. */
  function importReleases() {
    if (releases.length === 0) return;

    const rows = releases.slice(0, MAX_NEWS_ROWS).map((release) => ({
      ...emptyNews(release.date),
      time: EVENT_DEFAULT_TIME[release.key] ?? "13:30",
      label: `${release.currency} ${EVENT_SHORT[release.key] ?? release.key}`,
      currency: release.currency,
      color: CURRENCY_COLORS[release.currency] ?? "#90A4AE",
    }));

    setNewsRows(rows);
    setTab("news");
    setNotice(`${rows.length} publication(s) importée(s) depuis le calendrier.`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Indicateurs"
        subtitle="Générateur Pine Script — lignes verticales de news et journal contextuel sur TradingView"
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "news", label: "Lignes de news", icon: "timeline" },
              { id: "journal", label: "Journal contextuel", icon: "menu_book" },
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

          <span className="text-subtle ml-auto font-mono text-[11px]">
            {activeCount} / {rowCount} active(s) · max {maxRows}
          </span>
        </div>
      </Card>

      <Card className="border-brand-blue/30 bg-brand-blue/5">
        <div className="flex items-start gap-2.5">
          <Icon name="info" size={16} className="text-brand-blue mt-0.5 shrink-0" />
          <p className="text-muted text-sm leading-relaxed">
            Copiez le code généré, puis dans TradingView : <strong>Éditeur Pine</strong> →
            collez → <strong>Enregistrer</strong> → <strong>Ajouter au graphique</strong>. Les
            heures sont en <strong>UTC</strong> : un graphique réglé sur Paris affichera les
            lignes une ou deux heures plus tard selon la saison.
          </p>
        </div>
      </Card>

      {notice ? (
        <Card className="border-brand-green/30 bg-brand-green/5">
          <p className="text-muted flex items-center gap-2 text-sm">
            <Icon name="check_circle" size={15} className="text-brand-green" />
            {notice}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          {tab === "news" ? (
            <NewsEditor
              rows={newsRows}
              onChange={setNewsRows}
              today={today}
              releases={releases}
              onImport={importReleases}
            />
          ) : (
            <JournalEditor rows={journalRows} onChange={setJournalRows} today={today} />
          )}

          <Card>
            <CardTitle icon="bookmark">Configurations enregistrées</CardTitle>
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                value={configName}
                onChange={(event) => setConfigName(event.target.value)}
                placeholder="Nom de la configuration"
                className="bg-panel border-border-app text-fg focus:border-brand-blue flex-1 rounded-lg border px-3 py-1.5 text-xs focus:outline-none"
              />
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-40"
              >
                <Icon name="save" size={13} />
                Enregistrer
              </button>
            </div>

            {configs.length === 0 ? (
              <p className="text-subtle text-xs">
                Aucune configuration enregistrée pour cet onglet.
              </p>
            ) : (
              <ul className="space-y-1">
                {configs.map((config) => (
                  <li
                    key={config.id}
                    className="border-border-app flex items-center gap-2 rounded-lg border p-2 text-xs"
                  >
                    <span className="text-fg min-w-0 flex-1 truncate font-medium">
                      {config.name}
                    </span>
                    <span className="text-subtle font-mono text-[10px]">
                      {config.rowCount} ligne(s)
                    </span>
                    <button
                      type="button"
                      onClick={() => load(config.id)}
                      disabled={pending}
                      className="text-subtle hover:text-brand-blue disabled:opacity-40"
                      title="Charger"
                    >
                      <Icon name="upload_file" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          await removeConfig(config.id);
                          router.refresh();
                        })
                      }
                      disabled={pending}
                      className="text-subtle hover:text-brand-red disabled:opacity-40"
                      title="Supprimer"
                    >
                      <Icon name="delete" size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="flex flex-col">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <CardTitle icon="code" className="mb-0">
              Code Pine Script
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="text-subtle hover:text-brand-blue flex items-center gap-1 text-xs font-semibold"
              >
                <Icon name={copied ? "check" : "content_copy"} size={13} />
                {copied ? "Copié" : "Copier"}
              </button>
              <button
                type="button"
                onClick={download}
                className="text-subtle hover:text-brand-blue flex items-center gap-1 text-xs font-semibold"
              >
                <Icon name="download" size={13} />
                Télécharger
              </button>
            </div>
          </div>

          <pre className="bg-panel border-border-app max-h-[36rem] flex-1 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
            <code className="text-muted">{code}</code>
          </pre>

          <p className="text-subtle mt-2 text-[11px]">
            Regénéré à chaque modification — ce que vous voyez correspond toujours aux lignes
            ci-contre.
          </p>
        </Card>
      </div>
    </div>
  );
}

function NewsEditor({
  rows,
  onChange,
  today,
  releases,
  onImport,
}: {
  rows: NewsRow[];
  onChange: (rows: NewsRow[]) => void;
  today: string;
  releases: UpcomingRelease[];
  onImport: () => void;
}) {
  function patch(id: string, fields: Partial<NewsRow>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...fields } : row)));
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle icon="timeline" className="mb-0">
          Publications
        </CardTitle>
        <div className="flex items-center gap-2">
          {releases.length > 0 ? (
            <button
              type="button"
              onClick={onImport}
              className="text-brand-blue hover:text-brand-blue/80 flex items-center gap-1 text-xs font-semibold"
              title="Reprendre les dates déjà connues plutôt que de les retaper"
            >
              <Icon name="event_available" size={13} />
              Importer le calendrier ({releases.length})
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onChange([...rows, emptyNews(today)])}
            disabled={rows.length >= MAX_NEWS_ROWS}
            className="text-subtle hover:text-brand-blue flex items-center gap-1 text-xs font-semibold disabled:opacity-40"
          >
            <Icon name="add" size={13} />
            Ajouter
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className={cn(
              "border-border-app rounded-lg border p-2.5",
              !row.enabled && "opacity-50",
            )}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => patch(row.id, { enabled: !row.enabled })}
                className={cn(
                  "flex items-center gap-1 text-[11px] font-semibold",
                  row.enabled ? "text-brand-green" : "text-subtle",
                )}
              >
                <Icon name={row.enabled ? "check_box" : "check_box_outline_blank"} size={15} />
                Active
              </button>

              <select
                aria-label="Devise"
                value={row.currency}
                onChange={(event) =>
                  patch(row.id, {
                    currency: event.target.value,
                    color: CURRENCY_COLORS[event.target.value] ?? row.color,
                  })
                }
                className="bg-panel border-border-app text-fg rounded border px-2 py-1 font-mono text-xs"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>

              <CurrencyBadge code={row.currency} size="sm" />

              <span className="ml-auto flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11px]">
                  <span className="text-subtle">Épaisseur</span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    value={row.width}
                    onChange={(event) => patch(row.id, { width: Number(event.target.value) })}
                    className="w-16"
                    aria-label="Épaisseur du trait"
                  />
                  <span className="text-muted font-mono">{row.width}</span>
                </label>
                <input
                  type="color"
                  value={row.color}
                  onChange={(event) => patch(row.id, { color: event.target.value.toUpperCase() })}
                  className="border-border-app h-6 w-8 cursor-pointer rounded border bg-transparent"
                  aria-label="Couleur de la ligne"
                />
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                  className="text-subtle hover:text-brand-red"
                  title="Supprimer"
                >
                  <Icon name="delete" size={15} />
                </button>
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <input
                type="date"
                value={row.date}
                onChange={(event) => patch(row.id, { date: event.target.value })}
                aria-label="Date"
                className="bg-panel border-border-app text-fg focus:border-brand-blue rounded border px-2 py-1.5 font-mono text-xs focus:outline-none"
              />
              <input
                type="time"
                value={row.time}
                onChange={(event) => patch(row.id, { time: event.target.value })}
                aria-label="Heure UTC"
                className="bg-panel border-border-app text-fg focus:border-brand-blue rounded border px-2 py-1.5 font-mono text-xs focus:outline-none"
              />
              <input
                value={row.label}
                onChange={(event) => patch(row.id, { label: event.target.value })}
                placeholder="Libellé affiché"
                aria-label="Libellé"
                className="bg-panel border-border-app text-fg focus:border-brand-blue rounded border px-2 py-1.5 text-xs focus:outline-none sm:col-span-2"
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const SENTIMENTS: { value: Sentiment; label: string }[] = [
  { value: "bullish", label: "Haussier" },
  { value: "neutral", label: "Neutre" },
  { value: "bearish", label: "Baissier" },
];

const APPRECIATIONS: { value: Appreciation; label: string; icon: string }[] = [
  { value: "like", label: "Favorable", icon: "thumb_up" },
  { value: "neutral", label: "Neutre", icon: "remove" },
  { value: "dislike", label: "Défavorable", icon: "thumb_down" },
];

function JournalEditor({
  rows,
  onChange,
  today,
}: {
  rows: JournalRow[];
  onChange: (rows: JournalRow[]) => void;
  today: string;
}) {
  function patch(id: string, fields: Partial<JournalRow>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...fields } : row)));
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardTitle icon="menu_book" className="mb-0">
          Événements
        </CardTitle>
        <button
          type="button"
          onClick={() => onChange([...rows, emptyJournal(today)])}
          disabled={rows.length >= MAX_JOURNAL_ROWS}
          className="text-subtle hover:text-brand-blue flex items-center gap-1 text-xs font-semibold disabled:opacity-40"
        >
          <Icon name="add" size={13} />
          Ajouter
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className={cn(
              "border-border-app rounded-lg border p-2.5",
              !row.enabled && "opacity-50",
            )}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => patch(row.id, { enabled: !row.enabled })}
                className={cn(
                  "flex items-center gap-1 text-[11px] font-semibold",
                  row.enabled ? "text-brand-green" : "text-subtle",
                )}
              >
                <Icon name={row.enabled ? "check_box" : "check_box_outline_blank"} size={15} />
                Actif
              </button>

              <select
                aria-label="Devise"
                value={row.currency}
                onChange={(event) => patch(row.id, { currency: event.target.value })}
                className="bg-panel border-border-app text-fg rounded border px-2 py-1 font-mono text-xs"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>

              <select
                aria-label="Catégorie"
                value={row.category}
                onChange={(event) => patch(row.id, { category: event.target.value })}
                className="bg-panel border-border-app text-fg rounded border px-2 py-1 text-xs"
              >
                {JOURNAL_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                className="text-subtle hover:text-brand-red ml-auto"
                title="Supprimer"
              >
                <Icon name="delete" size={15} />
              </button>
            </div>

            <div className="mb-2 grid gap-2 sm:grid-cols-4">
              <input
                type="date"
                value={row.date}
                onChange={(event) => patch(row.id, { date: event.target.value })}
                aria-label="Date"
                className="bg-panel border-border-app text-fg focus:border-brand-blue rounded border px-2 py-1.5 font-mono text-xs focus:outline-none"
              />
              <input
                type="time"
                value={row.time}
                onChange={(event) => patch(row.id, { time: event.target.value })}
                aria-label="Heure UTC"
                className="bg-panel border-border-app text-fg focus:border-brand-blue rounded border px-2 py-1.5 font-mono text-xs focus:outline-none"
              />
              <input
                value={row.title}
                onChange={(event) => patch(row.id, { title: event.target.value })}
                placeholder="Titre de l'événement"
                aria-label="Titre"
                className="bg-panel border-border-app text-fg focus:border-brand-blue rounded border px-2 py-1.5 text-xs focus:outline-none sm:col-span-2"
              />
            </div>

            <input
              value={row.note}
              onChange={(event) => patch(row.id, { note: event.target.value })}
              placeholder="Note contextuelle (tronquée à 120 caractères sur le graphique)"
              aria-label="Note"
              className="bg-panel border-border-app text-fg focus:border-brand-blue mb-2 w-full rounded border px-2 py-1.5 text-xs focus:outline-none"
            />

            <div className="flex flex-wrap gap-3">
              <div className="flex gap-1">
                {SENTIMENTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => patch(row.id, { sentiment: option.value })}
                    className={cn(
                      "rounded border px-2 py-1 text-[11px] font-semibold transition-colors",
                      row.sentiment === option.value
                        ? option.value === "bullish"
                          ? "border-brand-green/40 bg-brand-green/10 text-brand-green"
                          : option.value === "bearish"
                            ? "border-brand-red/40 bg-brand-red/10 text-brand-red"
                            : "border-border-app bg-panel text-muted"
                        : "border-border-app text-subtle hover:text-fg",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-1">
                {APPRECIATIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => patch(row.id, { appreciation: option.value })}
                    title={option.label}
                    className={cn(
                      "flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors",
                      row.appreciation === option.value
                        ? "border-brand-blue/40 bg-brand-blue/10 text-brand-blue"
                        : "border-border-app text-subtle hover:text-fg",
                    )}
                  >
                    <Icon name={option.icon} size={12} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
