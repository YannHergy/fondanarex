import type { Metadata } from "next";

import { GearGraph } from "@/app/(app)/engrenage/_components/gear-graph";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { FUNDAMENTAL_CONNECTIONS } from "@/domain/data/fundamental-connections";
import { FUNDAMENTAL_INDICATORS } from "@/domain/data/fundamental-indicators";
import {
  litNodesFor,
  upcomingByNode,
  type LitNode,
} from "@/domain/fundamental/release-bridge";
import { getReleases } from "@/lib/releases";
import { requireUserId } from "@/lib/session";
import { CURRENCY_CODES, isCurrencyCode } from "@/lib/utils";

export const metadata: Metadata = { title: "Engrenage" };

export default async function GearPage({
  searchParams,
}: {
  searchParams: Promise<{ devise?: string }>;
}) {
  const userId = await requireUserId();
  const { devise } = await searchParams;

  /**
   * Fenêtre d'un mois, contre sept jours auparavant.
   *
   * Sept jours ne montraient qu'UNE publication pour l'USD et AUCUNE pour six
   * devises sur huit — mesuré le 2026-08-18. Un engrenage sans engrenage
   * allumé : rien à voir, et surtout rien à comparer.
   *
   * Trente jours en font apparaître cinq pour l'USD, deux pour l'AUD, deux
   * pour le CAD, une pour l'EUR et le NZD. C'est ce volume qui rend possible
   * la lecture d'ensemble — les publications du mois se confirment-elles ou se
   * contredisent-elles ? — que produit `summariseDirection`.
   *
   * Élargir davantage ne servirait à rien : `getReleases` ne garde qu'UNE
   * publication par (devise, indicateur), et soixante jours ne ramènent pas
   * une ligne de plus. C'est le plafond réel de cet historique.
   */
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const releases = await getReleases(userId);
  const litByCurrency: Record<string, LitNode[]> = Object.fromEntries(
    CURRENCY_CODES.map((code) => [code, litNodesFor(releases, code, since, now)]),
  );

  const upcoming = Object.fromEntries(upcomingByNode(releases, now));

  const currency =
    devise && isCurrencyCode(devise.toUpperCase()) ? devise.toUpperCase() : "USD";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Engrenage fondamental"
        subtitle={`${FUNDAMENTAL_INDICATORS.length} indicateurs · ${FUNDAMENTAL_CONNECTIONS.length} connexions`}
      />

      <Card className="border-brand-blue/30 bg-brand-blue/5">
        <div className="flex items-start gap-2.5">
          <Icon name="info" size={16} className="text-brand-blue mt-0.5 shrink-0" />
          <p className="text-muted text-sm leading-relaxed">
            Le graphe se lit de bas en haut : les <strong>racines</strong> (pétrole, PMI Chine, VIX)
            alimentent les <strong>signaux</strong>, qui alimentent les <strong>moteurs</strong>,
            puis les trois <strong>piliers</strong>, et enfin la <strong>direction</strong> de la
            devise. Les indicateurs GLOBAL apparaissent sur chaque graphe car ils alimentent
            plusieurs devises.
          </p>
        </div>
      </Card>

      <GearGraph defaultCurrency={currency} litByCurrency={litByCurrency} upcoming={upcoming} />
    </div>
  );
}
