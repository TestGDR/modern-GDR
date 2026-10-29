import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlocks } from "@/components/game/loading";
import { NeedsCharacter } from "@/components/game/needs-character";
import { PhoneApp } from "@/components/game/phone-app";
import { activeCharacter, requirePlayer } from "@/lib/auth";
import { isUuid } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Telefono" };

// /telefono?numero=<id>&chat=<id>: il telefono del personaggio, eventualmente
// con una conversazione già aperta (es. rispondendo a una chiamata)
export default function TelefonoPage({ searchParams }: PageProps<"/telefono">) {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/telefono">["searchParams"] }) {
  const params = await searchParams;
  const player = await requirePlayer();
  const character = activeCharacter(player);
  const pick = (v: string | string[] | undefined) => (typeof v === "string" && isUuid(v) ? v : null);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-3xl tracking-wide">Telefono</h1>
      {character ? (
        <Phone
          userId={player.userId}
          characterId={character.id}
          numberId={pick(params.numero)}
          threadId={pick(params.chat)}
        />
      ) : (
        <NeedsCharacter className="glass rounded-2xl" text="Il telefono si attiva quando la scheda del personaggio è approvata. Intanto puoi scrivere ai giocatori nei messaggi OFF." />
      )}
      <p className="text-xs text-muted-foreground">Nota: lo staff autorizzato può leggere i messaggi del telefono per far rispettare il regolamento.</p>
    </div>
  );
}

async function Phone({ userId, characterId, numberId, threadId }: { userId: string; characterId: string; numberId: string | null; threadId: string | null }) {
  const supabase = await createClient();
  const { data } = await supabase.from("game_settings").select("value").eq("key", "max_numeri_telefono").maybeSingle<{ value: number }>();
  return (
    <PhoneApp
      key={`${numberId ?? ""}:${threadId ?? ""}`}
      userId={userId}
      characterId={characterId}
      maxNumbers={Math.max(1, Number(data?.value ?? 3))}
      initialNumber={numberId}
      initialThread={threadId}
    />
  );
}
