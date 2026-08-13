import type { Metadata } from "next";

import { GearGraph } from "@/app/(app)/engrenage/_components/gear-graph";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { FUNDAMENTAL_CONNECTIONS } from "@/domain/data/fundamental-connections";
import { FUNDAMENTAL_INDICATORS } from "@/domain/data/fundamental-indicators";
import { litNodesFor, type LitNode } from "@/domain/fundamental/release-bridge";
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

  // Fenêtre de sept jours : au-delà, une publication appartient au contexte,
  // plus à « ce qui vient de tomber ».
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const releases = await getReleases(userId);
  const litByCurrency: Record<string, LitNode[]> = Object.fromEntries(
    CURRENCY_CODES.map((code) => [code, litNodesFor(releases, code, since, now)]),
  );

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

      <GearGraph defaultCurrency={currency} litByCurrency={litByCurrency} />
    </div>
  );
}
