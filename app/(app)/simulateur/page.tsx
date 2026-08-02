import type { Metadata } from "next";

import {
  BreakevenSimulator,
  CompoundSimulator,
  RiskCalculator,
} from "@/app/(app)/simulateur/_components/simulators";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { requireUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Simulateur" };

export default async function SimulatorPage() {
  await requireUserId();

  const [settings, instruments] = await Promise.all([
    getSettings(),
    prisma.instrument.findMany({
      where: { isActive: true },
      orderBy: { symbol: "asc" },
      select: { symbol: true, pipSize: true, contractSize: true },
    }),
  ]);

  // Decimal columns come back as Prisma Decimal; the domain works in numbers.
  const specs = instruments.map((i) => ({
    symbol: i.symbol,
    pipSize: Number(i.pipSize),
    contractSize: Number(i.contractSize),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-5 md:p-6">
      <PageHeader
        title="Simulateur"
        subtitle="Dimensionnement, projection composée et arbitrage d'entrée"
      />

      <Card className="border-brand-blue/30 bg-brand-blue/5">
        <div className="flex items-start gap-2.5">
          <Icon name="info" size={16} className="text-brand-blue mt-0.5 shrink-0" />
          <p className="text-muted text-sm leading-relaxed">
            La valeur du pip est calculée depuis la fiche de l&apos;instrument
            (<span className="font-mono text-xs">pipSize × contractSize</span>), jamais depuis une
            constante. L&apos;ancienne version supposait « 1 pip = 10 $ par lot » et déduisait le
            diviseur du nom du symbole, ce qui était faux — silencieusement — pour tout instrument
            dont la taille de contrat diffère.
          </p>
        </div>
      </Card>

      <RiskCalculator
        defaults={{
          riskCapital: settings.riskCapital,
          riskPct: settings.riskPct,
          riskRR: settings.riskRR,
        }}
        instruments={specs}
      />

      <CompoundSimulator defaultCapital={settings.riskCapital} />

      <BreakevenSimulator defaultCapital={settings.riskCapital} />
    </div>
  );
}
