import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { SportApp } from "@/components/sport/sport-app";
import { activeCharacter, requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "Sport" };

// Athletic Department: il mio sport, le squadre, calendari, classifiche e premi
export default function SportPage() {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const player = await requirePlayer();
  const mine = activeCharacter(player);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="font-heading text-3xl tracking-wide">Athletic Department</h1>
        <p className="text-sm text-muted-foreground">Le squadre dell&apos;università: entra in uno sport, segui calendario, risultati e classifiche.</p>
      </div>
      <SportApp characterId={mine?.id ?? null} />
    </div>
  );
}
