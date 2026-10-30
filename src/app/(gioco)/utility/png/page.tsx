import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { NpcsApp } from "@/components/game/npcs";
import { PageHeader } from "@/components/game/page-header";
import { BackToUtility } from "@/components/game/utility";
import { activeCharacter, can, requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "PNG" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="PNG" subtitle="I personaggi non giocanti: quelli della città e quelli legati ai giocatori." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const player = await requirePlayer();
  const me = activeCharacter(player);
  return <NpcsApp me={me ? { id: me.id, name: me.name } : null} canManage={can(player, "png.gestire")} />;
}
