import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { LoadingBlocks } from "@/components/game/loading";
import { MessagesShell } from "@/components/game/messages-shell";
import { NeedsCharacter } from "@/components/game/needs-character";
import { PrivateChat } from "@/components/game/private-chat";
import { requirePlayer } from "@/lib/auth";
import { getCharacter, getConversations, getMessagesWith } from "@/lib/data";
import { initials, isOnline } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messaggi" };

export default function ConversationPage({ params }: PageProps<"/messaggi/[id]">) {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/messaggi/[id]">["params"] }) {
  const { id } = await params;
  const { character } = await requirePlayer();
  if (!character) {
    return <NeedsCharacter className="glass rounded-2xl" text="I messaggi privati si scambiano tra personaggi: crea il tuo per iniziare a scrivere." />;
  }
  const other = await getCharacter(id);
  if (!other || other.id === character.id) notFound();

  // Aprendo la conversazione, i messaggi ricevuti diventano "letti"
  const supabase = await createClient();
  await supabase
    .from("private_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", character.id)
    .eq("sender_id", other.id)
    .is("read_at", null);

  const [conversations, messages] = await Promise.all([
    getConversations(character.id),
    getMessagesWith(character.id, other.id),
  ]);
  const now = new Date();

  return (
    <MessagesShell conversations={conversations} myCharacterId={character.id} activeId={other.id} now={now}>
      <div className="glass -mx-4 -my-6 flex h-[calc(100dvh-3.5rem-4.5rem-env(safe-area-inset-bottom))] flex-col overflow-hidden sm:-mx-6 lg:m-0 lg:h-full lg:rounded-2xl">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Link href="/messaggi" className="rounded-full p-1.5 hover:bg-white/10 lg:hidden" aria-label="Torna ai messaggi">
            <ArrowLeft className="size-5" />
          </Link>
          <Link href={`/scheda/${other.id}`} className="flex min-w-0 items-center gap-3">
            <CharacterAvatar initials={initials(other.name)} online={isOnline(other.last_seen_at, now)} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{other.name}</p>
              <p className="truncate text-xs text-muted-foreground">{other.occupation ?? "—"}</p>
            </div>
          </Link>
        </header>
        <PrivateChat key={other.id} myId={character.id} otherId={other.id} initialMessages={messages} />
      </div>
    </MessagesShell>
  );
}
