import type { Metadata } from "next";

import { Card, PageHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Méthodologie" };

const PILLARS = [
  {
    title: "1. Politique monétaire (35 %)",
    accent: "text-brand-blue",
    body: "Le moteur principal des tendances de change. On analyse les taux réels (nominal − inflation) et l'orientation de la banque centrale (hawkish / dovish), ainsi que le rang du différentiel de taux face aux sept autres devises.",
  },
  {
    title: "2. Croissance économique (30 %)",
    accent: "text-brand-green",
    body: "Les capitaux vont à la croissance. On suit le PIB trimestriel, les PMI composites (au-dessus de 50 = expansion) et la trajectoire du taux de chômage par rapport au NAIRU estimé du pays.",
  },
  {
    title: "3. Stabilité des prix (20 %)",
    accent: "text-brand-red",
    body: "On mesure l'écart à la cible de la banque centrale, et non l'inflation en valeur absolue. Une inflation élevée érode le rendement réel ; la déflation signale une récession. La cible retenue est celle du pays (2 % pour la plupart, 1 % pour la BNS, 2,5 % pour la RBA).",
  },
] as const;

export default function MethodologyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Méthodologie institutionnelle"
        subtitle="Comment le score 0–100 de chaque devise est construit"
      />

      <div className="space-y-4">
        {PILLARS.map((pillar) => (
          <Card key={pillar.title} className="p-6">
            <h2 className={`mb-2 text-xl font-bold ${pillar.accent}`}>{pillar.title}</h2>
            <p className="text-muted leading-relaxed">{pillar.body}</p>
          </Card>
        ))}
      </div>

      {/* This rule is the one that most changes the numbers, and it was only
       * documented in a code comment in the legacy app. It belongs on the page
       * that explains the score. */}
      <Card className="border-brand-amber/30 bg-brand-amber/5 p-6">
        <h2 className="text-brand-amber mb-2 text-xl font-bold">
          Règle centrale : une donnée absente est exclue
        </h2>
        <p className="text-muted leading-relaxed">
          Chaque devise possède son propre profil d&apos;indicateurs pondérés, dont la somme des
          poids fait 100. Le score est la moyenne pondérée des scores directionnels, chacun compris
          entre −10 et +10, puis normalisé sur 0–100.
        </p>
        <p className="text-muted mt-3 leading-relaxed">
          Lorsqu&apos;un indicateur n&apos;a pas de donnée, il est <strong>retiré du calcul</strong>{" "}
          : son poids sort du dénominateur au lieu d&apos;être compté comme un zéro. Compter zéro
          reviendrait à tirer artificiellement la devise vers le neutre, et une publication
          manquante changerait le score sans qu&apos;aucune donnée n&apos;ait bougé.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="text-fg mb-2 text-xl font-bold">Verdict</h2>
        <ul className="text-muted space-y-1 text-sm">
          <li>
            <span className="text-brand-cyan font-mono font-bold">≥ 70</span> — Achat fort
          </li>
          <li>
            <span className="text-brand-green font-mono font-bold">60 – 69</span> — Achat
          </li>
          <li>
            <span className="text-brand-amber font-mono font-bold">45 – 59</span> — Neutre
          </li>
          <li>
            <span className="text-brand-red/80 font-mono font-bold">30 – 44</span> — Vente
          </li>
          <li>
            <span className="text-brand-red font-mono font-bold">&lt; 30</span> — Vente forte
          </li>
        </ul>
      </Card>
    </div>
  );
}
