import "server-only";

import { MIN_TRADES_FOR_RATE, type SetupStat } from "@/domain/journal/setup-stats";
import { callClaudeStructured } from "@/lib/integrations/llm";

/**
 * Revue IA des setups, à partir des statistiques RÉELLES du journal.
 *
 * Le modèle ne voit que des chiffres mesurés — nombre de trades, gagnants,
 * perdants, gain moyen, perte moyenne — et n'a accès à aucune constante. Il ne
 * peut donc pas commenter un setup que le trader n'a jamais pris.
 */

export interface SetupReviewVerdict {
  setup: string;
  /** garder | réduire | abandonner | poursuivre_mesure */
  verdict: string;
  reason: string;
}

export interface SetupReviewResult {
  ok: boolean;
  message: string;
  synthese?: string;
  verdicts?: SetupReviewVerdict[];
}

const SYSTEM = `Tu es analyste de performance pour un trader forex. Tu reçois les statistiques RÉELLES de ses setups, tirées de son journal.

Ton travail : dire lesquels méritent d'être gardés, réduits ou abandonnés, et pourquoi.

Règles absolues :
- Un setup sous ${MIN_TRADES_FOR_RATE} trades clôturés n'a PAS d'échantillon suffisant. Tu ne conclus jamais sur lui : son verdict est "poursuivre_mesure", même si ses chiffres sont beaux. Trois gagnants d'affilée ne prouvent rien.
- Raisonne sur l'ESPÉRANCE, pas sur le taux de réussite seul. Un setup à 30 % de réussite avec un gain moyen quatre fois supérieur à la perte moyenne est excellent ; un setup à 70 % avec des gains minuscules et de grosses pertes est un piège.
- N'invente aucun setup et ne commente que ceux de la liste.
- Le groupe « Sans setup » n'est pas une méthode : s'il pèse lourd, dis simplement que ces trades ne sont pas étiquetés et que la mesure en souffre.
- Écris en français, court et direct. Pas de flatterie.`;

const SCHEMA = {
  type: "object",
  properties: {
    synthese: { type: "string" },
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          setup: { type: "string" },
          verdict: {
            type: "string",
            enum: ["garder", "réduire", "abandonner", "poursuivre_mesure"],
          },
          reason: { type: "string" },
        },
        required: ["setup", "verdict", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["synthese", "verdicts"],
  additionalProperties: false,
} as const;

interface Parsed {
  synthese: string;
  verdicts: SetupReviewVerdict[];
}

function validate(value: unknown): Parsed | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.synthese !== "string") return null;

  const verdicts: SetupReviewVerdict[] = Array.isArray(v.verdicts)
    ? v.verdicts.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return [];
        const r = raw as Record<string, unknown>;
        if (
          typeof r.setup !== "string" ||
          typeof r.verdict !== "string" ||
          typeof r.reason !== "string"
        ) {
          return [];
        }
        return [{ setup: r.setup, verdict: r.verdict, reason: r.reason }];
      })
    : [];

  return { synthese: v.synthese, verdicts };
}

export async function reviewSetups(stats: readonly SetupStat[]): Promise<SetupReviewResult> {
  const measured = stats.filter((s) => s.closed > 0);
  if (measured.length === 0) {
    return { ok: false, message: "Aucun trade clôturé à analyser." };
  }

  const table = measured
    .map((s) => {
      const rate = s.winRatePct === null ? "échantillon insuffisant" : `${s.winRatePct} %`;
      const avgWin = s.avgWin === null ? "—" : `${s.avgWin}`;
      const avgLoss = s.avgLoss === null ? "—" : `${s.avgLoss}`;
      return `- ${s.setup} : ${s.closed} clôturés (${s.wins}G / ${s.losses}P / ${s.breakeven}N) · réussite ${rate} · gain moyen ${avgWin} · perte moyenne ${avgLoss} · P&L ${s.netPnl} · espérance ${s.expectancy ?? "—"}`;
    })
    .join("\n");

  const prompt = [
    "STATISTIQUES DES SETUPS (journal réel) :",
    table,
    "",
    `Rappel : en dessous de ${MIN_TRADES_FOR_RATE} trades clôturés, aucun taux n'est fiable.`,
    "",
    "Réponds avec cet objet JSON :",
    "{",
    '  "synthese": "Deux à quatre phrases : où le trader gagne réellement son argent, et ce qui le lui coûte.",',
    '  "verdicts": [ { "setup": "nom EXACT", "verdict": "garder|réduire|abandonner|poursuivre_mesure", "reason": "une phrase" } ]',
    "}",
  ].join("\n");

  const { data, error } = await callClaudeStructured<Parsed>({
    system: SYSTEM,
    prompt,
    schema: SCHEMA,
    validate,
    maxTokens: 1500,
  });

  if (!data) return { ok: false, message: error ?? "Analyse impossible." };

  // Un verdict portant sur un setup absent des statistiques est écarté : le
  // prompt l'interdit, mais une consigne n'est pas une garantie.
  const known = new Set(measured.map((s) => s.setup));
  const verdicts = data.verdicts.filter((v) => known.has(v.setup));

  return {
    ok: true,
    message: `${verdicts.length} setup(s) analysé(s) sur ${measured.length}`,
    synthese: data.synthese,
    verdicts,
  };
}
