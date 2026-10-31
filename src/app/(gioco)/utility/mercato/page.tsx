import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { MarketApp } from "@/components/game/market-app";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility } from "@/components/game/utility";
import { activeCharacter, requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "Mercato" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Mercato" subtitle="Compra con il tuo conto: animali, veicoli, gioielli, elettronica, alcolici e sigarette." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePlayer();
  return <MarketApp characterId={activeCharacter(player)?.id ?? null} />;
}
