import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Megaphone, Pin, Star } from "lucide-react";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { MarkThreadRead } from "@/components/game/forum-client";
import { ReplyForm } from "@/components/game/forum-forms";
import { PostBody, ThreadModeration } from "@/components/game/forum-thread";
import { LoadingBlocks } from "@/components/game/loading";
import { activeCharacter, can, requirePlayer } from "@/lib/auth";
import { getBoard, getForumNav, getPosts, getThread } from "@/lib/data";
import { firstName, formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  const moderator = can(player, "forum.moderare");
  const canHighlight = can(player, "forum.segnalare");
  const [posts, nav] = await Promise.all([getPosts(thread.id), moderator ? getForumNav() : Promise.resolve([])]);
  const first = posts[0] ?? null;

  return (
    <>
      <MarkThreadRead threadId={thread.id} lastPost={posts.at(-1)?.created_at ?? null} />
      <Link href={`/forum/${board.slug}`} className="mb-2 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {board.name}
      </Link>
      <h1 className="mb-4 flex items-center gap-2 font-heading text-4xl tracking-wide text-sunset">
        {thread.is_pinned && <Pin className="size-6 shrink-0 text-peach" aria-label="Fissata in alto" />}
        {thread.is_important && <Star className="size-6 shrink-0 fill-peach text-peach" aria-label="Importante" />}
        {thread.is_locked && <Lock className="size-6 shrink-0 text-muted-foreground" aria-label="Chiusa" />}
        <span className="min-w-0 break-words">{thread.title}</span>
      </h1>

      {(moderator || canHighlight) && (
        <ThreadModeration
          thread={thread}
          boardSlug={board.slug}
          boards={nav.flatMap((s) => s.forum_boards.map((b) => ({ id: b.id, label: `${s.title} · ${b.name}` })))}
          canModerate={moderator}
          canHighlight={canHighlight}
          firstPost={first ? { id: first.id, highlighted: Boolean(first.highlighted_at) } : null}
        />
      )}

      <ol className="flex flex-col gap-3">
        {posts.map((post) => {
          const name = firstName(post.character?.name ?? post.author?.username) || "utente";
          const level = post.author?.level;
          const canEdit = moderator || post.author_id === player.userId;
          return (
            <li
              key={post.id}
              id={`post-${post.id}`}
              className={cn("glass flex scroll-mt-4 flex-col gap-3 rounded-2xl p-4 @xl:flex-row @xl:gap-4", post.highlighted_at && "border-peach/60")}
            >
              {/* autore: ritratto e nome */}
              <div className="flex shrink-0 items-center gap-2 @xl:w-20 @xl:flex-col @xl:gap-1 @xl:text-center">
                {post.character?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.character.avatar_url} alt="" className="size-10 rounded-xl object-cover ring-1 ring-white/15 @xl:size-16" />
                ) : (
                  <CharacterAvatar initials={initials(name)} className="size-10 rounded-xl @xl:size-16" />
                )}
                {post.character ? (
                  <Link href={`/scheda/${post.character.id}`} className="font-heading text-sm leading-tight tracking-wide break-words text-peach hover:underline">
                    {name}
                  </Link>
                ) : (
                  <span className="font-heading text-sm leading-tight tracking-wide break-words text-lavender">{name}</span>
                )}
                {level?.color && (
                  <span className="rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold" style={{ backgroundColor: `${level.color}33`, color: level.color }}>
                    {level.name}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-2 border-b border-white/10 pb-1.5 text-xs text-muted-foreground">
                  {formatDateTime(post.created_at)}
                  {post.edited_at && <i> · modificato il {formatDateTime(post.edited_at)}</i>}
                </p>
                {post.highlighted_at && (
                  <p className="mb-2 flex items-center gap-1.5 text-xs text-peach">
                    <Megaphone className="size-3.5" /> Segnalato a tutti{post.highlighted_by ? ` da ${post.highlighted_by}` : ""}
                  </p>
                )}
                <PostBody key={`${post.id}-${post.edited_at ?? ""}`} postId={post.id} body={post.body} canEdit={canEdit} />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="glass mt-4 rounded-2xl p-4">
        {thread.is_locked && !moderator ? (
          <p className="text-center text-sm text-muted-foreground">Discussione chiusa: non si può più rispondere.</p>
        ) : (
          <ReplyForm threadId={thread.id} characterName={character ? firstName(character.name) : null} onGame={board.section.is_on_game} />
        )}
      </div>
    </>
  );
}
