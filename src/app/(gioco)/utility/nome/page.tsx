import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility, NameChange } from "@/components/game/utility";
import { requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "Cambio nome" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Cambio nome" subtitle="Nome e cognome del personaggio: si cambiano una volta sola." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePlayer();
  return <NameChange current={player.profile.username} changedAt={player.profile.name_changed_at} />;
}
