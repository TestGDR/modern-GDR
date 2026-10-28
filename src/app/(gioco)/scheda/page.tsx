import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CreateCharacterForm, EditCharacterForm } from "@/components/game/character-form";
import { CharacterSheet } from "@/components/game/character-sheet";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { requirePlayer } from "@/lib/auth";
import { getCharacter, getDistricts } from "@/lib/data";

export const metadata: Metadata = { title: "Scheda personaggio" };

export default function SchedaPage() {
  return (
    <>
      <PageHeader title="Scheda personaggio" />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { character: mine, profile } = await requirePlayer();
  const districts = await getDistricts();

  // Nessun personaggio: si crea qui
  if (!mine) {
    return (
      <div className="glass mx-auto w-full max-w-xl rounded-3xl p-6 sm:p-8">
        <h2 className="font-heading text-3xl tracking-wide text-peach">Crea il tuo personaggio</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Ciao <span className="font-semibold text-foreground">{profile.username}</span>, chi sarai a Miami?
        </p>
        <CreateCharacterForm districts={districts} />
      </div>
    );
  }

  const character = await getCharacter(mine.id);
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
