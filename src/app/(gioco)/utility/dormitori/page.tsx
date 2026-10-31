import type { Metadata } from "next";
import { Suspense } from "react";
import { DormsApp } from "@/components/game/dorms-app";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility } from "@/components/game/utility";
import { activeCharacter, requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "Dormitori" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Dormitori" subtitle="Le camere del college: la retta è compresa nel tuo patrimonio." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePlayer();
  return <DormsApp characterId={activeCharacter(player)?.id ?? null} />;
}
