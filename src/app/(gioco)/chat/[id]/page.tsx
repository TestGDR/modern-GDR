import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/game/chat-room";
import { activeCharacter, can, requirePlayer } from "@/lib/auth";
import { getChatRoom, getRulesData } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chat" };

// La stanza occupa tutto lo spazio sotto la barra in alto
const roomHeight =
  "-mx-4 -my-6 flex h-[calc(100dvh-5rem-env(safe-area-inset-top))] flex-col sm:-mx-6 lg:mx-0 lg:my-0 lg:h-[calc(100dvh-6rem-4rem)]";

export default function ChatRoomPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <div className={roomHeight}>
      <Suspense fallback={<div className="glass flex-1 animate-pulse lg:rounded-2xl" />}>
        <Room params={params} />
      </Suspense>
    </div>
  );
}

async function Room({ params }: { params: PageProps<"/chat/[id]">["params"] }) {
  const { id } = await params;
  const player = await requirePlayer();
  const character = activeCharacter(player);
  const [data, rules] = await Promise.all([getChatRoom(id, character?.id ?? null), getRulesData()]);
  if (!data) notFound();

  // Proprietario della chat su invito (il suo nome si mostra nella barra degli ospiti)
  let ownerName: string | null = null;
  if (data.room.owner_character_id) {
    const supabase = await createClient();
    const { data: owner } = await supabase
      .from("characters")
      .select("name")
      .eq("id", data.room.owner_character_id)
      .maybeSingle<{ name: string }>();
    ownerName = owner?.name ?? null;
  }

  return (
    <ChatRoom
      // una chat diversa riparte da zero
      key={data.room.id}
      data={data}
      me={character ? { id: character.id, name: character.name } : null}
      canNarrate={can(player, "chat.narrazione")}
      canModerate={can(player, "chat.moderare")}
      canInvisible={can(player, "staff.invisibile")}
      canDice={can(player, "dadi.tirare")}
      isOwner={!!character && data.room.owner_character_id === character.id}
      ownerName={ownerName}
      attributes={rules.attributes.map((a) => ({ id: a.id, code: a.code, name: a.name }))}
      skills={rules.skills.map((s) => ({ id: s.id, name: s.name, attribute_id: s.attribute_id }))}
    />
  );
}
