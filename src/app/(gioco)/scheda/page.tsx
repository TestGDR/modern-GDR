import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { EditCharacterForm } from "@/components/game/character-form";
import { CharacterSheet } from "@/components/game/character-sheet";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePlayer } from "@/lib/auth";
import { getCharacter, getDistricts } from "@/lib/data";

export const metadata: Metadata = { title: "La mia scheda" };

export default function SchedaPage() {
  return (
    <>
      <PageHeader title="La mia scheda" />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { character: mine } = await requirePlayer();
  const [character, districts] = await Promise.all([getCharacter(mine.id), getDistricts()]);
  if (!character) notFound();

  return (
    <CharacterSheet character={character} now={new Date()}>
      <section className="glass rounded-2xl p-6">
        <h3 className="mb-4 font-heading text-2xl tracking-wide text-peach">Modifica scheda</h3>
        <EditCharacterForm districts={districts} character={character} />
      </section>
    </CharacterSheet>
  );
}
