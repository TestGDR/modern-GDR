import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { CreateCharacterForm } from "@/components/game/character-form";
import { DuskBackdrop } from "@/components/scenery/sunset-sky";
import { getPlayer } from "@/lib/auth";
import { getDistricts } from "@/lib/data";

export const metadata: Metadata = { title: "Crea il tuo personaggio" };

async function Content() {
  const player = await getPlayer();
  if (!player) redirect("/login");
  if (player.character) redirect("/bacheca");
  const districts = await getDistricts();

  return (
    <>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Ciao <span className="font-semibold text-foreground">{player.profile.username}</span>, chi sarai a Miami?
      </p>
      <CreateCharacterForm districts={districts} />
    </>
  );
}

export default function CreaPersonaggioPage() {
  return (
    <main className="relative flex flex-1 justify-center px-4 py-10">
      <DuskBackdrop />
      <div className="glass w-full max-w-xl rounded-3xl p-6 sm:p-8">
        <div className="mb-4 text-center">
          <Logo size="sm" className="items-center" />
          <h1 className="mt-6 font-heading text-4xl tracking-wide text-sunset">Crea il tuo personaggio</h1>
        </div>
        <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Caricamento…</p>}>
          <Content />
        </Suspense>
      </div>
    </main>
  );
}
