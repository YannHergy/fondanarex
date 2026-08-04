"use client";

import { useMemo, useState } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { IndicatorLevel } from "@/domain/data/fundamental-indicators";
import {
  LEVEL_LABELS,
  LEVEL_ORDER,
  activeConnections,
  computeLayout,
  connectionsWithin,
  reachableFrom,
  type FilterMode,
} from "@/domain/fundamental/graph";
import { CURRENCY_CODES, cn } from "@/lib/utils";

/**
 * Node fill per level, deepest cause to final verdict.
 *
 * Fixed hex values rather than the app's brand tokens: this is a five-step
 * scale where the ORDER must read at a glance — amber at the top narrowing
 * down to green at the roots. The brand palette has no such ordered ramp, and
 * borrowing five of its accents produced colours that looked unrelated to each
 * other. `text` is the label colour that stays legible on each fill.
 */
const LEVEL_STYLE: Record<IndicatorLevel, { fill: string; stroke: string; text: string }> = {
  king: { fill: "#f5a623", stroke: "#f5c842", text: "#1a1a2e" },
  pillar: { fill: "#e53e3e", stroke: "#fc8181", text: "#ffffff" },
  driver: { fill: "#4299e1", stroke: "#63b3ed", text: "#ffffff" },
  signal: { fill: "#9f7aea", stroke: "#b794f4", text: "#ffffff" },
  root: { fill: "#48bb78", stroke: "#68d391", text: "#1a1a2e" },
};

/** Filled discs, sized by level — the top of the chain reads largest. */
const LEVEL_RADIUS: Record<IndicatorLevel, number> = {
  king: 30,
  pillar: 27,
  driver: 26,
  signal: 25,
  root: 24,
};

const FILTER_LABELS: Record<FilterMode, string> = {
  both: "Les deux sens",
  downstream: "Conséquences",
  upstream: "Causes",
};

const DELAY_LABELS = {
  immediate: "immédiat",
  days: "quelques jours",
  weeks: "quelques semaines",
  months: "quelques mois",
} as const;

const WIDTH = 1400;
const ROW_HEIGHT = 150;
/** Marge gauche laissée aux libellés de couche, qui sinon passent sous les nœuds. */
const PAD_LEFT = 150;
/** Marge droite, pour que le dernier nœud d'une rangée ne soit pas coupé. */
const PAD_RIGHT = 40;

export function GearGraph({ defaultCurrency }: { defaultCurrency: string }) {
  const [currency, setCurrency] = useState(defaultCurrency);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<FilterMode>("both");
  const [depth, setDepth] = useState(1);

  const positions = useMemo(() => computeLayout(currency), [currency]);
  const nodeIds = useMemo(() => new Set(positions.map((p) => p.id)), [positions]);
  const connections = useMemo(() => connectionsWithin(nodeIds), [nodeIds]);

  const positionById = useMemo(
    () => new Map(positions.map((p) => [p.id, p])),
    [positions],
  );

  const highlighted = useMemo(
    () => (selectedId ? reachableFrom(selectedId, mode, depth, connections) : null),
    [selectedId, mode, depth, connections],
  );

  const selectedEdges = useMemo(
    () => (selectedId ? activeConnections(selectedId, mode, connections) : []),
    [selectedId, mode, connections],
  );

  const selected = selectedId ? positionById.get(selectedId) : null;
  const height = LEVEL_ORDER.length * ROW_HEIGHT;

  const xy = (id: string) => {
    const position = positionById.get(id);
    if (!position) return null;
    return {
      x: PAD_LEFT + position.x * (WIDTH - PAD_LEFT - PAD_RIGHT),
      y: position.row * ROW_HEIGHT + ROW_HEIGHT / 2,
    };
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {CURRENCY_CODES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => {
                  setCurrency(code);
                  setSelectedId(null);
                }}
                className={cn(
                  "rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold transition-colors",
                  currency === code
                    ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                    : "border-border-app text-muted hover:text-fg",
                )}
              >
                {code}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            {LEVEL_ORDER.map((level) => (
              <span key={level} className="flex items-center gap-1.5 text-[10px]">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: LEVEL_STYLE[level].fill }}
                />
                <span className="text-muted tracking-wide uppercase">{LEVEL_LABELS[level]}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as FilterMode)}
              aria-label="Sens de propagation"
              className="bg-panel border-border-app text-fg rounded-lg border px-2 py-1 text-xs outline-none"
            >
              {(Object.keys(FILTER_LABELS) as FilterMode[]).map((m) => (
                <option key={m} value={m}>
                  {FILTER_LABELS[m]}
                </option>
              ))}
            </select>

            <select
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              aria-label="Profondeur de cascade"
              className="bg-panel border-border-app text-fg rounded-lg border px-2 py-1 text-xs outline-none"
            >
              {[1, 2, 3].map((d) => (
                <option key={d} value={d}>
                  Profondeur {d}
                </option>
              ))}
            </select>

            {selectedId ? (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="border-border-app text-muted hover:text-fg rounded-lg border px-2.5 py-1 text-xs transition-colors"
              >
                Désélectionner
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${WIDTH} ${height}`}
            className="h-auto w-full min-w-[1200px]"
            role="img"
            aria-label={`Graphe des connexions fondamentales pour ${currency}`}
          >
            {LEVEL_ORDER.map((level, row) => (
              <g key={level}>
                <line
                  x1={PAD_LEFT - 20}
                  x2={WIDTH}
                  y1={row * ROW_HEIGHT}
                  y2={row * ROW_HEIGHT}
                  stroke="var(--color-border-app)"
                  strokeWidth={1}
                />
                <text
                  x={6}
                  y={row * ROW_HEIGHT + ROW_HEIGHT / 2 + 4}
                  className="fill-[var(--color-text-subtle)] text-[10px] uppercase"
                  style={{ fontSize: 10, letterSpacing: "0.1em" }}
                >
                  {LEVEL_LABELS[level]}
                </text>
              </g>
            ))}

            {connections.map((connection, index) => {
              const from = xy(connection.from);
              const to = xy(connection.to);
              if (!from || !to) return null;

              const isActive =
                selectedId !== null &&
                (connection.from === selectedId || connection.to === selectedId);
              const dimmed = selectedId !== null && !isActive;

              return (
                <line
                  key={`${connection.from}-${connection.to}-${index}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={
                    isActive
                      ? connection.direction === "inverse"
                        ? "var(--color-brand-red)"
                        : "var(--color-brand-green)"
                      : "var(--color-border-strong)"
                  }
                  strokeWidth={isActive ? Math.max(1.5, connection.weight * 0.6) : 0.7}
                  strokeOpacity={dimmed ? 0.12 : isActive ? 0.9 : 0.35}
                  // Inverse links dashed: a relationship that runs the other way
                  // should be distinguishable without reading the legend.
                  strokeDasharray={connection.direction === "inverse" ? "4 3" : undefined}
                />
              );
            })}

            {positions.map((position) => {
              const point = xy(position.id);
              if (!point) return null;

              const style = LEVEL_STYLE[position.level];
              const isSelected = position.id === selectedId;
              const isHighlighted = highlighted?.has(position.id) ?? false;
              const dimmed = selectedId !== null && !isHighlighted;
              const radius = LEVEL_RADIUS[position.level];
              // How many other indicators this one feeds or is fed by — the
              // count shown on the badge, which is what makes a hub visible
              // without clicking through every node.
              const degree = connections.filter(
                (c) => c.from === position.id || c.to === position.id,
              ).length;

              return (
                <g
                  key={position.id}
                  transform={`translate(${point.x}, ${point.y})`}
                  opacity={dimmed ? 0.2 : 1}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(isSelected ? null : position.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(isSelected ? null : position.id);
                    }
                  }}
                  aria-label={position.indicator.name}
                >
                  <circle
                    r={radius}
                    fill={style.fill}
                    stroke={style.stroke}
                    strokeWidth={isSelected ? 3 : 1}
                  />

                  {/* Libellé DANS le disque : le graphe compte jusqu'à quinze
                   * nœuds par rangée, et des étiquettes posées dessous se
                   * chevauchaient dès que deux nœuds étaient proches. */}
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={style.text}
                    style={{ fontSize: 8.5, fontWeight: 600, pointerEvents: "none" }}
                  >
                    {position.indicator.name.length > 13
                      ? `${position.indicator.name.slice(0, 12)}…`
                      : position.indicator.name}
                  </text>

                  {/* Nombre de liaisons, en haut à droite du disque. */}
                  <text
                    x={radius - 2}
                    y={-radius + 4}
                    textAnchor="start"
                    fill={style.fill}
                    style={{ fontSize: 10, fontWeight: 700, pointerEvents: "none" }}
                  >
                    {degree}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-subtle ml-auto text-[10px]">
            Trait plein = relation positive · pointillé = relation inverse · épaisseur = poids
          </span>
        </div>
      </Card>

      {selected ? (
        <Card>
          <CardTitle icon="account_tree">{selected.indicator.fullName}</CardTitle>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="border-border-app text-muted rounded border px-2 py-0.5 text-[10px] uppercase">
              {LEVEL_LABELS[selected.level]}
            </span>
            <span className="border-border-app text-muted rounded border px-2 py-0.5 text-[10px]">
              {selected.indicator.currency}
            </span>
            <span className="border-border-app text-muted rounded border px-2 py-0.5 text-[10px]">
              {selected.indicator.category}
            </span>
            <span className="text-subtle text-[10px]">
              importance {selected.indicator.importance}/5
            </span>
          </div>

          <p className="text-muted mb-4 text-sm leading-relaxed">
            {selected.indicator.description}
          </p>

          {selectedEdges.length > 0 ? (
            <ul className="space-y-1.5">
              {selectedEdges.map((connection, index) => {
                const outgoing = connection.from === selected.id;
                const otherId = outgoing ? connection.to : connection.from;
                const other = positionById.get(otherId);

                return (
                  <li
                    key={`${connection.from}-${connection.to}-${index}`}
                    className="border-border-app flex items-start gap-2 border-b py-1.5 text-xs last:border-0"
                  >
                    <Icon
                      name={outgoing ? "arrow_forward" : "arrow_back"}
                      size={13}
                      className={cn(
                        "mt-0.5 shrink-0",
                        connection.direction === "inverse"
                          ? "text-brand-red"
                          : "text-brand-green",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-fg font-medium">
                        <Icon
                          name={outgoing ? "arrow_forward" : "arrow_back"}
                          size={12}
                          className="mr-1 inline align-text-bottom"
                          aria-label={outgoing ? "influence" : "influencé par"}
                        />
                        {other?.indicator.name ?? otherId}
                      </p>
                      <p className="text-muted mt-0.5 leading-relaxed">
                        {connection.description}
                      </p>
                    </div>
                    <span className="text-subtle shrink-0 font-mono text-[10px]">
                      poids {connection.weight} · {DELAY_LABELS[connection.delay]}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-subtle text-sm">
              Aucune connexion dans ce sens. Changez le filtre pour voir l&apos;autre direction.
            </p>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-subtle text-sm">
            Cliquez sur un nœud pour voir ses causes, ses conséquences et le détail de chaque
            relation. Augmentez la profondeur pour suivre la cascade au-delà des liens directs.
          </p>
        </Card>
      )}
    </div>
  );
}
