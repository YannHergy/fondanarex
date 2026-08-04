import type { CurrencyData } from "@/domain/types";

/**
 * Result of the last hand review against Trading Economics.
 *
 * Green means the figure was compared side by side and matched; red means it
 * did not. No dot means it has never been reviewed — deliberately distinct
 * from red, so an unchecked indicator is never mistaken for a known-wrong one.
 *
 * The dot carries a title rather than text because it sits next to a label
 * that is already long; the reference figure and the review date live there,
 * which is what makes an old verdict recognisable as old.
 */
export function CheckDot({
  field,
  checks,
}: {
  field: string | undefined;
  checks: CurrencyData["checks"];
}) {
  const check = field ? checks[field] : undefined;
  if (!check) return null;

  const matched = check.status === "MATCH";
  const label = matched
    ? `Vérifié conforme à Trading Economics le ${check.checkedOn}`
    : `Diverge de Trading Economics${check.reference ? ` (${check.reference})` : ""} — vérifié le ${check.checkedOn}`;

  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-block size-1.5 shrink-0 rounded-full ${
        matched ? "bg-brand-green" : "bg-brand-red"
      }`}
    />
  );
}
