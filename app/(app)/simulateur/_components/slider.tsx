"use client";

/**
 * Labelled slider for the simulator parameters.
 *
 * Built rather than reusing a bare `<input type="range">` for two reasons the
 * legacy version suffered from:
 *
 *   - its thumb was the browser default, around 10px, which is hard to grab
 *     and nearly impossible on a touchscreen. Here it is 18px with a wider
 *     invisible hit area, and it grows while dragging.
 *   - the filled portion of the track gave no reading of where the value sat
 *     relative to the range. The fill is now explicit and the current value is
 *     always shown as a badge.
 *
 * The accent is the app's blue-to-cyan ramp rather than the legacy violet,
 * which clashed with the red/green used for gains and losses right beside it.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  /** Overrides the badge text — e.g. thousands separators on a capital. */
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const shown = format ? format(value) : String(value);

  return (
    <div className="group">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-muted text-xs">{label}</label>
        <span className="border-border-app bg-panel text-fg tabular rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold">
          {shown}
          {suffix ? <span className="text-subtle ml-0.5">{suffix}</span> : null}
        </span>
      </div>

      <div className="relative h-5">
        {/* Rail et remplissage, dessinés sous l'input transparent. */}
        <div className="bg-border-app pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full" />
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--color-brand-blue), var(--color-brand-cyan))",
          }}
        />
        <div
          className={[
            "border-bg pointer-events-none absolute top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-md",
            "transition-transform group-hover:scale-110",
          ].join(" ")}
          style={{ left: `${pct}%`, backgroundColor: "var(--color-brand-cyan)" }}
        />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          // Transparent and full-height: the visible parts are the divs above,
          // while this keeps native keyboard and touch behaviour and gives the
          // thumb a 20px grab area instead of the default sliver.
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent
            [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent
            [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:bg-transparent"
        />
      </div>
    </div>
  );
}
