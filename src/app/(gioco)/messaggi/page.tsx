import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Send } from "lucide-react";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { LoadingBlocks } from "@/components/game/loading";
import { MessagesShell } from "@/components/game/messages-shell";
import { NeedsCharacter } from "@/components/game/needs-character";
import { requirePlayer } from "@/lib/auth";
import { getAllCharacters, getConversations } from "@/lib/data";
import { initials, isOnline } from "@/lib/format";
import { requestTime } from "@/lib/request-time";

export const metadata: Metadata = { title: "Messaggi" };

export default function MessaggiPage() {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const { character } = await requirePlayer();
  if (!character) return <NoCharacter />;
  const [conversations, everyone] = await Promise.all([getConversations(character.id), getAllCharacters()]);
  const others = everyone.filter((c) => c.id !== character.id);
  const now = await requestTime();

  return (
    <MessagesShell conversations={conversations} myCharacterId={character.id} now={now}>
      <div className="glass flex flex-1 flex-col rounded-2xl p-6">
        <div className="mb-6 text-center">
          <Send className="mx-auto mb-3 size-10 text-flamingo" />
          <p className="font-heading text-2xl tracking-wide">Nuovo messaggio</p>
          <p className="text-sm text-muted-foreground">Scegli a chi scrivere. I messaggi privati li leggete solo voi due.</p>
        </div>
        {others.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">Non ci sono ancora altri personaggi a Miami.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {others.map((c) => (
              <li key={c.id}>
                <Link href={`/messaggi/${c.id}`} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 hover:bg-white/10">
                  <CharacterAvatar initials={initials(c.name)} online={isOnline(c.last_seen_at, now)} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.occupation ?? "—"}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MessagesShell>
  );
}

function NoCharacter() {
  return (
    <>
      <h1 className="mb-6 font-heading text-4xl tracking-wide text-sunset sm:text-5xl">Messaggi</h1>
      <NeedsCharacter className="glass rounded-2xl" text="I messaggi privati si scambiano tra personaggi: completa la scheda del tuo per iniziare a scrivere." />
    </>
  );
}
