import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Pin } from "lucide-react";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { ReplyForm } from "@/components/game/forum-forms";
import { LoadingBlocks } from "@/components/game/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleThreadFlag } from "@/lib/actions/forum";
import { activeCharacter, can, requirePlayer } from "@/lib/auth";
import { getBoard, getPosts, getThread } from "@/lib/data";
import { formatDateTime, initials } from "@/lib/format";

export const metadata: Metadata = { title: "Forum" };

export default function ThreadPage({ params }: PageProps<"/forum/[bacheca]/[discussione]">) {
  return (
    <Suspense fallback={<LoadingBlocks />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/forum/[bacheca]/[discussione]">["params"] }) {
  const { bacheca, discussione } = await params;
  const player = await requirePlayer();
  const character = activeCharacter(player);
  const [thread, board] = await Promise.all([getThread(discussione), getBoard(bacheca)]);
  if (!thread || !board || thread.board_id !== board.id) notFound();
  const posts = await getPosts(thread.id);
  const staff = can(player, "contenuti.moderare");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href={`/forum/${board.slug}`} className="mb-3 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {board.name}
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <h1 className="flex items-center gap-2 font-heading text-4xl tracking-wide text-sunset">
          {thread.is_pinned && <Pin className="size-6 shrink-0 text-peach" />}
          {thread.is_locked && <Lock className="size-6 shrink-0 text-muted-foreground" />}
          {thread.title}
        </h1>
        {staff && (
          <div className="flex gap-2">
            <form action={toggleThreadFlag}>
              <input type="hidden" name="thread_id" value={thread.id} />
              <input type="hidden" name="flag" value="is_pinned" />
              <input type="hidden" name="value" value={String(!thread.is_pinned)} />
              <Button type="submit" variant="outline" size="sm">
                <Pin /> {thread.is_pinned ? "Togli evidenza" : "Metti in evidenza"}
              </Button>
            </form>
            <form action={toggleThreadFlag}>
              <input type="hidden" name="thread_id" value={thread.id} />
              <input type="hidden" name="flag" value="is_locked" />
              <input type="hidden" name="value" value={String(!thread.is_locked)} />
              <Button type="submit" variant="outline" size="sm">
                <Lock /> {thread.is_locked ? "Riapri" : "Chiudi"}
              </Button>
            </form>
          </div>
        )}
      </header>

      <ol className="flex flex-col gap-4">
        {posts.map((post) => {
          const name = post.character?.name ?? `@${post.author?.username ?? "utente"}`;
          const level = post.author?.level;
          return (
            <li key={post.id} className="glass rounded-2xl p-5">
              <div className="mb-3 flex items-center gap-3">
                <CharacterAvatar initials={initials(post.character?.name ?? post.author?.username ?? "?")} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {post.character ? (
                      <Link href={`/scheda/${post.character.id}`} className="text-peach hover:underline">
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                    {/* Badge del livello, se il livello ha un colore (es. Master, Moderatore) */}
                    {level?.color && (
                      <Badge style={{ backgroundColor: `${level.color}33`, color: level.color }}>{level.name}</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(post.created_at)}
                    {post.edited_at && " · modificato"}
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-line">{post.body}</p>
            </li>
          );
        })}
      </ol>

      <div className="glass mt-6 rounded-2xl p-5">
        {thread.is_locked && !staff ? (
          <p className="text-center text-sm text-muted-foreground">Discussione chiusa: non si può più rispondere.</p>
        ) : (
          <ReplyForm threadId={thread.id} characterName={character?.name ?? null} onGame={board.section.is_on_game} />
        )}
      </div>
    </div>
  );
}
