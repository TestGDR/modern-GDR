import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { NeedsCharacter } from "@/components/game/needs-character";
import { StudentPanel } from "@/components/university/student-panel";
import { activeCharacter, requirePlayer } from "@/lib/auth";

export const metadata: Metadata = { title: "Università" };

// Università del proprio personaggio (lo staff può aprire quella di un altro con ?pg=<id>)
export default function UniversitaPage({ searchParams }: { searchParams?: Promise<{ pg?: string }> }) {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams?: Promise<{ pg?: string }> }) {
  const [player, params] = await Promise.all([requirePlayer(), searchParams ?? Promise.resolve({ pg: undefined })]);
  const mine = activeCharacter(player);
  // il permesso di vedere un altro lo controlla il database (academic_overview)
  const id = params.pg ?? mine?.id;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="font-heading text-3xl tracking-wide">Università</h1>
        <p className="text-sm text-muted-foreground">Corsi, compiti, esami e pagelle del college.</p>
      </div>
      {id ? (
        <StudentPanel characterId={id} isOwner={id === mine?.id} />
      ) : (
        <NeedsCharacter className="glass rounded-2xl" text="Per iscriverti ai corsi serve un personaggio approvato." />
      )}
    </div>
  );
}
