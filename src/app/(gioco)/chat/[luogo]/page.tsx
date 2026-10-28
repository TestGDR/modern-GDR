import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ChatRoom } from "@/components/game/chat-room";
import { activeCharacter, requirePlayer } from "@/lib/auth";
import { getChatMessages, getPlaceBySlug } from "@/lib/data";

export const metadata: Metadata = { title: "Chat" };

// Su mobile la stanza occupa lo spazio tra barra in alto e barra in basso
const roomHeight =
  "-mx-4 -my-6 flex h-[calc(100dvh-3.5rem-4.5rem-env(safe-area-inset-bottom))] flex-col sm:-mx-6 lg:mx-0 lg:my-0 lg:h-[calc(100dvh-5rem)]";

export default function ChatRoomPage({ params }: PageProps<"/chat/[luogo]">) {
  return (
    <div className={roomHeight}>
      <Suspense fallback={<div className="glass flex-1 animate-pulse lg:rounded-2xl" />}>
        <Room params={params} />
      </Suspense>
    </div>
  );
}

async function Room({ params }: { params: PageProps<"/chat/[luogo]">["params"] }) {
  const { luogo } = await params;
  const character = activeCharacter(await requirePlayer());
  const place = await getPlaceBySlug(luogo);
  if (!place) notFound();
  const messages = await getChatMessages(place.id);

  return (
    <>
      <header className={`relative overflow-hidden bg-gradient-to-r px-4 py-3 sm:px-6 lg:rounded-t-2xl ${place.district.gradient}`}>
        <div className="absolute inset-0 bg-night/30" />
        <div className="relative flex items-center gap-3">
          <Link href="/chat" className="rounded-full p-1.5 text-white/90 hover:bg-white/15" aria-label="Torna ai luoghi">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs tracking-widest text-white/80 uppercase">{place.district.name}</p>
            <h1 className="truncate font-heading text-3xl leading-none tracking-wide text-white">{place.name}</h1>
          </div>
        </div>
        {place.description && <p className="relative mt-1 hidden text-sm text-white/85 sm:block">{place.description}</p>}
      </header>

      <ChatRoom
        placeId={place.id}
        isOpen={place.is_open}
        me={character ? { id: character.id, name: character.name } : null}
        initialMessages={messages}
      />
    </>
  );
}
