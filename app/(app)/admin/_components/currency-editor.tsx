"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  resetCurrencyOverrides,
  saveCurrencyNote,
  saveIndicatorOverrides,
} from "@/app/(app)/admin/actions";
import { Card } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { Icon } from "@/components/ui/icon";
import { isFreeOfficialSource } from "@/app/(app)/devise/[code]/_lib/data-source-flag";
import type { CentralBankStance } from "@/domain/types";
import { scoreTextClass } from "@/lib/score-display";
import { cn } from "@/lib/utils";

export interface EditableField {
  key: string;
  label: string;
  unit: string;
  step: string;
  /** Resolved value currently used by the scoring engine. */
  value: number | null;
  /** True when this value comes from a manual override rather than an API. */
  overridden: boolean;
  /** Value the API would supply, shown so the user can see what they replaced. */
  sourceValue: number | null;
  /**
   * Publication date currently in force, "AAAA-MM-JJ" — the period the reading
   * describes. The source's own, unless the administrator has replaced it.
   */
  period: string | null;
  /** True when that date is the administrator's rather than the source's. */
  periodOverridden: boolean;
  /** Next expected publication, "AAAA-MM-JJ" — normally a future date. */
  nextRelease: string | null;
  /** True when that date is the administrator's rather than the provider's. */
  nextReleaseOverridden: boolean;
  /** Raw source tag behind the current value ("ONS", "FXMACRODATA", "MANUAL"...). */
  source: string | null;
}

export interface CurrencyEditorData {
  code: string;
  name: string;
  score: number;
  stance: CentralBankStance;
  geopoliticalRisks: string;
  qualitativeAnalysis: string;
  eventsToWatch: string[];
  fields: EditableField[];
}

const STANCES: CentralBankStance[] = [
  "Very Hawkish",
  "Hawkish",
  "Neutral",
  "Dovish",
  "Very Dovish",
];

const STANCE_FR: Record<CentralBankStance, string> = {
  "Very Hawkish": "Très restrictive",
  Hawkish: "Restrictive",
  Neutral: "Neutre",
  Dovish: "Accommodante",
  "Very Dovish": "Très accommodante",
};

export function CurrencyEditor({
  data,
  today,
  releaseCeiling,
}: {
  data: CurrencyEditorData;
  today: string;
  /** Furthest a next-release date may be set — the same bound the server enforces. */
  releaseCeiling: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Only fields the user actually touches are sent. Submitting every field
  // would create an override for each one, silently pinning values that were
  // never edited and freezing them against future API refreshes.
  const [edits, setEdits] = useState<Record<string, string>>({});
  /** Publication dates the user has touched, keyed the same way as `edits`. */
  const [dateEdits, setDateEdits] = useState<Record<string, string>>({});
  /** Next-release dates the user has touched. */
  const [releaseEdits, setReleaseEdits] = useState<Record<string, string>>({});
  const [stance, setStance] = useState<CentralBankStance>(data.stance);
  const [geo, setGeo] = useState(data.geopoliticalRisks);
  const [analysis, setAnalysis] = useState(data.qualitativeAnalysis);
  const [events, setEvents] = useState(data.eventsToWatch.join("\n"));

  const noteDirty =
    stance !== data.stance ||
    geo !== data.geopoliticalRisks ||
    analysis !== data.qualitativeAnalysis ||
    events !== data.eventsToWatch.join("\n");

  const dirty =
    Object.keys(edits).length > 0 ||
    Object.keys(dateEdits).length > 0 ||
    Object.keys(releaseEdits).length > 0 ||
    noteDirty;

  function save() {
    startTransition(async () => {
      try {
        const values: Record<string, number | null> = {};
        for (const [key, raw] of Object.entries(edits)) {
          if (raw.trim() === "") {
            values[key] = null; // cleared -> hand the field back to the API
          } else {
            const parsed = Number.parseFloat(raw);
            if (Number.isFinite(parsed)) values[key] = parsed;
          }
        }

        // Changing only a date still needs the value sent, because an override
        // row carries all three: without the value the server would have
        // nothing to upsert and the dates would be dropped on the floor.
        for (const key of [...Object.keys(dateEdits), ...Object.keys(releaseEdits)]) {
          if (key in values) continue;
          const current = data.fields.find((f) => f.key === key)?.value;
          if (typeof current === "number") values[key] = current;
        }

        // An untouched date must not be sent at all: sending the displayed
        // value would freeze the source's own date into the override the first
        // time anything else on that row changed.
        const periods: Record<string, string | null> = {};
        for (const [key, raw] of Object.entries(dateEdits)) {
          periods[key] = raw.trim() === "" ? null : raw;
        }

        const releases: Record<string, string | null> = {};
        for (const [key, raw] of Object.entries(releaseEdits)) {
          releases[key] = raw.trim() === "" ? null : raw;
        }

        if (Object.keys(values).length > 0) {
          await saveIndicatorOverrides({ code: data.code, values, periods, releases });
        }

        if (noteDirty) {
          await saveCurrencyNote({
            code: data.code,
            stance,
            geopoliticalRisks: geo,
            qualitativeAnalysis: analysis,
            eventsToWatch: events.split("\n").map((e) => e.trim()).filter(Boolean),
          });
        }

        setEdits({});
        setDateEdits({});
        setReleaseEdits({});
        setStatus("Enregistré");
        router.refresh();
      } catch (error) {
        // The server's own message when it refused a date names the indicator
        // and the rule broken, which "Échec" cannot.
        setStatus(error instanceof Error ? error.message : "Échec de l'enregistrement");
      }
    });
  }

  function reset() {
    startTransition(async () => {
      try {
        const { removed } = await resetCurrencyOverrides(data.code);
        setEdits({});
        setDateEdits({});
        setReleaseEdits({});
        setStatus(
          removed > 0
            ? `${removed} correction(s) supprimée(s)`
            : "Aucune correction à supprimer",
        );
        router.refresh();
      } catch {
        setStatus("Échec de la réinitialisation");
      }
    });
  }

  const overriddenCount = data.fields.filter((f) => f.overridden).length;

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="hover:bg-panel flex w-full items-center gap-3 p-4 text-left transition-colors"
      >
        <CurrencyBadge code={data.code} />
        <span className="text-fg flex-1 text-sm font-semibold">{data.name}</span>

        {overriddenCount > 0 ? (
          <span className="text-brand-amber border-brand-amber/30 bg-brand-amber/10 rounded border px-1.5 py-0.5 font-mono text-[10px]">
            {overriddenCount} manuel{overriddenCount > 1 ? "s" : ""}
          </span>
        ) : null}

        <span className={cn("tabular font-mono text-sm font-bold", scoreTextClass(data.score))}>
          {data.score}
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} size={18} className="text-subtle" />
      </button>

      {open ? (
        <div className="border-border-app space-y-5 border-t p-4">
          <div>
            <p className="text-subtle mb-2 font-mono text-[10px] tracking-widest uppercase">
              Indicateurs
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.fields.map((field) => {
                const edited = field.key in edits;
                const dateEdited = field.key in dateEdits;
                const releaseEdited = field.key in releaseEdits;
                const shown = edited ? edits[field.key]! : (field.value?.toString() ?? "");

                return (
                  <div key={field.key}>
                    <label
                      htmlFor={`${data.code}-${field.key}`}
                      className="text-muted mb-1 flex items-center gap-1.5 text-xs"
                    >
                      <span
                        title={
                          isFreeOfficialSource(field.source)
                            ? `Source officielle gratuite : ${field.source}`
                            : field.source
                              ? `Source payante ou non officielle : ${field.source}`
                              : "Aucune source connectée — saisie manuelle requise"
                        }
                        className={cn(
                          "inline-block size-1.5 shrink-0 rounded-full",
                          isFreeOfficialSource(field.source) ? "bg-brand-blue" : "bg-brand-red",
                        )}
                      />
                      {field.label}
                      {field.unit ? (
                        <span className="text-subtle">({field.unit})</span>
                      ) : null}
                      {field.overridden ? (
                        <span
                          className="text-brand-amber"
                          title={`Valeur manuelle. Source : ${field.sourceValue ?? "aucune"}`}
                        >
                          <Icon name="edit" size={11} />
                        </span>
                      ) : null}
                    </label>
                    <input
                      id={`${data.code}-${field.key}`}
                      type="number"
                      step={field.step}
                      value={shown}
                      placeholder="—"
                      onChange={(e) =>
                        setEdits((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className={cn(
                        "bg-panel border-border-app text-fg focus:border-brand-blue tabular w-full rounded-lg border px-2.5 py-1.5 font-mono text-sm outline-none",
                        edited && "border-brand-blue",
                      )}
                    />
                    <div className="mt-1 flex items-center gap-1">
                      <Icon
                        name="event"
                        size={11}
                        className={field.periodOverridden ? "text-brand-amber" : "text-subtle"}
                      />
                      <input
                        type="date"
                        aria-label={`Date de publication — ${field.label}`}
                        value={dateEdited ? dateEdits[field.key]! : (field.period ?? "")}
                        max={today}
                        onChange={(e) =>
                          setDateEdits((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className={cn(
                          "bg-panel border-border-app text-muted focus:border-brand-blue tabular w-full rounded-md border px-1.5 py-1 font-mono text-[11px] outline-none",
                          dateEdited && "border-brand-blue text-fg",
                        )}
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <Icon
                        name="event_upcoming"
                        size={11}
                        className={field.nextReleaseOverridden ? "text-brand-amber" : "text-subtle"}
                      />
                      <input
                        type="date"
                        aria-label={`Prochaine publication — ${field.label}`}
                        value={releaseEdited ? releaseEdits[field.key]! : (field.nextRelease ?? "")}
                        max={releaseCeiling}
                        onChange={(e) =>
                          setReleaseEdits((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className={cn(
                          "bg-panel border-border-app text-muted focus:border-brand-blue tabular w-full rounded-md border px-1.5 py-1 font-mono text-[11px] outline-none",
                          releaseEdited && "border-brand-blue text-fg",
                        )}
                      />
                    </div>
                    {field.overridden && field.sourceValue !== null ? (
                      <p className="text-subtle mt-0.5 font-mono text-[10px]">
                        API : {field.sourceValue}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="text-subtle mt-2 text-[11px]">
              Vider un champ supprime la correction manuelle et redonne la main à la donnée API. La
              première date sous chaque valeur est celle de la <strong>publication</strong> — la
              période que le chiffre décrit, jamais dans le futur. La seconde{" "}
              <span className="text-subtle">(icône calendrier fléché)</span> est la{" "}
              <strong>prochaine publication attendue</strong>, elle, normalement à venir. Vider
              l&apos;une ou l&apos;autre rend la date de la source.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div>
              <label
                htmlFor={`${data.code}-stance`}
                className="text-muted mb-1 block text-xs"
              >
                Orientation banque centrale
              </label>
              <select
                id={`${data.code}-stance`}
                value={stance}
                onChange={(e) => setStance(e.target.value as CentralBankStance)}
                className="bg-panel border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none"
              >
                {STANCES.map((s) => (
                  <option key={s} value={s}>
                    {STANCE_FR[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label htmlFor={`${data.code}-events`} className="text-muted mb-1 block text-xs">
                Événements à surveiller (un par ligne)
              </label>
              <textarea
                id={`${data.code}-events`}
                rows={3}
                value={events}
                onChange={(e) => setEvents(e.target.value)}
                className="bg-panel border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <label htmlFor={`${data.code}-geo`} className="text-muted mb-1 block text-xs">
                Risques géopolitiques
              </label>
              <textarea
                id={`${data.code}-geo`}
                rows={4}
                value={geo}
                onChange={(e) => setGeo(e.target.value)}
                className="bg-panel border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none"
              />
            </div>
            <div>
              <label
                htmlFor={`${data.code}-analysis`}
                className="text-muted mb-1 block text-xs"
              >
                Analyse qualitative
              </label>
              <textarea
                id={`${data.code}-analysis`}
                rows={4}
                value={analysis}
                onChange={(e) => setAnalysis(e.target.value)}
                className="bg-panel border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none"
              />
            </div>
          </div>

          <div className="border-border-app flex flex-wrap items-center gap-3 border-t pt-3">
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="check" size={14} /> Enregistrer
            </button>

            <button
              type="button"
              onClick={reset}
              disabled={pending || overriddenCount === 0}
              className="border-border-app text-muted hover:text-brand-red hover:border-brand-red/30 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="restart_alt" size={14} /> Supprimer les corrections
            </button>

            {status ? (
              <span role="status" className="text-subtle text-xs">
                {status}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
