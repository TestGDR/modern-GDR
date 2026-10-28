import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { Send } from "lucide-react";
import { CharacterSheet } from "@/components/game/character-sheet";
import { LoadingBlocks } from "@/components/game/loading";
import { PageHeader } from "@/components/game/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requirePlayer } from "@/lib/auth";
import { getCharacter } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Scheda personaggio" };

export default function CharacterPage({ params }: PageProps<"/scheda/[id]">) {
  return (
    <>
      <PageHeader title="Scheda personaggio" />
      <Suspense fallback={<LoadingBlocks />}>
        <Content params={params} />
      </Suspense>
    </>
  );
}

async function Content({ params }: { params: PageProps<"/scheda/[id]">["params"] }) {
  const { id } = await params;
  const { character: mine } = await requirePlayer();
  if (id === mine?.id) redirect("/scheda");
  const character = await getCharacter(id);
  if (!character) notFound();

  return (
    <CharacterSheet character={character} now={new Date()}>
      {/* Per scrivere serve un proprio personaggio */}
      {mine && (
        <Link href={`/messaggi/${character.id}`} className={cn(buttonVariants({ size: "lg" }), "h-11 w-fit rounded-full px-6")}>
          <Send /> Scrivi a {character.name.split(" ")[0]}
        </Link>
      )}
    </CharacterSheet>
  );
}
