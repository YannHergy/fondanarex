import { CURRENCY_COLOR_VAR, cn, isCurrencyCode } from "@/lib/utils";

/**
 * Currency identity mark.
 *
 * The legacy UI used emoji flags (`flag: '🇺🇸'` on every currency record), which
 * render inconsistently across platforms, carry no colour information, and are
 * meaningless to a screen reader. This uses the currency's fixed accent colour
 * instead — the same colour it gets in every chart and comparison — so identity
 * is conveyed the same way everywhere.
 */
export function CurrencyBadge({
  code,
  size = "md",
  className,
}: {
  code: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const color = isCurrencyCode(code) ? CURRENCY_COLOR_VAR[code] : "var(--color-brand-steel)";

  return (
    <span
      className={cn(
        "tabular inline-flex shrink-0 items-center justify-center rounded-md border font-mono font-bold",
        size === "sm" && "h-5 min-w-9 px-1 text-[10px]",
        size === "md" && "h-6 min-w-11 px-1.5 text-xs",
        size === "lg" && "h-8 min-w-14 px-2 text-sm",
        className,
      )}
      style={{ color, borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {code}
    </span>
  );
}
