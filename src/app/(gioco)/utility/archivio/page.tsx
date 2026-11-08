import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { PlayArchive } from "@/components/game/play-archive";
import { BackToUtility } from "@/components/game/utility";
import { requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "Archivio giocate" };

export default function Page() {
  return (
    <>
      <BackToUtility />
      <PageHeader title="Archivio giocate" subtitle="Le giocate che hai salvato uscendo dalla chat: le vedi solo tu." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  await requirePlayer();
  return <PlayArchive />;
}
