import { FlagIcon } from "@/components/ui/flag-icon";
import { CURRENCY_COLOR_VAR, cn, isCurrencyCode } from "@/lib/utils";

/**
 * Currency identity mark.
 *
 * The rewrite originally dropped emoji flags (`flag: '🇺🇸'` on every legacy
 * currency record) because they render inconsistently across platforms and
 * carry no accessible label. Real vector flags (flag-icon.tsx) do not have
 * that problem, so they sit next to the same fixed accent colour used in
 * every chart — the colour still carries the identity, the flag is a purely
 * decorative (`aria-hidden`) visual reinforcement, and the code text next to
 * both remains the accessible label.
 */
const FLAG_SIZE = { sm: 14, md: 18, lg: 24 } as const;

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
  const flagWidth = FLAG_SIZE[size];

  return (
    <span
      className={cn(
        "tabular inline-flex shrink-0 items-center gap-1.5 rounded-md border font-mono font-bold",
        size === "sm" && "h-5 min-w-9 px-1 text-[10px]",
        size === "md" && "h-6 min-w-11 px-1.5 text-xs",
        size === "lg" && "h-8 min-w-14 px-2 text-sm",
        className,
      )}
      style={{ color, borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <FlagIcon code={code} className="shrink-0" style={{ width: flagWidth, height: flagWidth * (16 / 24) }} />
      {code}
    </span>
  );
}
