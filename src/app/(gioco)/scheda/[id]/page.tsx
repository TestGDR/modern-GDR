import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { OtherSheet } from "@/components/game/sheet-content";

export const metadata: Metadata = { title: "Scheda personaggio" };

export default function CharacterPage({ params }: PageProps<"/scheda/[id]">) {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/scheda/[id]">["params"] }) {
  const { id } = await params;
  return <OtherSheet id={id} variant="page" />;
}
