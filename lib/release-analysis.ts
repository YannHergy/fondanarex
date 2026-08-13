import "server-only";

import { propagateCascade } from "@/domain/fundamental/cascade";
import { getIndicatorById } from "@/domain/data/fundamental-indicators";
import { litNodesFor, upcomingByNode } from "@/domain/fundamental/release-bridge";
import { callGeminiStructured, geminiConfigured } from "@/lib/integrations/llm";
import { getScoredCurrencies } from "@/lib/currencies";
import { getReleases } from "@/lib/releases";

/**
 * Lecture IA d'une publication, par-dessus l'engrenage.
 *
 * L'engrenage propage des règles FIGÉES : « NFP ↑ → inflation ↑ ». C'est un
 * mécanisme de manuel, vrai en moyenne et faux souvent. Un NFP effondré
 * n'entraîne une désinflation que si la baisse vient de la demande ; si
 * l'inflation monte quand même, c'est qu'elle est portée par autre chose —
 * l'énergie, les tarifs douaniers, l'offre — et le graphe n'a aucun moyen de
 * le savoir.
 *
 * Le modèle reçoit donc les trois choses ensemble : le chiffre publié, l'état
 * macro RÉEL de la devise, et ce que la mécanique prédit. Son travail est de
 * dire où la mécanique tient et où elle ne tient pas — pas de la répéter.
 */

export interface ConsequenceRead {
  indicator: string;
  /** confirme | nuance | contredit — le sort réservé à la règle mécanique. */
  verdict: string;
  texte: string;
  /** Date de la prochaine publication de cet indicateur, quand elle est connue. */
  at: string | null;
}

export interface ReleaseAnalysisResult {
  ok: boolean;
  message: string;
  lecture?: string;
  causes?: string;
  chaine?: string;
  scenarioConfirmation?: string;
  scenarioInvalidation?: string;
  consequences?: ConsequenceRead[];
}

const SYSTEM = `Tu es macro-économiste pour un trader forex. Tu reçois une publication qui vient de sortir, l'état macro réel de la devise, et ce qu'un graphe de propagation À RÈGLES FIGÉES prédit qu'elle va entraîner.

Ton rôle n'est PAS de répéter le graphe. Il est de dire où sa mécanique tient et où elle ne tient pas, au vu des données réelles.

Ce qu'on attend de toi :
- Lis le chiffre en contexte. Un même chiffre ne dit pas la même chose selon l'inflation, le taux directeur et le cycle en cours.
- Dis ce qui a PROBABLEMENT produit ce chiffre. Une baisse de l'emploi due à un ralentissement de la demande n'a pas les mêmes suites qu'une baisse due à une grève ou à une révision statistique.
- Pour chaque conséquence annoncée par le graphe, tranche : "confirme" si la mécanique tient ici, "nuance" si elle tient sous condition, "contredit" si les données réelles pointent l'inverse. Dis POURQUOI, en une ou deux phrases.
- Exemple du raisonnement attendu : un emploi qui s'effondre ne fait baisser l'inflation que si la demande faiblit avec lui. Si l'inflation reste haute malgré tout, c'est qu'elle vient de l'offre ou de l'énergie, et le lien emploi->inflation ne joue pas ce cycle-ci.
- RACONTE l'enchaînement au lieu de l'étiqueter. Dire « baissier » n'apprend rien : il faut suivre le fil — ce chiffre pèse sur tel indicateur, qui sort telle date, ce qui pousse tel autre, et voilà où finit la devise. Chaque maillon nommé, chaque date citée.
- Appuie-toi sur LES DATES fournies. Une conséquence sans échéance est une opinion ; avec l'échéance, c'est un rendez-vous vérifiable.
- N'invente aucun chiffre ni aucune date. Tu ne disposes que de ceux qui te sont donnés.
- Écris en français, dense et direct, sans jargon décoratif ni précaution oratoire.`;

const SCHEMA = {
  type: "object",
  properties: {
    lecture: { type: "string" },
    causes: { type: "string" },
    chaine: { type: "string" },
    scenario_confirmation: { type: "string" },
    scenario_invalidation: { type: "string" },
    consequences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          indicator: { type: "string" },
          verdict: { type: "string", enum: ["confirme", "nuance", "contredit"] },
          texte: { type: "string" },
        },
        required: ["indicator", "verdict", "texte"],
        additionalProperties: false,
      },
    },
  },
  required: ["lecture", "causes", "chaine", "scenario_confirmation", "scenario_invalidation", "consequences"],
  additionalProperties: false,
} as const;

const VERDICTS = new Set(["confirme", "nuance", "contredit"]);

interface Parsed {
  lecture: string;
  causes: string;
  chaine: string;
  scenario_confirmation: string;
  scenario_invalidation: string;
  consequences: Array<{ indicator: string; verdict: string; texte: string }>;
}

function validate(value: unknown): Parsed | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.lecture !== "string" || typeof v.causes !== "string") return null;

  const consequences = Array.isArray(v.consequences)
    ? v.consequences.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return [];
        const c = raw as Record<string, unknown>;
        if (
          typeof c.indicator !== "string" ||
          typeof c.verdict !== "string" ||
          typeof c.texte !== "string"
        ) {
          return [];
        }
        // Le verdict est ramené de force dans les trois valeurs prévues.
        // Observé en test : le modèle glisse parfois une phrase entière ici,
        // et l interface l afficherait telle quelle comme étiquette.
        const verdict = VERDICTS.has(c.verdict) ? c.verdict : "nuance";
        return [{ indicator: c.indicator, verdict, texte: c.texte }];
      })
    : [];

  const text = (key: string) => (typeof v[key] === "string" ? (v[key] as string) : "");
  return {
    lecture: v.lecture,
    causes: v.causes,
    chaine: text("chaine"),
    scenario_confirmation: text("scenario_confirmation"),
    scenario_invalidation: text("scenario_invalidation"),
    consequences,
  };
}

/** L'état macro courant d'une devise, en quelques lignes lisibles par le modèle. */
function macroSnapshot(data: Record<string, unknown>, code: string): string {
  const pick = (key: string, unit = "") => {
    const value = data[key];
    return typeof value === "number" ? `${key} ${value}${unit}` : null;
  };
  const parts = [
    pick("interestRate", " %"),
    pick("cpi", " %"),
    pick("coreCpi", " %"),
    pick("unemployment", " %"),
    pick("gdpQoQ", " %"),
    pick("wagePPI", " %"),
    pick("retailSales", " %"),
  ].filter(Boolean);
  return `${code} — ${parts.join(" · ")}`;
}

export async function analyseRelease(
  userId: string,
  currency: string,
  nodeId: string,
): Promise<ReleaseAnalysisResult> {
  if (!geminiConfigured()) {
    return { ok: false, message: "La lecture IA n est pas activée sur ce serveur (GEMINI_API_KEY absente)." };
  }

  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [releases, currencies] = await Promise.all([
    getReleases(userId),
    getScoredCurrencies(userId),
  ]);

  const lit = litNodesFor(releases, currency, since, now).find((n) => n.nodeId === nodeId);
  if (!lit) return { ok: false, message: "Publication introuvable." };
  if (lit.surprise === null) {
    return { ok: false, message: "Pas de précédent : l'écart n'est pas calculable." };
  }

  const cascade = propagateCascade(nodeId, lit.surprise).slice(0, 8);
  if (cascade.length === 0) {
    return { ok: false, message: "Écart trop faible pour produire une cascade." };
  }

  const upcoming = upcomingByNode(releases, now);
  const scored = currencies[currency];

  const mechanics = cascade
    .map((impact) => {
      const next = upcoming.get(impact.targetId);
      const sense = impact.impact >= 0 ? "haussier" : "baissier";
      const when = next
        ? `prochaine publication le ${new Date(next.at).toLocaleDateString("fr-FR")}`
        : "pas de date connue";
      return `- ${impact.targetName} : le graphe prédit ${sense} (force ${Math.abs(impact.impact).toFixed(1)}, rang ${impact.depth}) · ${when}`;
    })
    .join("\n");

  const indicator = getIndicatorById(nodeId);

  const prompt = [
    `PUBLICATION QUI VIENT DE SORTIR — ${currency}`,
    `${lit.label} : ${lit.actual}${lit.previous !== null ? ` (précédent ${lit.previous})` : ""}`,
    indicator ? `Nature : ${indicator.fullName}` : "",
    "",
    "ÉTAT MACRO ACTUEL DE LA DEVISE :",
    scored ? macroSnapshot(scored as unknown as Record<string, unknown>, currency) : "indisponible",
    scored ? `Score macro global : ${scored.scores.total}/100` : "",
    "",
    "CE QUE LE GRAPHE À RÈGLES FIGÉES PRÉDIT :",
    mechanics,
    "",
    "Réponds avec cet objet JSON :",
    "{",
    '  "lecture": "Ce que ce chiffre dit VRAIMENT au vu de l\'état macro ci-dessus. Trois à cinq phrases.",',
    '  "causes": "Ce qui a probablement produit ce chiffre, et pourquoi cela change la suite. Deux à quatre phrases.",',
    '  "chaine": "L\'ENCHAÎNEMENT, raconté. Pars du chiffre, suis le fil d\'un indicateur à l\'autre en NOMMANT chaque étape et LA DATE à laquelle on la vérifiera, et dis à chaque maillon pourquoi il tient ou pourquoi il peut rompre. Cinq à huit phrases, en prose continue, pas en liste.",',
    '  "scenario_confirmation": "Le scénario où l\'enchaînement se confirme : quels chiffres, à quelles dates, et où finit la devise. Trois ou quatre phrases.",',
    '  "scenario_invalidation": "Le scénario où il casse : quels chiffres le démentiraient, à quelles dates, et ce que cela voudrait dire à la place. Trois ou quatre phrases.",',
    '  "consequences": [ { "indicator": "nom EXACT repris de la liste", "verdict": "confirme|nuance|contredit", "texte": "pourquoi, en une ou deux phrases" } ]',
    "}",
  ]
    .filter(Boolean)
    .join("\n");

  // GEMINI, pas Claude, et c est un choix de COÛT. Claude Opus est déjà
  // consommé par le briefing, et cette lecture se déclenche à chaque clic sur
  // une publication — le geste le plus fréquent de la page. Multiplié par
  // huit utilisateurs, il épuiserait le budget Anthropic sur une
  // fonctionnalité de confort. Gemini Flash suffit ici : la tâche est du
  // raisonnement sur des chiffres fournis, pas de la vision ni du débat.
  const { data, error } = await callGeminiStructured<Parsed>({
    system: SYSTEM,
    prompt,
    schema: SCHEMA,
    validate,
    maxTokens: 4000,
  });

  if (!data) return { ok: false, message: error ?? "Analyse impossible." };

  // Le modèle ne peut commenter que les conséquences qu'on lui a soumises : un
  // indicateur hors liste est écarté, pour que la lecture reste ancrée dans le
  // graphe plutôt que de partir librement.
  const byName = new Map(cascade.map((c) => [c.targetName, c]));
  const consequences: ConsequenceRead[] = data.consequences
    .filter((c) => byName.has(c.indicator))
    .map((c) => {
      const impact = byName.get(c.indicator)!;
      const next = upcoming.get(impact.targetId);
      return { ...c, at: next?.at ?? null };
    });

  return {
    ok: true,
    message: `${consequences.length} conséquence(s) analysée(s)`,
    lecture: data.lecture,
    causes: data.causes,
    chaine: data.chaine,
    scenarioConfirmation: data.scenario_confirmation,
    scenarioInvalidation: data.scenario_invalidation,
    consequences,
  };
}
