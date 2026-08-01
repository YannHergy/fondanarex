import { getScoreLabel } from "@/domain/scoring";

/**
 * Presentation of a 0–100 score.
 *
 * The thresholds mirror `getScoreLabel` in the domain layer exactly. They are
 * repeated rather than derived because the label and the colour are two
 * different concerns that happen to share cut points today — but the colour
 * ramp is a design decision and the labels are a domain one.
 */

export function scoreTextClass(score: number): string {
  if (score >= 70) return "text-brand-cyan";
  if (score >= 60) return "text-brand-green";
  if (score >= 45) return "text-brand-amber";
  if (score >= 30) return "text-brand-red/80";
  return "text-brand-red";
}

export function scoreBgClass(score: number): string {
  if (score >= 70) return "bg-brand-cyan";
  if (score >= 60) return "bg-brand-green";
  if (score >= 45) return "bg-brand-amber";
  if (score >= 30) return "bg-brand-red/80";
  return "bg-brand-red";
}

/** French verdict for a score. The legacy labels were English. */
const VERDICT_FR: Record<string, string> = {
  "Strong Buy": "Achat fort",
  Buy: "Achat",
  Neutral: "Neutre",
  Sell: "Vente",
  "Strong Sell": "Vente forte",
};

export function scoreVerdict(score: number): string {
  const label = getScoreLabel(score);
  return VERDICT_FR[label] ?? label;
}
