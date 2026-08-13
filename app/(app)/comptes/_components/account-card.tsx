"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { adjustAccountCapital, saveTradingAccount } from "@/app/(app)/comptes/actions";
import { DeleteAccountButton } from "@/app/(app)/comptes/_components/add-account";
import {
  ConnectAccount,
  type MetaApiLink,
} from "@/app/(app)/comptes/_components/connect-account";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  accountHealth,
  drawdownRemaining,
  drawdownUsedPct,  riskPerTrade,  targetProgressPct,
  tradesUntilBreach,} from "@/domain/accounts/metrics";
import {
  alertVerdict,
  journalExpectancyPct,
  type JournalMetrics,
} from "@/domain/accounts/journal-metrics";
import type { TradingAccountRow } from "@/lib/accounts";
import { cn } from "@/lib/utils";

const money = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
const money2 = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

const HEALTH_STYLE = {
  healthy: { label: "Sain", className: "text-brand-green border-brand-green/40 bg-brand-green/10" },
  warning: { label: "Vigilance", className: "text-brand-amber border-brand-amber/40 bg-brand-amber/10" },
  critical: { label: "Critique", className: "text-brand-red border-brand-red/40 bg-brand-red/10" },
  breached: { label: "Dépassé", className: "text-white border-brand-red bg-brand-red" },
} as const;

export function AccountCard({
  account,
  metaApiLink = null,
  metaApiEnabled = false,
  userSetups,
  metrics,
}: {
  account: TradingAccountRow;
  /** Setups déclarés par le trader — remplacent la taxonomie figée. */
  userSetups: string[];
  /** Chiffres mesurés sur SON journal, pour les setups de ce compte. */
  metrics: JournalMetrics;
  /** Connexion MetaApi rattachée à ce compte, quand il y en a une. */
  metaApiLink?: MetaApiLink | null;
  metaApiEnabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account);
  const [delta, setDelta] = useState("");

  const health = accountHealth(account);
  const style = HEALTH_STYLE[health];
  const risk = riskPerTrade(account);
  const usedPct = drawdownUsedPct(account);
  const remaining = drawdownRemaining(account);
  const untilBreach = tradesUntilBreach(account);
  const progress = targetProgressPct(account);
  const winRate = metrics.winRatePct;
  const rr = metrics.rr;
  const expectancy = journalExpectancyPct(metrics, account.tradingCapital);
  const alert = alertVerdict(account);

  const pnl = account.currentCapital - account.initialCapital;

  function save() {
    startTransition(async () => {
      await saveTradingAccount({
        id: draft.id,
        name: draft.name,
        initialCapital: draft.initialCapital,
        currentCapital: draft.currentCapital,
        tradingCapital: draft.tradingCapital,
        useRealCapital: draft.useRealCapital,
        riskPct: draft.riskPct,
        maxDDPct: draft.maxDDPct,
        targetPct: draft.targetPct,
        style: draft.style,
        allowedSetups: draft.allowedSetups,
        alertThresholdPct: draft.alertThresholdPct,
        isActive: draft.isActive,
      });
      setEditing(false);
      router.refresh();
    });
  }

  function applyDelta() {
    const parsed = Number.parseFloat(delta.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed === 0) return;
    startTransition(async () => {
      await adjustAccountCapital({ id: account.id, delta: parsed });
      setDelta("");
      router.refresh();
    });
  }

  const inputClass =
    "bg-panel border-border-app text-fg focus:border-brand-blue tabular w-full rounded-lg border px-2 py-1 font-mono text-sm outline-none";

  return (
    <Card
      id={`account-${account.id}`}
      className={cn("scroll-mt-6", health === "breached" && "border-brand-red/50")}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="h-8 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: account.color }}
          />
          <div>
            {/* Le nom mène au journal de CE compte : c'est le geste attendu
                quand on clique un compte, et c'est de là qu'on importe ses
                trades. Un lien, pas un bouton — il s'ouvre dans un onglet et
                se copie. */}
            <Link
              href={`/journal?compte=${account.id}`}
              className="hover:text-brand-blue group inline-flex items-center gap-1.5 transition-colors"
            >
              <h2 className="text-fg group-hover:text-brand-blue text-sm font-semibold transition-colors">
                {account.name}
              </h2>
              <Icon
                name="chevron_right"
                size={13}
                className="text-subtle group-hover:text-brand-blue shrink-0 transition-colors"
              />
            </Link>
            <p className="text-subtle text-[10px] uppercase">
              {account.style === "SCALPING" ? "Scalping" : "Day / Swing"}
              {!account.useRealCapital
                ? ` · piloté sur ${money(account.tradingCapital)} $`
                : ""}
              {!account.isActive ? " · inactif" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase",
              style.className,
            )}
          >
            {style.label}
          </span>

          <DeleteAccountButton
            accountId={account.id}
            accountName={account.name}
            tradeCount={account.tradeCount ?? 0}
          />
          <button
            type="button"
            onClick={() => {
              setDraft(account);
              setEditing((v) => !v);
            }}
            aria-label="Modifier le compte"
            className="text-subtle hover:text-brand-blue rounded p-1 transition-colors"
          >
            <Icon name={editing ? "close" : "edit"} size={15} />
          </button>
        </div>
      </div>

      {alert.state !== "ok" ? (
        <div
          role="status"
          className={cn(
            "mb-3 flex items-start gap-2 rounded-lg border p-2.5 text-xs leading-relaxed",
            alert.state === "breached"
              ? "border-brand-red bg-brand-red/10 text-brand-red"
              : "border-brand-amber/40 bg-brand-amber/10 text-brand-amber",
          )}
        >
          <Icon name={alert.state === "breached" ? "block" : "warning"} size={14} className="mt-0.5 shrink-0" />
          <span>
            {alert.state === "breached" ? (
              <>Drawdown maximum atteint ({alert.lossPct} %). Le compte a franchi sa limite.</>
            ) : (
              <>
                Vous êtes à <strong>{alert.lossPct} % de perte</strong>, votre seuil d alerte est à{" "}
                {alert.thresholdPct} %. Arrêtez-vous : reprenez votre journal et refaites une
                analyse de votre comportement avant le prochain trade.
              </>
            )}
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">Capital</p>
          <p className="text-fg tabular font-mono text-lg font-bold">
            {money(account.currentCapital)} $
          </p>
          <p
            className={cn(
              "tabular font-mono text-[10px]",
              pnl > 0 ? "text-brand-green" : pnl < 0 ? "text-brand-red" : "text-subtle",
            )}
          >
            {pnl >= 0 ? "+" : ""}
            {money(pnl)} $ vs départ
          </p>
        </div>

        <div>
          <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">
            Risque/trade
          </p>
          <p className="text-fg tabular font-mono text-lg font-bold">{money2(risk)} $</p>
          <p className="text-subtle text-[10px]">{account.riskPct} % du capital</p>
        </div>

        <div>
          <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">
            Marge de perte
          </p>
          <p
            className={cn(
              "tabular font-mono text-lg font-bold",
              remaining <= 0 ? "text-brand-red" : "text-fg",
            )}
          >
            {money(remaining)} $
          </p>
          <p className="text-subtle text-[10px]">{untilBreach} trade(s) perdants</p>
        </div>

        <div>
          <p className="text-subtle font-mono text-[10px] tracking-widest uppercase">Espérance</p>
          <p
            className={cn(
              "tabular font-mono text-lg font-bold",
              expectancy === null
                ? "text-subtle"
                : expectancy > 0
                  ? "text-brand-green"
                  : "text-brand-red",
            )}
          >
            {expectancy === null ? "—" : `${expectancy > 0 ? "+" : ""}${expectancy} %`}
          </p>
          <p className="text-subtle text-[10px]">
            {winRate === null ? "données insuffisantes" : `${winRate} % · ${rr} R`}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div>
          <div className="mb-1 flex items-baseline justify-between text-[10px]">
            <span className="text-muted">Drawdown utilisé</span>
            <span className="text-subtle tabular font-mono">
              {usedPct.toFixed(0)} % de {account.maxDDPct} %
            </span>
          </div>
          <div className="bg-panel h-1.5 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full",
                usedPct >= 75 ? "bg-brand-red" : usedPct >= 40 ? "bg-brand-amber" : "bg-brand-green",
              )}
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
        </div>

        {progress !== null ? (
          <div>
            <div className="mb-1 flex items-baseline justify-between text-[10px]">
              <span className="text-muted">Objectif</span>
              <span className="text-subtle tabular font-mono">
                {progress.toFixed(0)} % de {account.targetPct} %
              </span>
            </div>
            <div className="bg-panel h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-brand-blue h-full rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-border-app mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
        <span className="text-subtle mr-1 text-[10px]">
          {metrics.closed} trade(s) mesuré(s) ·
        </span>
        {account.allowedEntries.map((entry) => (
          <span
            key={entry}
            className="border-border-app text-muted rounded border px-1.5 py-0.5 font-mono text-[10px]"
          >
            {entry}
          </span>
        ))}
        {account.allowedEntries.length === 0 ? (
          <span className="text-subtle text-[10px]">aucune entrée autorisée</span>
        ) : null}
      </div>

      <div className="border-border-app mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <label htmlFor={`delta-${account.id}`} className="text-muted text-xs">
          Résultat à reporter
        </label>
        <input
          id={`delta-${account.id}`}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="+150 ou -80"
          className="bg-panel border-border-app text-fg tabular w-28 rounded-lg border px-2 py-1 font-mono text-sm outline-none"
        />
        <button
          type="button"
          onClick={applyDelta}
          disabled={pending || delta.trim() === ""}
          className="border-border-app text-muted hover:text-brand-blue rounded-lg border px-2.5 py-1 text-xs transition-colors disabled:opacity-40"
        >
          Appliquer
        </button>
      </div>

      {editing ? (
        <div className="border-border-app mt-3 space-y-3 border-t pt-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <label className="text-muted mb-1 block text-xs">Nom</label>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-muted mb-1 block text-xs">Capital initial</label>
              <input
                type="number"
                value={draft.initialCapital}
                onChange={(e) => setDraft({ ...draft, initialCapital: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-muted mb-1 block text-xs">Capital actuel</label>
              <input
                type="number"
                value={draft.currentCapital}
                onChange={(e) => setDraft({ ...draft, currentCapital: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-muted mb-1 block text-xs">Capital piloté</label>
              <input
                type="number"
                value={draft.tradingCapital}
                onChange={(e) => setDraft({ ...draft, tradingCapital: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-muted mb-1 block text-xs">Risque %</label>
              <input
                type="number"
                step="0.05"
                value={draft.riskPct}
                onChange={(e) => setDraft({ ...draft, riskPct: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-muted mb-1 block text-xs">Drawdown max %</label>
              <input
                type="number"
                step="0.5"
                value={draft.maxDDPct}
                onChange={(e) => setDraft({ ...draft, maxDDPct: Number(e.target.value) })}
                className={inputClass}
              />
            </div>
            <div>
              {/* Volontairement bornée par le drawdown : une alerte placée
                  APRÈS la limite du prop firm ne se déclencherait jamais — le
                  compte serait déjà mort. */}
              <label className="text-muted mb-1 block text-xs">
                Alerte à % de perte
                <span className="text-subtle ml-1">(0 – {draft.maxDDPct})</span>
              </label>
              <input
                type="number"
                step="0.5"
                min={0}
                max={draft.maxDDPct}
                value={draft.alertThresholdPct ?? ""}
                placeholder="aucune"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    alertThresholdPct:
                      e.target.value === ""
                        ? null
                        : Math.min(Number(e.target.value), draft.maxDDPct),
                  })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-muted mb-1 block text-xs">Objectif %</label>
              <input
                type="number"
                step="0.5"
                value={draft.targetPct ?? ""}
                placeholder="aucun"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    targetPct: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-muted mb-1 block text-xs">Style</label>
              <select
                value={draft.style}
                onChange={(e) =>
                  setDraft({ ...draft, style: e.target.value as TradingAccountRow["style"] })
                }
                className={inputClass}
              >
                <option value="SCALPING">Scalping</option>
                <option value="DAY_SWING">Day / Swing</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-muted flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={draft.useRealCapital}
                onChange={(e) => setDraft({ ...draft, useRealCapital: e.target.checked })}
              />
              Dimensionner sur le capital réel
            </label>
            <label className="text-muted flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              />
              Compte actif
            </label>
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <p className="text-muted text-xs">Entrées autorisées</p>
              <span className="text-subtle font-mono text-[10px]">
                {draft.allowedSetups.length}/{userSetups.length}
              </span>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    allowedSetups:
                      draft.allowedSetups.length === userSetups.length ? [] : [...userSetups],
                  })
                }
                className="text-subtle hover:text-fg ml-auto text-[10px] uppercase transition-colors"
              >
                {draft.allowedSetups.length === userSetups.length ? "Tout décocher" : "Tout cocher"}
              </button>
            </div>

            {/* Un compte sans entrée n'est pas cassé, mais ses statistiques
                n'ont rien à mesurer. Mieux vaut le dire que d'afficher des
                tirets sans explication. */}
            {draft.allowedSetups.length === 0 ? (
              <p className="text-brand-amber mb-1.5 text-[11px]">
                Choisissez les setups que vous jouez sur ce compte — sans eux, ni espérance ni
                taux de réussite ne peuvent être calculés.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {userSetups.map((entry) => {
                const on = draft.allowedSetups.includes(entry);
                return (
                  <button
                    key={entry}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        allowedSetups: on
                          ? draft.allowedSetups.filter((e) => e !== entry)
                          : [...draft.allowedSetups, entry],
                      })
                    }
                    className={cn(
                      "rounded border px-2 py-1 font-mono text-[11px] transition-colors",
                      on
                        ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                        : "border-border-app text-muted hover:text-fg",
                    )}
                  >
                    {entry}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-40"
            >
              <Icon name="check" size={14} /> Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-muted hover:text-fg px-2 py-1.5 text-xs"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      <ConnectAccount accountId={account.id} link={metaApiLink} metaApiEnabled={metaApiEnabled} />
    </Card>
  );
}
