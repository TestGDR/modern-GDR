import type { Metadata } from "next";
import { Suspense } from "react";
import { HomesApp } from "@/components/game/homes-app";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility } from "@/components/game/utility";
import { activeCharacter, requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "Case" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Case" subtitle="Compra o prendi in affitto una casa a Miami, con il tuo conto in banca." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePlayer();
  return <HomesApp characterId={activeCharacter(player)?.id ?? null} />;
}
