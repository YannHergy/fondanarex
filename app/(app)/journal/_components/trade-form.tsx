"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createStrategy, saveTrade } from "@/app/(app)/journal/actions";
import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  CLOSE_TYPES,
  EMOTIONS_AFTER,
  EMOTIONS_BEFORE,
  SESSIONS,
} from "@/domain/journal/filters";
import {
  netPnl,
  plannedRR,
  realisedRR,
  stopAndTargetSane,
  tradePips,
  tradePnl,
} from "@/domain/journal/trade-math";
import type { InstrumentSpec } from "@/domain/risk/position";
import type { AccountOption, TradeRow } from "@/lib/journal";
import { cn } from "@/lib/utils";

interface FormState {
  instrument: string;
  direction: "Buy" | "Sell";
  accountId: string;
  openedAt: string;
  closedAt: string;
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  takeProfit: string;
  lotSize: string;
  commission: string;
  swap: string;
  strategy: string;
  entryType: string;
  session: string;
  closeType: string;
  emotionBefore: string;
  emotionAfter: string;
  notes: string;
  tags: string;
}

function localNow(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function toLocalInput(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 16);
}

function emptyForm(instrument: string): FormState {
  return {
    instrument,
    direction: "Buy",
    accountId: "",
    openedAt: localNow(),
    closedAt: "",
    entryPrice: "",
    exitPrice: "",
    stopLoss: "",
    takeProfit: "",
    lotSize: "0.10",
    commission: "",
    swap: "",
    strategy: "",
    entryType: "",
    session: "",
    closeType: "",
    emotionBefore: "",
    emotionAfter: "",
    notes: "",
    tags: "",
  };
}

function fromTrade(trade: TradeRow): FormState {
  return {
    instrument: trade.instrument,
    direction: trade.direction,
    accountId: trade.accountId ?? "",
    openedAt: toLocalInput(trade.openedAt),
    closedAt: toLocalInput(trade.closedAt),
    entryPrice: String(trade.entryPrice),
    exitPrice: trade.exitPrice === null ? "" : String(trade.exitPrice),
    stopLoss: trade.stopLoss === null ? "" : String(trade.stopLoss),
    takeProfit: trade.takeProfit === null ? "" : String(trade.takeProfit),
    lotSize: String(trade.lotSize),
    commission: trade.commission === null ? "" : String(trade.commission),
    swap: trade.swap === null ? "" : String(trade.swap),
    strategy: trade.strategy ?? "",
    entryType: trade.entryType ?? "",
    session: trade.session ?? "",
    closeType: trade.closeType ?? "",
    emotionBefore: trade.emotionBefore ?? "",
    emotionAfter: trade.emotionAfter ?? "",
    notes: trade.notes ?? "",
    tags: trade.tags.join(", "),
  };
}

const numberOrNull = (value: string): number | null => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function TradeForm({
  instruments,
  specs,
  strategies,
  accounts,
  editing,
  onDone,
}: {
  instruments: string[];
  specs: Record<string, InstrumentSpec>;
  strategies: string[];
  accounts: AccountOption[];
  editing: TradeRow | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<FormState>(() =>
    editing ? fromTrade(editing) : emptyForm(instruments[0] ?? "EUR/USD"),
  );
  const [error, setError] = useState<string | null>(null);
  const [newStrategy, setNewStrategy] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  // Memoised so the fallback object is not a new identity on every render,
  // which would recompute the preview continuously.
  const spec = useMemo(
    () =>
      specs[form.instrument] ?? {
        symbol: form.instrument,
        pipSize: 0.0001,
        contractSize: 100_000,
      },
    [specs, form.instrument],
  );

  /**
   * Live preview computed with the same functions the server writes with, so
   * the numbers shown before saving are the numbers stored.
   */
  const preview = useMemo(() => {
    const entry = numberOrNull(form.entryPrice);
    const exit = numberOrNull(form.exitPrice);
    const lots = numberOrNull(form.lotSize);
    if (entry === null || lots === null) return null;

    const pips = tradePips(form.direction, entry, exit, spec);
    const gross = tradePnl(pips, lots, spec);

    return {
      pips,
      net: netPnl(gross, numberOrNull(form.commission), numberOrNull(form.swap)),
      plannedRR: plannedRR(
        form.direction,
        entry,
        numberOrNull(form.stopLoss),
        numberOrNull(form.takeProfit),
        spec,
      ),
      realisedRR: realisedRR(form.direction, entry, exit, numberOrNull(form.stopLoss), spec),
      sanity: stopAndTargetSane(
        form.direction,
        entry,
        numberOrNull(form.stopLoss),
        numberOrNull(form.takeProfit),
      ),
      closed: exit !== null,
    };
  }, [form, spec]);

  function submit() {
    setError(null);

    startTransition(async () => {
      try {
        await saveTrade({
          id: editing?.id,
          accountId: form.accountId || null,
          instrument: form.instrument,
          direction: form.direction,
          openedAt: form.openedAt,
          closedAt: form.closedAt || null,
          entryPrice: numberOrNull(form.entryPrice),
          exitPrice: numberOrNull(form.exitPrice),
          stopLoss: numberOrNull(form.stopLoss),
          takeProfit: numberOrNull(form.takeProfit),
          lotSize: numberOrNull(form.lotSize),
          commission: numberOrNull(form.commission),
          swap: numberOrNull(form.swap),
          strategy: form.strategy || null,
          entryType: form.entryType || null,
          session: form.session || null,
          closeType: form.closeType || null,
          emotionBefore: form.emotionBefore || null,
          emotionAfter: form.emotionAfter || null,
          notes: form.notes || null,
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        });

        router.refresh();
        onDone();
      } catch (cause) {
        setError(readableError(cause));
      }
    });
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardTitle icon={editing ? "edit" : "add_circle"} className="mb-0">
          {editing ? "Modifier le trade" : "Nouveau trade"}
        </CardTitle>
        <button type="button" onClick={onDone} className="text-subtle hover:text-fg text-xs">
          Annuler
        </button>
      </div>

      {editing?.source === "metaapi" ? (
        <p className="text-brand-amber mb-3 flex items-start gap-1.5 text-xs">
          <Icon name="sync" size={13} className="mt-0.5 shrink-0" />
          Trade synchronisé depuis MetaTrader. Les prix et dates seront écrasés au prochain
          import — vos annotations, elles, sont conservées.
        </p>
      ) : null}

      {editing?.source === "mt5" ? (
        <p className="text-brand-amber mb-3 flex items-start gap-1.5 text-xs">
          <Icon name="sync" size={13} className="mt-0.5 shrink-0" />
          Trade importé d&apos;un rapport MetaTrader. Un réimport ne le touchera pas : vos
          modifications et annotations sont définitives.
        </p>
      ) : null}

      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <Select
            label="Paire"
            value={form.instrument}
            onChange={(value) => set("instrument", value)}
            options={instruments}
          />
          <div>
            <Label>Sens</Label>
            <div className="border-border-app flex overflow-hidden rounded-lg border">
              {(["Buy", "Sell"] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  onClick={() => set("direction", direction)}
                  className={cn(
                    "flex-1 py-2 text-xs font-bold transition-colors",
                    form.direction === direction
                      ? direction === "Buy"
                        ? "bg-brand-green/15 text-brand-green"
                        : "bg-brand-red/15 text-brand-red"
                      : "text-subtle hover:text-fg",
                  )}
                >
                  {direction === "Buy" ? "Achat" : "Vente"}
                </button>
              ))}
            </div>
          </div>
          <Select
            label="Compte"
            value={form.accountId}
            onChange={(value) => set("accountId", value)}
            options={accounts.map((account) => account.id)}
            labels={Object.fromEntries(accounts.map((a) => [a.id, a.name]))}
            allowEmpty="Aucun"
          />
          <Field
            label="Lots"
            type="number"
            value={form.lotSize}
            onChange={(value) => set("lotSize", value)}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Field
            label="Entrée"
            type="datetime-local"
            value={form.openedAt}
            onChange={(value) => set("openedAt", value)}
          />
          <Field
            label="Sortie"
            type="datetime-local"
            value={form.closedAt}
            onChange={(value) => set("closedAt", value)}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <Field
            label="Prix d'entrée"
            type="number"
            value={form.entryPrice}
            onChange={(value) => set("entryPrice", value)}
          />
          <Field
            label="Stop loss"
            type="number"
            value={form.stopLoss}
            onChange={(value) => set("stopLoss", value)}
            invalid={preview ? !preview.sanity.stopOk : false}
            hint={preview && !preview.sanity.stopOk ? "Du mauvais côté de l'entrée" : undefined}
          />
          <Field
            label="Take profit"
            type="number"
            value={form.takeProfit}
            onChange={(value) => set("takeProfit", value)}
            invalid={preview ? !preview.sanity.targetOk : false}
            hint={preview && !preview.sanity.targetOk ? "Du mauvais côté de l'entrée" : undefined}
          />
          <Field
            label="Prix de sortie"
            type="number"
            value={form.exitPrice}
            onChange={(value) => set("exitPrice", value)}
          />
        </div>

        {preview ? (
          <div className="border-border-app bg-panel flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border p-3 text-xs">
            <Metric
              label="Pips"
              value={preview.closed ? preview.pips.toFixed(1) : "—"}
              tone={preview.pips > 0 ? "green" : preview.pips < 0 ? "red" : undefined}
            />
            <Metric
              label="P&L net"
              value={preview.closed ? preview.net.toFixed(2) : "—"}
              tone={preview.net > 0 ? "green" : preview.net < 0 ? "red" : undefined}
            />
            <Metric
              label="RR prévu"
              value={preview.plannedRR === null ? "—" : `${preview.plannedRR.toFixed(2)}`}
            />
            <Metric
              label="RR réalisé"
              value={preview.realisedRR === null ? "—" : `${preview.realisedRR.toFixed(2)}`}
            />
            <span className="text-subtle ml-auto">
              1 pip = {(spec.pipSize * spec.contractSize).toFixed(2)} /lot
            </span>
          </div>
        ) : null}

        {/*
          « Type d'entrée » a été retiré d'ici.

          C'était une seconde liste, figée dans le code (M1, M2, A11, A12, A2,
          A21, A22, GOLDEN), posée juste à côté de « Setup » — deux champs qui
          désignent la même chose pour qui remplit le formulaire, dont un seul
          était lu par les statistiques. Le piège s'est refermé exactement comme
          on pouvait le craindre : deux trades ont été étiquetés M2 et M1 dans
          « Type d'entrée », et l'application a continué d'annoncer « aucun
          setup enregistré ».

          La colonne reste en base et s'affiche encore sur les trades qui la
          portent : les anciennes saisies ne disparaissent pas. Elle n'est
          simplement plus proposée, et son contenu a été repris dans `strategy`.
        */}
        <div className="grid gap-2 sm:grid-cols-4">
          <Select
            label="Setup"
            value={form.strategy}
            onChange={(value) => set("strategy", value)}
            options={strategies}
            allowEmpty="—"
          />
          <Select
            label="Session"
            value={form.session}
            onChange={(value) => set("session", value)}
            options={[...SESSIONS]}
            allowEmpty="—"
          />
          <Select
            label="Clôture"
            value={form.closeType}
            onChange={(value) => set("closeType", value)}
            options={[...CLOSE_TYPES]}
            allowEmpty="—"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <Select
            label="Émotion avant"
            value={form.emotionBefore}
            onChange={(value) => set("emotionBefore", value)}
            options={[...EMOTIONS_BEFORE]}
            allowEmpty="—"
          />
          <Select
            label="Émotion après"
            value={form.emotionAfter}
            onChange={(value) => set("emotionAfter", value)}
            options={[...EMOTIONS_AFTER]}
            allowEmpty="—"
          />
          <Field
            label="Commission"
            type="number"
            value={form.commission}
            onChange={(value) => set("commission", value)}
          />
          <Field
            label="Swap"
            type="number"
            value={form.swap}
            onChange={(value) => set("swap", value)}
          />
        </div>

        <Field
          label="Tags (séparés par des virgules)"
          value={form.tags}
          onChange={(value) => set("tags", value)}
        />

        <div>
          <Label>Notes</Label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="Pourquoi cette entrée, ce qui s'est passé, ce que vous refaites ou non"
            className="bg-panel border-border-app text-fg focus:border-brand-blue w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newStrategy}
            onChange={(event) => setNewStrategy(event.target.value)}
            placeholder="Nouvelle stratégie"
            className="bg-panel border-border-app text-fg focus:border-brand-blue rounded-lg border px-3 py-1.5 text-xs focus:outline-none"
          />
          <button
            type="button"
            disabled={!newStrategy.trim() || pending}
            onClick={() =>
              startTransition(async () => {
                await createStrategy(newStrategy.trim());
                set("strategy", newStrategy.trim());
                setNewStrategy("");
                router.refresh();
              })
            }
            className="text-subtle hover:text-brand-blue text-xs font-semibold disabled:opacity-40"
          >
            Ajouter
          </button>

          {error ? <span className="text-brand-red ml-auto text-xs">{error}</span> : null}

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="bg-brand-blue hover:bg-brand-blue/90 ml-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
          >
            <Icon
              name={pending ? "progress_activity" : "save"}
              size={15}
              className={pending ? "animate-spin" : undefined}
            />
            {pending ? "Enregistrement…" : editing ? "Mettre à jour" : "Enregistrer"}
          </button>
        </div>
      </div>
    </Card>
  );
}

/** Turns a Zod issue list into the first message a user can act on. */
function readableError(cause: unknown): string {
  if (cause && typeof cause === "object" && "issues" in cause) {
    const issues = (cause as { issues?: { message?: string }[] }).issues;
    if (issues?.[0]?.message) return issues[0].message;
  }
  return cause instanceof Error ? cause.message : "Enregistrement impossible";
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-subtle mb-1.5 block text-[10px] font-bold tracking-widest uppercase">
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  invalid,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  invalid?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "bg-panel text-fg w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none",
          invalid ? "border-brand-red" : "border-border-app focus:border-brand-blue",
        )}
      />
      {hint ? <p className="text-brand-red mt-1 text-[10px]">{hint}</p> : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  labels,
  allowEmpty,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labels?: Record<string, string>;
  allowEmpty?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-panel border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
      >
        {allowEmpty !== undefined ? <option value="">{allowEmpty}</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-subtle text-[10px] tracking-widest uppercase">{label}</span>
      <span
        className={cn(
          "font-mono font-bold",
          tone === "green" ? "text-brand-green" : tone === "red" ? "text-brand-red" : "text-fg",
        )}
      >
        {value}
      </span>
    </span>
  );
}
