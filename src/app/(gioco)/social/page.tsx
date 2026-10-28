import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Heart, MapPin, MessageCircle, Trash2 } from "lucide-react";
import { CharacterAvatar } from "@/components/game/character-avatar";
import { EmptyState, LoadingBlocks } from "@/components/game/loading";
import { NeedsCharacter } from "@/components/game/needs-character";
import { PageHeader } from "@/components/game/page-header";
import { CommentForm, NewPostForm } from "@/components/game/social-forms";
import { Palm } from "@/components/scenery/palm";
import { deletePost, toggleLike } from "@/lib/actions/social";
import { requirePlayer } from "@/lib/auth";
import { getFeed, type FeedPost } from "@/lib/data";
import { gradientFor, initials, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Social" };

export default function SocialPage() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader title="Social" subtitle="Il feed dei personaggi di Miami." />
      <Suspense fallback={<LoadingBlocks />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const { character, userId } = await requirePlayer();
  const posts = await getFeed();
  const now = new Date();

  return (
    <>
      {character ? (
        <div className="glass mb-6 flex gap-3 rounded-2xl p-4">
          <CharacterAvatar initials={initials(character.name)} />
          <NewPostForm firstName={character.name.split(" ")[0]} />
        </div>
      ) : (
        <NeedsCharacter className="glass mb-6 rounded-2xl" text="Per pubblicare, mettere mi piace e commentare completa prima la scheda del tuo personaggio." />
      )}

      {posts.length === 0 && <EmptyState title="Ancora nessun post">Pubblica tu il primo.</EmptyState>}

      <div className="flex flex-col gap-6">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} myCharacterId={character?.id ?? null} myUserId={userId} now={now} />
        ))}
      </div>
    </>
  );
}

type PostCardProps = { post: FeedPost; myCharacterId: string | null; myUserId: string; now: Date };

function PostCard({ post, myCharacterId, myUserId, now }: PostCardProps) {
  const liked = post.social_likes.some((l) => l.character_id === myCharacterId);
  const authorName = post.character?.name ?? "…";

  return (
    <article className="glass overflow-hidden rounded-2xl">
      <header className="flex items-center gap-3 p-4">
        <CharacterAvatar initials={initials(authorName)} />
        <div className="min-w-0 flex-1">
          <Link href={`/scheda/${post.character_id}`} className="truncate font-semibold hover:underline">
            {authorName}
          </Link>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {post.location && (
              <>
                <MapPin className="size-3" /> {post.location} ·
              </>
            )}{" "}
            {timeAgo(post.created_at, now)}
          </p>
        </div>
        {post.author_id === myUserId && (
          <form action={deletePost}>
            <input type="hidden" name="post_id" value={post.id} />
            <button type="submit" className="rounded-full p-2 text-muted-foreground hover:bg-white/10 hover:text-destructive" aria-label="Elimina post">
              <Trash2 className="size-4" />
            </button>
          </form>
        )}
      </header>

      {/* Cartolina decorativa al posto della foto */}
      <div className={`relative aspect-[16/9] overflow-hidden bg-gradient-to-b ${gradientFor(post.id)}`}>
        <div className="absolute bottom-[18%] left-1/2 size-20 -translate-x-1/2 rounded-full bg-sand/70 blur-sm" />
        <div className="absolute inset-x-0 bottom-0 h-[20%] bg-gradient-to-b from-violet/70 to-dusk" />
        <Palm className="absolute -bottom-1 -left-8 h-[90%] text-palm" lean={20} />
        <Palm className="absolute right-2 -bottom-1 h-[60%] text-palm/80" lean={-10} />
      </div>

      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm leading-relaxed whitespace-pre-line">{post.body}</p>
        <div className="flex gap-5 text-sm text-muted-foreground">
          {myCharacterId ? (
            <form action={toggleLike}>
              <input type="hidden" name="post_id" value={post.id} />
              <input type="hidden" name="liked" value={String(liked)} />
              <button type="submit" className={cn("flex items-center gap-1.5 hover:text-flamingo", liked && "text-flamingo")} aria-pressed={liked}>
                <Heart className={cn("size-4", liked && "fill-current")} /> {post.social_likes.length}
              </button>
            </form>
          ) : (
            <span className="flex items-center gap-1.5">
              <Heart className="size-4" /> {post.social_likes.length}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <MessageCircle className="size-4" /> {post.social_comments.length}
          </span>
        </div>

        {post.social_comments.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-border pt-3">
            {post.social_comments.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-semibold text-peach">{c.character?.name ?? "…"}</span> {c.body}
                <span className="ml-2 text-xs text-muted-foreground">{timeAgo(c.created_at, now)}</span>
              </li>
            ))}
          </ul>
        )}
        {myCharacterId && <CommentForm postId={post.id} />}
      </div>
    </article>
  );
}
