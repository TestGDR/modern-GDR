import type { Metadata } from "next";
import { Suspense } from "react";
import { BusinessApp } from "@/components/game/business-app";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility } from "@/components/game/utility";
import { activeCharacter, requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "Attività" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Attività" subtitle="Compra un'attività in città, gestiscila ogni mese e incassa (o perdi)." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePlayer();
  return <BusinessApp characterId={activeCharacter(player)?.id ?? null} />;
}
