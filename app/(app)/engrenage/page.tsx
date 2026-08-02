import type { Metadata } from "next";

import { GearGraph } from "@/app/(app)/engrenage/_components/gear-graph";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { FUNDAMENTAL_CONNECTIONS } from "@/domain/data/fundamental-connections";
import { FUNDAMENTAL_INDICATORS } from "@/domain/data/fundamental-indicators";
import { requireUserId } from "@/lib/session";
import { isCurrencyCode } from "@/lib/utils";

export const metadata: Metadata = { title: "Engrenage" };

export default async function GearPage({
  searchParams,
}: {
  searchParams: Promise<{ devise?: string }>;
}) {
  await requireUserId();
  const { devise } = await searchParams;

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

      <GearGraph defaultCurrency={currency} />
    </div>
  );
}
