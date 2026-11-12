import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { PressApp } from "@/components/press/press-app";
import { activeCharacter, requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "Campus Wire" };

// Giornale e podcast del college
export default function GiornalePage() {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const player = await requirePlayer();
  const pg = activeCharacter(player);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Campus Wire</h1>
      <PressApp me={pg ? { id: pg.id, name: pg.name } : null} />
    </div>
  );
}
